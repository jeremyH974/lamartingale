import { describe, it, expect } from 'vitest';
import {
  guestBriefAgent,
  buildPrompt,
  type GuestBriefInput,
  type GuestBriefConfig,
  type LLMFn,
} from '@engine/agents/guestBriefAgent';

// Fixtures Larchevêque-like ---------------------------------------------------

const LARCHEVEQUE_INPUT: GuestBriefInput = {
  guestName: 'Eric Larchevêque',
  guestLinkedin: 'https://www.linkedin.com/in/ericlarch/',
  episodes: [
    {
      episode_id: 2206,
      podcast_id: 'gdiy',
      title: '#243 - Eric Larcheveque - Ledger - Le club secret des crypto millionnaires',
      date_created: '2022-02-20T04:00:00.000Z',
      source_content: 'Mock article GDIY: Bitcoin, Ledger, transmission, slowlife...',
      source_type: 'article_content',
      source_quality: 0.8,
    },
    {
      episode_id: 925,
      podcast_id: 'lamartingale',
      title: 'Bitcoin, arnaque ou opportunités ?',
      date_created: '2019-04-16T22:00:00.000Z',
      source_content: 'Mock article LM: Bitcoin pour le grand public, opportunités...',
      source_type: 'article_content',
      source_quality: 0.8,
    },
    {
      episode_id: 3136,
      podcast_id: 'passionpatrimoine',
      title: '#26 - Eric Larchevêque : L\u2019anti CGP !',
      date_created: '2023-04-25T03:00:00.000Z',
      source_content: 'Mock rss desc PP: vision patrimoine alternative, anti-CGP...',
      source_type: 'rss_description',
      source_quality: 0.1,
    },
  ],
};

const FIXED_LLM_OUTPUT = {
  briefMd: '# Eric Larchevêque\n\n300 mots de synthèse...',
  keyPositions: [
    {
      position: 'Bitcoin est une révolution monétaire long terme',
      context: 'Discussion sur Ledger et la mission Bitcoin',
      source_episode_id: 2206,
      source_podcast: 'gdiy',
      confidence: 0.92,
    },
    {
      position: 'Les CGP traditionnels sont déconnectés',
      context: 'Critique du modèle CGP français',
      source_episode_id: 3136,
      source_podcast: 'passionpatrimoine',
      confidence: 0.85,
    },
  ],
  quotes: [
    {
      text: '"Le Bitcoin n\'est pas un investissement, c\'est une idéologie."',
      source_episode_id: 925,
      source_podcast: 'lamartingale',
      context: 'En réponse à la question arnaque/opportunité',
    },
  ],
  originalQuestions: [
    {
      question: 'Comment réconcilier ton scepticisme CGP avec ta vision patrimoine long terme ?',
      rationale: 'Tension non explorée entre les épisodes GDIY et PP',
      depth_score: 'high',
    },
  ],
};

const mockLLMSonnet: LLMFn = async () => JSON.stringify(FIXED_LLM_OUTPUT);

// Test 1 — Happy path ---------------------------------------------------------

describe('guestBriefAgent — happy path (Larchevêque, sonnet)', () => {
  it('renvoie un output structuré conforme au schema', async () => {
    const out = await guestBriefAgent.run(LARCHEVEQUE_INPUT, {
      llmFn: mockLLMSonnet,
      llmModel: 'sonnet',
    });

    expect(out.briefMd).toContain('Eric Larchevêque');
    expect(out.keyPositions).toHaveLength(2);
    expect(out.keyPositions[0].source_podcast).toBe('gdiy');
    expect(out.keyPositions[0].confidence).toBeGreaterThan(0.8);
    expect(out.quotes).toHaveLength(1);
    expect(out.originalQuestions[0].depth_score).toBe('high');

    expect(out.metadata.sourcesUsed).toBe(3);
    expect(out.metadata.sourceQualityAvg).toBeCloseTo(0.57, 1); // (0.8+0.8+0.1)/3
    expect(out.metadata.llmModel).toBe('sonnet');
    expect(out.metadata.generationTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('le prompt inclut nom invité, linkedin et chaque source', () => {
    const prompt = buildPrompt(LARCHEVEQUE_INPUT, {
      llmFn: mockLLMSonnet,
      llmModel: 'sonnet',
    });
    expect(prompt).toContain('Eric Larchevêque');
    expect(prompt).toContain('ericlarch');
    expect(prompt).toContain('gdiy épisode 2206');
    expect(prompt).toContain('lamartingale épisode 925');
    expect(prompt).toContain('passionpatrimoine épisode 3136');
  });
});

// Test 2 — Alternative path ---------------------------------------------------

describe('guestBriefAgent — alternative path (1 ep minimal, haiku, max custom)', () => {
  it('respecte llmModel haiku et clamp les listes aux max custom', async () => {
    const FIXED_HAIKU_OUTPUT = {
      briefMd: '# Mock Guest\nBrief court Haiku...',
      keyPositions: Array.from({ length: 10 }, (_, i) => ({
        position: `Position ${i}`,
        context: 'ctx',
        source_episode_id: 999,
        source_podcast: 'gdiy',
        confidence: 0.5,
      })),
      quotes: [
        { text: 'q', source_episode_id: 999, source_podcast: 'gdiy', context: 'c' },
      ],
      originalQuestions: [
        { question: 'q?', rationale: 'r', depth_score: 'medium' },
      ],
    };
    const mockLLMHaiku: LLMFn = async () => FIXED_HAIKU_OUTPUT; // objet déjà parsé

    const minimalInput: GuestBriefInput = {
      guestName: 'Mock Guest',
      episodes: [
        {
          episode_id: 999,
          podcast_id: 'gdiy',
          title: 'Test minimal',
          date_created: '2025-01-01T00:00:00.000Z',
          source_content: 'Bare minimum content',
          source_type: 'rss_description',
          source_quality: 0.1,
        },
      ],
    };

    const out = await guestBriefAgent.run(minimalInput, {
      llmFn: mockLLMHaiku,
      llmModel: 'haiku',
      maxKeyPositions: 3,
      maxQuotes: 2,
      maxOriginalQuestions: 1,
    });

    expect(out.metadata.llmModel).toBe('haiku');
    expect(out.metadata.sourcesUsed).toBe(1);
    expect(out.metadata.sourceQualityAvg).toBe(0.1);
    expect(out.keyPositions).toHaveLength(3); // 10 → clamp 3
    expect(out.quotes).toHaveLength(1); // 1 < 2, pas de clamp
    expect(out.originalQuestions).toHaveLength(1);
  });
});

// Test 3 — Robustesse parsing -------------------------------------------------

describe('guestBriefAgent — robustesse', () => {
  it('parse correctement un JSON wrappé dans des fences ```json', async () => {
    const wrapped = `\`\`\`json\n${JSON.stringify(FIXED_LLM_OUTPUT)}\n\`\`\``;
    const llmFenced: LLMFn = async () => wrapped;
    const out = await guestBriefAgent.run(LARCHEVEQUE_INPUT, {
      llmFn: llmFenced,
      llmModel: 'sonnet',
    });
    expect(out.briefMd).toContain('Eric Larchevêque');
  });

  it('throw clairement si LLM renvoie du JSON malformé', async () => {
    const llmBad: LLMFn = async () => 'not json at all just text';
    await expect(
      guestBriefAgent.run(LARCHEVEQUE_INPUT, { llmFn: llmBad, llmModel: 'sonnet' }),
    ).rejects.toThrow(/not valid JSON|output is not an object|briefMd missing/i);
  });

  it('throw si briefMd manquant dans la réponse LLM', async () => {
    const llmIncomplete: LLMFn = async () =>
      JSON.stringify({ keyPositions: [], quotes: [], originalQuestions: [] });
    await expect(
      guestBriefAgent.run(LARCHEVEQUE_INPUT, { llmFn: llmIncomplete, llmModel: 'sonnet' }),
    ).rejects.toThrow(/briefMd/);
  });

  it('throw si guestName vide', async () => {
    await expect(
      guestBriefAgent.run(
        { ...LARCHEVEQUE_INPUT, guestName: '   ' },
        { llmFn: mockLLMSonnet, llmModel: 'sonnet' },
      ),
    ).rejects.toThrow(/guestName/);
  });

  it('throw si episodes vide', async () => {
    await expect(
      guestBriefAgent.run(
        { ...LARCHEVEQUE_INPUT, episodes: [] },
        { llmFn: mockLLMSonnet, llmModel: 'sonnet' },
      ),
    ).rejects.toThrow(/episodes/);
  });
});
