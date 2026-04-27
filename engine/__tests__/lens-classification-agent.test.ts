import { describe, it, expect, vi } from 'vitest';
import {
  lensClassificationAgent,
  chunkTranscriptIntoAnalyticSegments,
  buildSegmentPrompt,
  buildLensPromptBlock,
  type LensClassificationConfig,
} from '@engine/agents/lensClassificationAgent';
import type { TranscriptResult } from '@engine/primitives/transcribeAudio';
import type { LLMFn } from '@engine/primitives/types';
import type {
  EditorialEvent,
  EditorialEventInput,
  PersistEditorialEventsResult,
} from '@engine/primitives/persistEditorialEvents';
import { stefaniOrsoConfig } from '../../clients/stefani-orso.config';
import type { Lens } from '@engine/types/lens';

const TRANSCRIPT: TranscriptResult = {
  full_text:
    'Frédéric Plais a fondé Platform.sh, une scaleup tech B2B européenne. ' +
    'Il a levé 140 M€ en Series B+ pour une infrastructure deeptech. ' +
    "Il explique son approche 100% remote dès le jour 1. " +
    "L'ambition est européenne avec un product/market fit confirmé.",
  segments: [
    { start_seconds: 0, end_seconds: 60, text: 'Frédéric Plais a fondé Platform.sh, une scaleup tech B2B européenne.' },
    { start_seconds: 60, end_seconds: 120, text: 'Il a levé 140 M€ en Series B+ pour une infrastructure deeptech.' },
    { start_seconds: 120, end_seconds: 180, text: "Il explique son approche 100% remote dès le jour 1." },
    { start_seconds: 180, end_seconds: 250, text: "L'ambition est européenne avec un product/market fit confirmé." },
    { start_seconds: 250, end_seconds: 350, text: 'Discussion sur la culture entreprise et le recrutement.' },
  ],
  duration_seconds: 350,
  cost_usd: 0,
};

function fixedLlmFn(payloadPerCall: unknown[]): LLMFn {
  let i = 0;
  return vi.fn(async () => {
    const p = payloadPerCall[i] ?? { matches: [] };
    i++;
    return JSON.stringify(p);
  });
}

function trackingPersistFn(): {
  fn: LensClassificationConfig['persistFn'];
  calls: Array<{ events: EditorialEventInput[]; sourceId: string }>;
} {
  const calls: Array<{ events: EditorialEventInput[]; sourceId: string }> = [];
  const fn: LensClassificationConfig['persistFn'] = async (events, sourceId) => {
    calls.push({ events: [...events], sourceId });
    const persistResult: PersistEditorialEventsResult = {
      events: events.map((ev, i) => ({
        id: `mock-${sourceId}-${i}`,
        source_id: sourceId,
        source_type: 'episode',
        type: ev.type,
        position: ev.position,
        content_text: ev.content_text ?? null,
        metadata: ev.metadata,
        lens_tags: ev.lens_tags ?? [],
        created_at: '2026-04-28T10:00:00Z',
      })),
      warnings: [],
    };
    return persistResult;
  };
  return { fn, calls };
}

describe('chunkTranscriptIntoAnalyticSegments', () => {
  it('returns empty array on transcript with no segments', () => {
    const empty: TranscriptResult = { ...TRANSCRIPT, segments: [] };
    expect(chunkTranscriptIntoAnalyticSegments(empty, 240)).toEqual([]);
  });

  it('chunks at the targetSeconds boundary', () => {
    const t: TranscriptResult = {
      ...TRANSCRIPT,
      segments: [
        { start_seconds: 0, end_seconds: 60, text: 'a' },
        { start_seconds: 60, end_seconds: 120, text: 'b' },
        { start_seconds: 120, end_seconds: 240, text: 'c' },
        { start_seconds: 240, end_seconds: 300, text: 'd' },
        { start_seconds: 300, end_seconds: 480, text: 'e' },
      ],
    };
    const chunks = chunkTranscriptIntoAnalyticSegments(t, 240);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].start_seconds).toBe(0);
    expect(chunks[0].end_seconds).toBe(240);
    expect(chunks[1].start_seconds).toBe(240);
    expect(chunks[1].end_seconds).toBe(480);
  });

  it('emits the trailing bucket even if shorter than target', () => {
    const t: TranscriptResult = {
      ...TRANSCRIPT,
      segments: [
        { start_seconds: 0, end_seconds: 100, text: 'a' },
      ],
    };
    const chunks = chunkTranscriptIntoAnalyticSegments(t, 240);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].end_seconds).toBe(100);
  });

  it('throws on targetSeconds <= 0', () => {
    expect(() => chunkTranscriptIntoAnalyticSegments(TRANSCRIPT, 0)).toThrow();
    expect(() => chunkTranscriptIntoAnalyticSegments(TRANSCRIPT, -5)).toThrow();
  });
});

describe('buildLensPromptBlock', () => {
  it('renders lens id + description + concepts', () => {
    const block = buildLensPromptBlock(stefaniOrsoConfig.lenses);
    expect(block).toContain('ovni-vc-deeptech');
    expect(block).toContain('alternative-investments');
    expect(block).toContain('scaleup tech B2B');
  });

  it('handles a lens with non-array concepts gracefully', () => {
    const malformed: Lens = {
      id: 'foo',
      type: 'editorial',
      scoring_strategy_id: 'concept-match-v1',
      applicable_content_types: ['podcast_episode'],
      parameters: { concepts: 'not an array' as unknown as string[] },
    };
    const block = buildLensPromptBlock([malformed]);
    expect(block).toContain('foo');
    expect(block).toContain('no concepts');
  });
});

describe('buildSegmentPrompt', () => {
  it('contains the segment text and all lens ids', () => {
    const seg = { start_seconds: 0, end_seconds: 60, text: 'Test segment' };
    const p = buildSegmentPrompt(seg, stefaniOrsoConfig.lenses);
    expect(p).toContain('Test segment');
    expect(p).toContain('ovni-vc-deeptech');
    expect(p).toContain('editorial-base');
    expect(p).toMatch(/CONSIGNES STRICTES/);
    expect(p).toMatch(/JSON strict/);
  });

  it('does NOT include a concrete rationale example (anti prompt-leak fix A)', () => {
    // Phase 4 V2 fix: the OLD prompt cited a fixed Ovni Capital rationale
    // ("Le segment évoque une scaleup B2B européenne en Series B+, profil
    // typique Ovni Capital") which Sonnet copied verbatim onto unrelated
    // episodes. The new prompt must use placeholders only.
    const seg = { start_seconds: 0, end_seconds: 60, text: 'Test segment' };
    const p = buildSegmentPrompt(seg, stefaniOrsoConfig.lenses);
    expect(p).not.toContain('scaleup B2B européenne en Series B+');
    expect(p).not.toContain('profil typique Ovni Capital');
    expect(p).not.toContain('"matched_concepts": ["scaleup tech B2B", "levée Series B+"]');
  });

  it('contains explicit anti-copy and silence-preferred instructions (fix D)', () => {
    const seg = { start_seconds: 0, end_seconds: 60, text: 'Test segment' };
    const p = buildSegmentPrompt(seg, stefaniOrsoConfig.lenses);
    expect(p).toMatch(/JAMAIS recopier|JAMAIS produire un rationale générique/);
    expect(p).toMatch(/élément PRÉCIS et SPÉCIFIQUE du segment/);
    expect(p).toMatch(/SILENCE PRÉFÉRÉ|silence est une réponse VALIDE/);
    expect(p).toMatch(/expressions? LITTÉRALES?/);
  });

  it('uses placeholder-style schema rather than a concrete sample value', () => {
    const seg = { start_seconds: 0, end_seconds: 60, text: 'Test segment' };
    const p = buildSegmentPrompt(seg, stefaniOrsoConfig.lenses);
    // Schema shape uses <placeholders>, not concrete strings
    expect(p).toMatch(/<id-d-une-lens-listée-plus-haut>/);
    expect(p).toMatch(/<phrase-citant-un-élément-précis-du-segment-fourni-ci-dessus-pas-générique>/);
    expect(p).toMatch(/<nombre-entre-0-et-1>/);
  });
});

describe('lensClassificationAgent', () => {
  const baseOpts = { sourceId: 'gdiy-266' };

  it('persists events for matches above threshold (single segment)', async () => {
    const segments = chunkTranscriptIntoAnalyticSegments(TRANSCRIPT, 240);
    expect(segments.length).toBeGreaterThan(0);

    const { fn: persistFn, calls } = trackingPersistFn();
    const llmFn = fixedLlmFn([
      {
        matches: [
          {
            lens_id: 'ovni-vc-deeptech',
            lens_score: 0.9,
            rationale: 'Le segment évoque clairement une scaleup B2B européenne en Series B+ — profil Ovni Capital.',
            matched_concepts: ['scaleup tech B2B européenne', 'levée Series B+'],
          },
        ],
      },
      // 2nd segment (trailing bucket)
      { matches: [] },
    ]);

    const result = await lensClassificationAgent(TRANSCRIPT, stefaniOrsoConfig, baseOpts, {
      llmFn,
      persistFn,
      perCallCostUsd: 0.01,
    });

    expect(result.events_created).toHaveLength(1);
    expect(result.lens_distribution['ovni-vc-deeptech']).toBe(1);
    expect(result.cost_usd).toBeCloseTo(2 * 0.01, 5);
    expect(result.segments_analyzed).toBe(segments.length);
    expect(result.llm_calls).toBe(segments.length);
    expect(calls[0].events).toHaveLength(1);
    expect(calls[0].events[0].lens_tags).toEqual(['ovni-vc-deeptech']);
  });

  it('filters matches below threshold (lens_score < 0.3)', async () => {
    const { fn: persistFn, calls } = trackingPersistFn();
    const llmFn = fixedLlmFn([
      {
        matches: [
          {
            lens_id: 'ovni-vc-deeptech',
            lens_score: 0.15, // below 0.3
            rationale: 'Faible match, segment ne touche que très tangentiellement la lens.',
          },
        ],
      },
      { matches: [] },
    ]);

    const result = await lensClassificationAgent(TRANSCRIPT, stefaniOrsoConfig, baseOpts, {
      llmFn,
      persistFn,
    });

    expect(result.events_created).toHaveLength(0);
    expect(result.lens_distribution).toEqual({});
    expect(calls).toHaveLength(0); // no persistFn call when no events
  });

  it('warns on rationale shorter than 20 chars (zod fails)', async () => {
    const { fn: persistFn } = trackingPersistFn();
    const llmFn = fixedLlmFn([
      {
        matches: [
          {
            lens_id: 'ovni-vc-deeptech',
            lens_score: 0.85,
            rationale: 'short', // too short
          },
        ],
      },
      { matches: [] },
    ]);

    const result = await lensClassificationAgent(TRANSCRIPT, stefaniOrsoConfig, baseOpts, {
      llmFn,
      persistFn,
    });

    expect(result.events_created).toHaveLength(0);
    expect(result.warnings.some((w) => /schema validation failed/.test(w))).toBe(true);
  });

  it('warns on unknown lens_id from LLM', async () => {
    const { fn: persistFn } = trackingPersistFn();
    const llmFn = fixedLlmFn([
      {
        matches: [
          {
            lens_id: 'fictional-lens-id',
            lens_score: 0.85,
            rationale: 'Long enough rationale describing the (fake) match here.',
          },
        ],
      },
      { matches: [] },
    ]);

    const result = await lensClassificationAgent(TRANSCRIPT, stefaniOrsoConfig, baseOpts, {
      llmFn,
      persistFn,
    });

    expect(result.events_created).toHaveLength(0);
    expect(result.warnings.some((w) => /unknown lens_id/.test(w))).toBe(true);
  });

  it('accepts {matches: []} as valid silence (no warning about parse/schema)', async () => {
    // Fix D, Phase 4 V2 : Sonnet retournant {matches: []} doit être traité
    // comme une réponse valide (pas un bug). Aucun warning de type "JSON
    // parse failed" ou "schema validation failed" ne doit être émis.
    const { fn: persistFn } = trackingPersistFn();
    const segCount = chunkTranscriptIntoAnalyticSegments(TRANSCRIPT, 240).length;
    const llmFn = fixedLlmFn(Array(segCount).fill({ matches: [] }));

    const result = await lensClassificationAgent(TRANSCRIPT, stefaniOrsoConfig, baseOpts, {
      llmFn,
      persistFn,
    });

    expect(result.events_created).toHaveLength(0);
    // Silence valide : aucune erreur de parse/schema
    expect(result.warnings.some((w) => /JSON parse failed/.test(w))).toBe(false);
    expect(result.warnings.some((w) => /schema validation failed/.test(w))).toBe(false);
    // L'agent peut quand même émettre "No matches passed threshold" /
    // "Lens X never matched" — ce sont des informations, pas des erreurs.
  });

  it('returns 0 events with warning when no lens matches anywhere', async () => {
    const { fn: persistFn } = trackingPersistFn();
    const segCount = chunkTranscriptIntoAnalyticSegments(TRANSCRIPT, 240).length;
    const llmFn = fixedLlmFn(Array(segCount).fill({ matches: [] }));

    const result = await lensClassificationAgent(TRANSCRIPT, stefaniOrsoConfig, baseOpts, {
      llmFn,
      persistFn,
    });

    expect(result.events_created).toHaveLength(0);
    expect(result.warnings.some((w) => /No matches passed threshold/.test(w))).toBe(true);
    // Each lens should also produce a "never matched" warning
    for (const l of stefaniOrsoConfig.lenses) {
      expect(result.warnings.some((w) => w.includes(`Lens '${l.id}' never matched`))).toBe(true);
    }
  });

  it('continues on JSON parse failure for one segment, still processes others', async () => {
    const { fn: persistFn } = trackingPersistFn();
    const segments = chunkTranscriptIntoAnalyticSegments(TRANSCRIPT, 240);
    expect(segments.length).toBeGreaterThanOrEqual(2);

    let callIdx = 0;
    const llmFn: LLMFn = vi.fn(async () => {
      const i = callIdx;
      callIdx++;
      if (i === 0) return 'this is not JSON';
      return JSON.stringify({
        matches: [
          {
            lens_id: 'editorial-base',
            lens_score: 0.7,
            rationale: 'Le segment 2 traite de discipline mentale et de leçons business.',
          },
        ],
      });
    });

    const result = await lensClassificationAgent(TRANSCRIPT, stefaniOrsoConfig, baseOpts, {
      llmFn,
      persistFn,
    });

    expect(result.events_created.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => /JSON parse failed/.test(w))).toBe(true);
  });

  it('throws when sourceId missing', async () => {
    await expect(
      lensClassificationAgent(TRANSCRIPT, stefaniOrsoConfig, { sourceId: '' }, {
        llmFn: fixedLlmFn([{ matches: [] }]),
        persistFn: trackingPersistFn().fn,
      }),
    ).rejects.toThrow(/sourceId/);
  });

  it('throws when transcript empty', async () => {
    await expect(
      lensClassificationAgent({ ...TRANSCRIPT, full_text: '' }, stefaniOrsoConfig, baseOpts, {
        llmFn: fixedLlmFn([]),
        persistFn: trackingPersistFn().fn,
      }),
    ).rejects.toThrow(/full_text is empty/);
  });

  it('throws when no lens applies to applicableContentType', async () => {
    await expect(
      lensClassificationAgent(TRANSCRIPT, stefaniOrsoConfig, {
        ...baseOpts,
        applicableContentType: 'pitch_deck', // none of pilot lenses apply
      }, {
        llmFn: fixedLlmFn([]),
        persistFn: trackingPersistFn().fn,
      }),
    ).rejects.toThrow(/no lenses applicable/);
  });

  it('respects per-lens match_threshold (V4 fallback editorial-base case)', async () => {
    // Custom client config with editorial-base having match_threshold=0.6
    const customConfig = {
      ...stefaniOrsoConfig,
      lenses: stefaniOrsoConfig.lenses.map((l) =>
        l.id === 'editorial-base' ? { ...l, match_threshold: 0.6 } : l,
      ),
    };
    const { fn: persistFn } = trackingPersistFn();
    const llmFn = fixedLlmFn([
      {
        matches: [
          // editorial-base at 0.5 → below per-lens threshold 0.6 → DROPPED
          { lens_id: 'editorial-base', lens_score: 0.5, rationale: 'Some segment 1 rationale long enough to satisfy zod min 20.' },
          // editorial-base at 0.7 → above 0.6 → KEPT
          { lens_id: 'editorial-base', lens_score: 0.7, rationale: 'Stronger editorial match anchored in a specific segment quote.' },
          // ovni-vc-deeptech at 0.4 → above global 0.3 → KEPT
          { lens_id: 'ovni-vc-deeptech', lens_score: 0.4, rationale: 'Scaleup B2B mention in segment, profil VC plausible.' },
        ],
      },
      { matches: [] },
    ]);
    const result = await lensClassificationAgent(TRANSCRIPT, customConfig, baseOpts, {
      llmFn,
      persistFn,
    });
    // editorial-base 0.5 dropped, 0.7 kept → 1 event on editorial-base
    // ovni-vc 0.4 kept → 1 event on ovni-vc
    expect(result.lens_distribution['editorial-base']).toBe(1);
    expect(result.lens_distribution['ovni-vc-deeptech']).toBe(1);
    expect(result.events_created).toHaveLength(2);
  });

  it('aggregates lens distribution across segments', async () => {
    const { fn: persistFn } = trackingPersistFn();
    const llmFn = fixedLlmFn([
      {
        matches: [
          { lens_id: 'ovni-vc-deeptech', lens_score: 0.8, rationale: 'Segment 1 : scaleup B2B levée Series B+, profil Ovni clair.' },
          { lens_id: 'editorial-base', lens_score: 0.7, rationale: 'Segment 1 : aussi du parcours entrepreneurial classique (above 0.6 lens threshold).' },
        ],
      },
      {
        matches: [
          { lens_id: 'ovni-vc-deeptech', lens_score: 0.7, rationale: 'Segment 2 : poursuite de la trame Ovni VC.' },
        ],
      },
    ]);
    const result = await lensClassificationAgent(TRANSCRIPT, stefaniOrsoConfig, baseOpts, {
      llmFn,
      persistFn,
    });
    expect(result.lens_distribution['ovni-vc-deeptech']).toBe(2);
    expect(result.lens_distribution['editorial-base']).toBe(1);
    expect(result.events_created).toHaveLength(3);
  });
});
