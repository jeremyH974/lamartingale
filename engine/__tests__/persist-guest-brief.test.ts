import { describe, it, expect, vi } from 'vitest';
import {
  persistGuestBrief,
  type PersistGuestBriefDeps,
} from '@engine/agents/wrappers/persistGuestBrief';
import type {
  GuestBriefOutput,
  GuestBriefInput,
  GuestBriefConfig,
} from '@engine/agents/guestBriefAgent';

type RunAgentFn = (input: GuestBriefInput, config: GuestBriefConfig) => Promise<GuestBriefOutput>;

// Helpers ---------------------------------------------------------------------

function makeMockBrief(): GuestBriefOutput {
  return {
    briefMd: '# Mock Brief',
    keyPositions: [
      {
        position: 'mock pos',
        context: 'ctx',
        source_episode_id: 1,
        source_podcast: 'gdiy',
        confidence: 0.8,
      },
    ],
    quotes: [{ text: 'quote', source_episode_id: 1, source_podcast: 'gdiy', context: 'c' }],
    originalQuestions: [{ question: 'q?', rationale: 'r', depth_score: 'high' }],
    metadata: { sourcesUsed: 0, sourceQualityAvg: 0, llmModel: 'sonnet', generationTimeMs: 0 },
  };
}

function makeRichEpisode(id: number, tenant: string, epNum: number, daysAgo: number) {
  const date = new Date(Date.now() - daysAgo * 86400000).toISOString();
  return {
    id,
    tenant_id: tenant,
    episode_number: epNum,
    title: `Ep ${epNum}`,
    date_created: date,
    article_content: 'A'.repeat(1500),
    chapters: null,
    key_takeaways: null,
    rss_description: null,
  };
}

// Test 1 — Happy path mocké ---------------------------------------------------

describe('persistGuestBrief — happy path mocké', () => {
  it('orchestre fetch → agent → update et retourne un résultat conforme', async () => {
    const updateSpy = vi.fn(async () => undefined);
    const runAgentSpy = vi.fn<RunAgentFn>(async () => makeMockBrief());

    const deps: PersistGuestBriefDeps = {
      fetchGuest: async () => ({
        id: 434,
        canonical_name: 'eric larcheveque',
        display_name: 'Eric Larchevêque',
        linkedin_url: 'https://www.linkedin.com/in/ericlarch/',
        tenant_appearances: [
          { tenant_id: 'gdiy', episode_numbers: [243] },
          { tenant_id: 'lamartingale', episode_numbers: [3] },
          { tenant_id: 'passionpatrimoine', episode_numbers: [26] },
        ],
      }),
      fetchEpisodes: async () => [
        makeRichEpisode(2206, 'gdiy', 243, 1500),
        makeRichEpisode(925, 'lamartingale', 3, 2500),
        makeRichEpisode(3136, 'passionpatrimoine', 26, 700),
      ],
      updateBrief: updateSpy,
      runAgent: runAgentSpy,
      llmFn: async () => '',
      costEstimator: () => 0,
    };

    const result = await persistGuestBrief(
      { guestId: 434, llmModel: 'sonnet' },
      deps,
    );

    expect(result.guestName).toBe('Eric Larchevêque');
    expect(result.episodesUsed).toBe(3);
    expect(result.totalEpisodesAvailable).toBe(3);
    expect(result.persisted).toBe(true);
    expect(updateSpy).toHaveBeenCalledOnce();
    expect(updateSpy).toHaveBeenCalledWith(434, expect.any(Object), 'claude-sonnet-4-6');
    // Agent reçoit les episodes triés DESC par date — pp (700d) en 1er, gdiy (1500d) puis lm (2500d)
    const agentInput = runAgentSpy.mock.calls[0]![0];
    expect(agentInput.episodes).toHaveLength(3);
    expect(agentInput.episodes[0].podcast_id).toBe('passionpatrimoine');
    expect(agentInput.episodes[2].podcast_id).toBe('lamartingale');
  });
});

// Test 2 — Cap maxEpisodes ----------------------------------------------------

describe('persistGuestBrief — cap maxEpisodes', () => {
  it('cape à 10 plus récents si guest a 15 épisodes', async () => {
    const runAgentSpy = vi.fn<RunAgentFn>(async () => makeMockBrief());
    const fetchedPairs: Array<{ tenant_id: string; episode_number: number }> = [];

    const deps: PersistGuestBriefDeps = {
      fetchGuest: async () => ({
        id: 999,
        canonical_name: 'mock',
        display_name: 'Mock Heavy Guest',
        linkedin_url: null,
        tenant_appearances: [
          { tenant_id: 'gdiy', episode_numbers: Array.from({ length: 15 }, (_, i) => i + 1) },
        ],
      }),
      fetchEpisodes: async (pairs) => {
        fetchedPairs.push(...pairs);
        // Episodes 1..15 avec date_created croissante (ep 15 = plus récent)
        return Array.from({ length: 15 }, (_, i) =>
          makeRichEpisode(1000 + i, 'gdiy', i + 1, 1000 - i * 10),
        );
      },
      updateBrief: async () => undefined,
      runAgent: runAgentSpy,
      llmFn: async () => '',
      costEstimator: () => 0,
    };

    const result = await persistGuestBrief(
      { guestId: 999, llmModel: 'haiku' },
      deps,
    );

    expect(result.totalEpisodesAvailable).toBe(15);
    expect(result.episodesUsed).toBe(10);
    const agentInput = runAgentSpy.mock.calls[0]![0];
    expect(agentInput.episodes).toHaveLength(10);
    // Le plus récent (ep 15, daysAgo = 1000 - 14*10 = 860) doit être en 1er
    expect(agentInput.episodes[0].episode_id).toBe(1014);
    // Le plus ancien gardé doit être ep 6 (daysAgo = 1000 - 5*10 = 950)
    expect(agentInput.episodes[9].episode_id).toBe(1005);
  });
});

// Test 3 — dryRun -------------------------------------------------------------

describe('persistGuestBrief — dryRun', () => {
  it('ne persiste pas en DB mais retourne le brief calculé', async () => {
    const updateSpy = vi.fn(async () => undefined);
    const deps: PersistGuestBriefDeps = {
      fetchGuest: async () => ({
        id: 434,
        canonical_name: 'eric larcheveque',
        display_name: 'Eric Larchevêque',
        linkedin_url: null,
        tenant_appearances: [{ tenant_id: 'gdiy', episode_numbers: [243] }],
      }),
      fetchEpisodes: async () => [makeRichEpisode(2206, 'gdiy', 243, 100)],
      updateBrief: updateSpy,
      runAgent: async () => makeMockBrief(),
      costEstimator: () => 0,
    };

    const result = await persistGuestBrief(
      { guestId: 434, dryRun: true },
      deps,
    );

    expect(result.persisted).toBe(false);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(result.brief.briefMd).toBe('# Mock Brief');
  });
});

// Test 4 — Garde-fous ---------------------------------------------------------

describe('persistGuestBrief — garde-fous', () => {
  it('throw si guest introuvable', async () => {
    const deps: PersistGuestBriefDeps = {
      fetchGuest: async () => null,
      fetchEpisodes: async () => [],
      updateBrief: async () => undefined,
    };
    await expect(persistGuestBrief({ guestId: 99999 }, deps)).rejects.toThrow(/not found/);
  });

  it('throw si tenant_appearances vide', async () => {
    const deps: PersistGuestBriefDeps = {
      fetchGuest: async () => ({
        id: 1,
        canonical_name: 'x',
        display_name: 'X',
        linkedin_url: null,
        tenant_appearances: [],
      }),
      fetchEpisodes: async () => [],
      updateBrief: async () => undefined,
    };
    await expect(persistGuestBrief({ guestId: 1 }, deps)).rejects.toThrow(/no tenant_appearances/);
  });

  it('throw si toutes les sources sont vides (aucun épisode utilisable)', async () => {
    const deps: PersistGuestBriefDeps = {
      fetchGuest: async () => ({
        id: 1,
        canonical_name: 'x',
        display_name: 'X',
        linkedin_url: null,
        tenant_appearances: [{ tenant_id: 'gdiy', episode_numbers: [1] }],
      }),
      fetchEpisodes: async () => [
        {
          id: 1,
          tenant_id: 'gdiy',
          episode_number: 1,
          title: 'empty',
          date_created: new Date().toISOString(),
          article_content: '',
          chapters: null,
          key_takeaways: null,
          rss_description: '',
        },
      ],
      updateBrief: async () => undefined,
    };
    await expect(persistGuestBrief({ guestId: 1 }, deps)).rejects.toThrow(/no usable source content/);
  });
});
