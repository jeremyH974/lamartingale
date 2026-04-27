import { describe, it, expect, vi } from 'vitest';
import {
  crossReferenceEpisode,
  applyCrossPodcastBoost,
  buildRationalePrompt,
  CrossReferenceSchema,
  type VectorSearchCandidate,
  type CrossReferenceConfig,
} from '@engine/primitives/crossReferenceEpisode';
import type { TranscriptResult } from '@engine/primitives/transcribeAudio';
import type { LLMFn, PodcastContext } from '@engine/primitives/types';

const GDIY_CTX: PodcastContext = {
  podcast_id: 'gdiy',
  podcast_name: 'GDIY',
  editorial_focus: 'entrepreneuriat tech B2B',
  host_name: 'Matthieu Stefani',
};

const SOURCE_TRANSCRIPT: TranscriptResult = {
  full_text:
    'Frédéric Plais explique sa stratégie 100% remote pour Platform.sh. Levée 140 M€. Scaleup B2B européenne, ambition Series C+ en 2024.',
  segments: [],
  duration_seconds: 3600,
  cost_usd: 0.36,
};

const CANDIDATES: VectorSearchCandidate[] = [
  {
    episode_id: 'gdiy-269',
    podcast_id: 'gdiy',
    title: 'Renaud Heitz - Exotec - Des robots au pays des licornes',
    guest: 'Renaud Heitz',
    embedding_distance: 0.5,
    excerpt: 'Levée 335 M€. Scaleup robotique B2B. Industrialisation française.',
  },
  {
    episode_id: 'finscale-105',
    podcast_id: 'finscale',
    title: 'Fabrice Staad (Alan) - Un track de 6 ans à couper le souffle',
    guest: 'Fabrice Staad',
    embedding_distance: 0.6,
    excerpt: 'Insurtech B2B Alan, scaling européen, levées Series.',
  },
  {
    episode_id: 'lamartingale-110',
    podcast_id: 'lamartingale',
    title: 'Investir dans les scaleups B2B',
    guest: 'X',
    embedding_distance: 0.7,
    excerpt: 'Discussion VC et exits B2B européens.',
  },
  {
    episode_id: 'lepanier-200',
    podcast_id: 'lepanier',
    title: 'DTC ecommerce growth',
    guest: 'Y',
    embedding_distance: 1.5, // > threshold 1.0
    excerpt: 'Hors sujet B2B SaaS — DTC retail.',
  },
  {
    episode_id: 'gdiy-264',
    podcast_id: 'gdiy', // same podcast as source -> penalty applies
    title: 'David Brami - Point de Vente',
    guest: 'David Brami',
    embedding_distance: 0.55,
    excerpt: 'POS retail SaaS.',
  },
];

const RATIONALES_VALID = {
  rationales: [
    {
      target_episode_id: 'gdiy-269',
      why_relevant: 'Deux scaleups B2B européennes confrontant un enjeu de levée Series C+ similaire.',
      why_mono_podcast_rag_cant_find_this: 'NotebookLM mono-source ne dispose que d\'un seul corpus podcast à la fois.',
    },
    {
      target_episode_id: 'finscale-105',
      why_relevant: 'Trajectoire 6 ans de scaleup B2B européen, avec inflexion sur la dimension assurance/risque.',
      why_mono_podcast_rag_cant_find_this: 'Cet épisode est dans Finscale, donc invisible depuis un index GDIY mono-source.',
    },
    {
      target_episode_id: 'lamartingale-110',
      why_relevant: 'Vue investisseur sur les scaleups B2B européennes, inversion du point de vue depuis l\'opérateur Plais.',
      why_mono_podcast_rag_cant_find_this: 'L\'angle investisseur LM est invisible depuis un upload GDIY isolé dans NotebookLM.',
    },
    {
      target_episode_id: 'gdiy-264',
      why_relevant: 'Scaleup SaaS B2B retail, parallèle process commercial avec Platform.sh.',
      why_mono_podcast_rag_cant_find_this: 'Connexion intra-GDIY non triviale sans moteur cross-tenant indexé.',
    },
  ],
};

function fixedLlmFn(payload: unknown): LLMFn {
  return vi.fn(async () => JSON.stringify(payload));
}

function makeConfig(
  overrides?: Partial<CrossReferenceConfig>,
): CrossReferenceConfig {
  return {
    embedTextFn: vi.fn(async () => Array.from({ length: 1536 }, () => 0.1)),
    vectorSearchFn: vi.fn(async () => CANDIDATES),
    llmFn: fixedLlmFn(RATIONALES_VALID),
    ...overrides,
  };
}

describe('CrossReferenceSchema', () => {
  it('accepts a valid cross-ref', () => {
    expect(() =>
      CrossReferenceSchema.parse({
        target_episode_id: 'gdiy-269',
        target_podcast: 'gdiy',
        target_title: 'X',
        target_guest: 'Y',
        similarity_distance: 0.5,
        why_relevant: 'Long enough rationale text for verbatim check.',
        why_mono_podcast_rag_cant_find_this: 'Long enough mono-pod RAG explanation.',
      }),
    ).not.toThrow();
  });

  it('rejects too-short why_relevant (<20 chars)', () => {
    expect(() =>
      CrossReferenceSchema.parse({
        target_episode_id: 'gdiy-269',
        target_podcast: 'gdiy',
        target_title: 'X',
        target_guest: 'Y',
        similarity_distance: 0.5,
        why_relevant: 'short',
        why_mono_podcast_rag_cant_find_this: 'Long enough mono-pod RAG explanation.',
      }),
    ).toThrow();
  });
});

describe('applyCrossPodcastBoost', () => {
  it('multiplies same-podcast distance by 1.2', () => {
    const boosted = applyCrossPodcastBoost(CANDIDATES, 'gdiy');
    const samePod = boosted.find((c) => c.episode_id === 'gdiy-264');
    expect(samePod?.adjusted_distance).toBeCloseTo(0.55 * 1.2, 5);
  });

  it('keeps cross-podcast distance unchanged', () => {
    const boosted = applyCrossPodcastBoost(CANDIDATES, 'gdiy');
    const crossPod = boosted.find((c) => c.episode_id === 'finscale-105');
    expect(crossPod?.adjusted_distance).toBe(0.6);
  });
});

describe('buildRationalePrompt', () => {
  it('mentions all candidates and source context', () => {
    const boosted = applyCrossPodcastBoost(CANDIDATES.slice(0, 2), 'gdiy');
    const p = buildRationalePrompt(
      {
        episodeId: 'gdiy-266',
        podcastContext: GDIY_CTX,
        guest: 'Frédéric Plais',
        title: 'Platform.sh',
        transcriptExcerpt: 'Frédéric Plais...',
      },
      boosted,
    );
    expect(p).toContain('gdiy-266');
    expect(p).toContain('Frédéric Plais');
    expect(p).toContain('gdiy-269');
    expect(p).toContain('finscale-105');
    expect(p).toMatch(/why_mono_podcast_rag_cant_find_this/);
    expect(p).toMatch(/INTERDICTIONS/);
  });
});

describe('crossReferenceEpisode', () => {
  it('returns top N references with rationale and boost applied', async () => {
    const config = makeConfig();
    const result = await crossReferenceEpisode(SOURCE_TRANSCRIPT, {
      sourceEpisodeId: 'gdiy-266',
      sourcePodcastContext: GDIY_CTX,
      sourceGuest: 'Frédéric Plais',
      sourceTitle: 'Platform.sh',
      targetCount: 5,
    }, config);
    // Only 4 candidates pass distance threshold (excluded: lepanier-200 at 1.5,
    // and gdiy-264 boosted to 0.66 which is < 1.0 still kept)
    expect(result.references.length).toBeGreaterThanOrEqual(3);
    expect(result.references.length).toBeLessThanOrEqual(5);
    // First reference must be top-distance after boost: gdiy-269 (0.5)
    expect(result.references[0].target_episode_id).toBe('gdiy-269');
    // Same-podcast boost applied → gdiy-264 (0.55 * 1.2 = 0.66)
    const samePod = result.references.find(
      (r) => r.target_episode_id === 'gdiy-264',
    );
    expect(samePod?.similarity_distance).toBeCloseTo(0.66, 5);
  });

  it('filters candidates by excludePodcasts before scoring', async () => {
    const config = makeConfig();
    const result = await crossReferenceEpisode(SOURCE_TRANSCRIPT, {
      sourceEpisodeId: 'gdiy-266',
      sourcePodcastContext: GDIY_CTX,
      sourceGuest: 'Frédéric Plais',
      sourceTitle: 'Platform.sh',
      excludePodcasts: ['gdiy'],
    }, config);
    expect(result.references.every((r) => r.target_podcast !== 'gdiy')).toBe(true);
    expect(result.warnings.some((w) => /Filtered out/.test(w))).toBe(true);
  });

  it('warns when distance threshold filters candidates', async () => {
    const config = makeConfig();
    const result = await crossReferenceEpisode(SOURCE_TRANSCRIPT, {
      sourceEpisodeId: 'gdiy-266',
      sourcePodcastContext: GDIY_CTX,
      sourceGuest: 'Frédéric Plais',
      sourceTitle: 'Platform.sh',
    }, config);
    // lepanier-200 has distance 1.5 > 1.0 threshold -> filtered with warning
    expect(result.warnings.some((w) => /exceeded distance threshold/.test(w))).toBe(true);
    expect(result.references.every((r) => r.target_episode_id !== 'lepanier-200')).toBe(true);
  });

  it('returns empty with warning when all candidates are above threshold', async () => {
    const farCandidates: VectorSearchCandidate[] = [
      { ...CANDIDATES[3] }, // distance 1.5
    ];
    const config = makeConfig({
      vectorSearchFn: vi.fn(async () => farCandidates),
    });
    const result = await crossReferenceEpisode(SOURCE_TRANSCRIPT, {
      sourceEpisodeId: 'gdiy-266',
      sourcePodcastContext: GDIY_CTX,
      sourceGuest: 'Frédéric Plais',
      sourceTitle: 'Platform.sh',
    }, config);
    expect(result.references).toHaveLength(0);
    expect(result.warnings.some((w) => /No candidate passed/.test(w))).toBe(true);
  });

  it('warns when fewer candidates than targetCount pass filters', async () => {
    const config = makeConfig({
      vectorSearchFn: vi.fn(async () => CANDIDATES.slice(0, 2)),
    });
    const result = await crossReferenceEpisode(SOURCE_TRANSCRIPT, {
      sourceEpisodeId: 'gdiy-266',
      sourcePodcastContext: GDIY_CTX,
      sourceGuest: 'Frédéric Plais',
      sourceTitle: 'Platform.sh',
      targetCount: 5,
    }, config);
    expect(result.warnings.some((w) => /asked 5/.test(w))).toBe(true);
  });

  it('skips a candidate when LLM omits rationale and warns', async () => {
    const partialRationales = {
      rationales: RATIONALES_VALID.rationales.slice(0, 2),
    };
    const config = makeConfig({ llmFn: fixedLlmFn(partialRationales) });
    const result = await crossReferenceEpisode(SOURCE_TRANSCRIPT, {
      sourceEpisodeId: 'gdiy-266',
      sourcePodcastContext: GDIY_CTX,
      sourceGuest: 'Frédéric Plais',
      sourceTitle: 'Platform.sh',
    }, config);
    expect(result.references.length).toBeLessThanOrEqual(2);
    expect(result.warnings.some((w) => /No rationale returned/.test(w))).toBe(true);
  });

  it('rejects rationale failing zod (too short why_relevant)', async () => {
    const badRationales = {
      rationales: [
        {
          target_episode_id: 'gdiy-269',
          why_relevant: 'short',
          why_mono_podcast_rag_cant_find_this: 'Long enough explanation here.',
        },
      ],
    };
    const config = makeConfig({
      vectorSearchFn: vi.fn(async () => [CANDIDATES[0]]),
      llmFn: fixedLlmFn(badRationales),
    });
    const result = await crossReferenceEpisode(SOURCE_TRANSCRIPT, {
      sourceEpisodeId: 'gdiy-266',
      sourcePodcastContext: GDIY_CTX,
      sourceGuest: 'Frédéric Plais',
      sourceTitle: 'Platform.sh',
    }, config);
    expect(result.references).toHaveLength(0);
    expect(result.warnings.some((w) => /failed zod/.test(w))).toBe(true);
  });

  it('throws when sourceEpisodeId missing', async () => {
    await expect(
      crossReferenceEpisode(SOURCE_TRANSCRIPT, {
        sourceEpisodeId: '',
        sourcePodcastContext: GDIY_CTX,
        sourceGuest: 'X',
        sourceTitle: 'Y',
      }, makeConfig()),
    ).rejects.toThrow(/sourceEpisodeId/);
  });

  it('throws when transcript empty', async () => {
    await expect(
      crossReferenceEpisode({ ...SOURCE_TRANSCRIPT, full_text: '' }, {
        sourceEpisodeId: 'gdiy-266',
        sourcePodcastContext: GDIY_CTX,
        sourceGuest: 'X',
        sourceTitle: 'Y',
      }, makeConfig()),
    ).rejects.toThrow(/full_text is empty/);
  });

  it('passes the source episode id to vectorSearchFn excludeEpisodeIds', async () => {
    const vectorSearchFn = vi.fn(async () => CANDIDATES);
    const config = makeConfig({ vectorSearchFn });
    await crossReferenceEpisode(SOURCE_TRANSCRIPT, {
      sourceEpisodeId: 'gdiy-266',
      sourcePodcastContext: GDIY_CTX,
      sourceGuest: 'Frédéric Plais',
      sourceTitle: 'Platform.sh',
    }, config);
    const args = vectorSearchFn.mock.calls[0][1];
    expect(args.excludeEpisodeIds).toContain('gdiy-266');
  });
});
