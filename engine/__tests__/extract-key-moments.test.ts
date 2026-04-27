import { describe, it, expect, vi } from 'vitest';
import {
  extractKeyMoments,
  buildPrompt,
  detectHallucinatedNumerics,
  KeyMomentSchema,
} from '@engine/primitives/extractKeyMoments';
import type { TranscriptResult } from '@engine/primitives/transcribeAudio';
import type { LLMFn, PodcastContext } from '@engine/primitives/types';

const GDIY_CTX: PodcastContext = {
  podcast_id: 'gdiy',
  podcast_name: 'GDIY',
  editorial_focus: 'entrepreneuriat tech B2B',
  host_name: 'Matthieu Stefani',
};

const TRANSCRIPT: TranscriptResult = {
  full_text: 'Frédéric a levé 140 M€ pour Platform.sh en 2022. Il explique sa stratégie 100% remote. Le ROI a été multiplié par 3.',
  segments: [
    { start_seconds: 0, end_seconds: 60, text: 'Frédéric a levé 140 M€ pour Platform.sh en 2022.' },
    { start_seconds: 60, end_seconds: 120, text: 'Il explique sa stratégie 100% remote.' },
    { start_seconds: 120, end_seconds: 180, text: 'Le ROI a été multiplié par 3.' },
  ],
  duration_seconds: 180,
  cost_usd: 0.018,
};

function fixedLlmFn(payload: unknown): LLMFn {
  return vi.fn(async () => JSON.stringify(payload));
}

const VALID_5_MOMENTS = {
  moments: [
    {
      start_seconds: 0,
      end_seconds: 60,
      title: 'La levée 140 M€ chez Platform.sh expliquée',
      hook: 'Comment Frédéric a convaincu les VCs européens.',
      rationale: 'Donnée chiffrée précise sur la levée Series B+ de Platform.sh.',
      saliency_score: 0.9,
    },
    {
      start_seconds: 60,
      end_seconds: 120,
      title: 'Le 100% remote dès la création de Platform.sh',
      hook: 'Aucun bureau, jamais — la doctrine assumée.',
      rationale: 'Position éditoriale forte sur le management distribué.',
      saliency_score: 0.85,
    },
    {
      start_seconds: 120,
      end_seconds: 180,
      title: 'ROI multiplié par 3 sur 18 mois',
      hook: 'Les chiffres derrière la croissance.',
      rationale: 'Métrique opérationnelle saillante pour scaleup B2B.',
      saliency_score: 0.7,
    },
    {
      start_seconds: 30,
      end_seconds: 90,
      title: 'Construire en Europe vs lever aux USA',
      hook: 'Le choix géographique structurant.',
      rationale: 'Tension classique scaleup B2B européenne.',
      saliency_score: 0.6,
    },
    {
      start_seconds: 90,
      end_seconds: 150,
      title: 'Recruter 100% remote dès le jour 1',
      hook: 'Process de recrutement asynchrone détaillé.',
      rationale: 'Tactique opérationnelle reproductible.',
      saliency_score: 0.55,
    },
  ],
};

describe('KeyMomentSchema (zod)', () => {
  it('accepts a valid moment', () => {
    expect(() =>
      KeyMomentSchema.parse(VALID_5_MOMENTS.moments[0]),
    ).not.toThrow();
  });

  it('rejects when end_seconds < start_seconds', () => {
    expect(() =>
      KeyMomentSchema.parse({
        ...VALID_5_MOMENTS.moments[0],
        start_seconds: 100,
        end_seconds: 50,
      }),
    ).toThrow();
  });

  it('rejects saliency_score out of [0,1]', () => {
    expect(() =>
      KeyMomentSchema.parse({ ...VALID_5_MOMENTS.moments[0], saliency_score: 1.5 }),
    ).toThrow();
  });

  it('rejects empty title', () => {
    expect(() =>
      KeyMomentSchema.parse({ ...VALID_5_MOMENTS.moments[0], title: '' }),
    ).toThrow();
  });

  it('rejects too-short rationale (<10 chars)', () => {
    expect(() =>
      KeyMomentSchema.parse({ ...VALID_5_MOMENTS.moments[0], rationale: 'short' }),
    ).toThrow();
  });
});

describe('detectHallucinatedNumerics', () => {
  it('returns empty when all numerics present in transcript', () => {
    expect(
      detectHallucinatedNumerics('La levée 140 M€ et 3x ROI', TRANSCRIPT.full_text),
    ).toHaveLength(0);
  });

  it('flags 100M vues if absent from transcript (Inoxtag finding)', () => {
    const hallu = detectHallucinatedNumerics(
      'Inoxtag a fait 100M vues sur YouTube en 2024.',
      'Le créateur a partagé son aventure himalayenne.',
    );
    expect(hallu.length).toBeGreaterThan(0);
    expect(hallu.some((h) => /100/.test(h))).toBe(true);
  });

  it('matches numerics with or without space ("140M€" vs "140 M€")', () => {
    expect(
      detectHallucinatedNumerics('La levée 140 M€', '140M€ levés'),
    ).toHaveLength(0);
    expect(
      detectHallucinatedNumerics('140 M€ levés', 'la levée à 140M€'),
    ).toHaveLength(0);
  });
});

describe('buildPrompt', () => {
  it('includes guestName, podcast_name and editorial_focus', () => {
    const p = buildPrompt(TRANSCRIPT, {
      guestName: 'Frédéric Plais',
      podcastContext: GDIY_CTX,
    });
    expect(p).toContain('Frédéric Plais');
    expect(p).toContain('GDIY');
    expect(p).toContain('entrepreneuriat tech B2B');
  });

  it('contains the strict numeric prohibition', () => {
    const p = buildPrompt(TRANSCRIPT, {
      guestName: 'Frédéric Plais',
      podcastContext: GDIY_CTX,
    });
    expect(p).toMatch(/INTERDICTION ABSOLUE/);
  });

  it('truncates very long transcripts', () => {
    const long: TranscriptResult = {
      ...TRANSCRIPT,
      full_text: 'a'.repeat(80_000),
    };
    const p = buildPrompt(long, {
      guestName: 'X',
      podcastContext: GDIY_CTX,
    });
    expect(p).toContain('tronqué');
  });
});

describe('extractKeyMoments', () => {
  it('returns 5 moments when LLM returns 5 valid moments', async () => {
    const result = await extractKeyMoments(TRANSCRIPT, {
      guestName: 'Frédéric Plais',
      podcastContext: GDIY_CTX,
    }, { llmFn: fixedLlmFn(VALID_5_MOMENTS) });
    expect(result.moments).toHaveLength(5);
    expect(result.warnings.filter((w) => w.startsWith('LLM returned'))).toHaveLength(0);
  });

  it('truncates to top 5 by saliency when LLM returns 6', async () => {
    const six = {
      moments: [
        ...VALID_5_MOMENTS.moments,
        {
          start_seconds: 150,
          end_seconds: 180,
          title: 'Moment supplémentaire faible saillance',
          hook: 'Phrase d\'accroche.',
          rationale: 'Saillance basse, devrait être retirée.',
          saliency_score: 0.1,
        },
      ],
    };
    const result = await extractKeyMoments(TRANSCRIPT, {
      guestName: 'Frédéric Plais',
      podcastContext: GDIY_CTX,
    }, { llmFn: fixedLlmFn(six) });
    expect(result.moments).toHaveLength(5);
    // The 0.1 saliency one must be excluded
    expect(result.moments.every((m) => m.saliency_score > 0.1)).toBe(true);
    expect(result.warnings.some((w) => /truncated/.test(w))).toBe(true);
  });

  it('returns 3 with warning when LLM returns 3', async () => {
    const three = { moments: VALID_5_MOMENTS.moments.slice(0, 3) };
    const result = await extractKeyMoments(TRANSCRIPT, {
      guestName: 'Frédéric Plais',
      podcastContext: GDIY_CTX,
    }, { llmFn: fixedLlmFn(three) });
    expect(result.moments).toHaveLength(3);
    expect(result.warnings.some((w) => /only 3/.test(w))).toBe(true);
  });

  it('emits warning when a moment cites numerics absent from transcript', async () => {
    const halluc = {
      moments: [
        ...VALID_5_MOMENTS.moments.slice(0, 4),
        {
          start_seconds: 0,
          end_seconds: 30,
          title: 'Citation hallucinée 999 M€ jamais dite',
          hook: 'Ce chiffre 999 M€ n\'est pas dans le transcript.',
          rationale: 'Test détection citation chiffrée hallucinée.',
          saliency_score: 0.5,
        },
      ],
    };
    const result = await extractKeyMoments(TRANSCRIPT, {
      guestName: 'Frédéric Plais',
      podcastContext: GDIY_CTX,
    }, { llmFn: fixedLlmFn(halluc) });
    expect(result.warnings.some((w) => /numerics absent/.test(w))).toBe(true);
  });

  it('throws when LLM output fails zod validation', async () => {
    const bad = {
      moments: [
        {
          start_seconds: 0,
          end_seconds: 60,
          title: 'OK',
          hook: 'OK',
          // rationale too short
          rationale: 'no',
          saliency_score: 0.5,
        },
      ],
    };
    await expect(
      extractKeyMoments(TRANSCRIPT, {
        guestName: 'Frédéric Plais',
        podcastContext: GDIY_CTX,
      }, { llmFn: fixedLlmFn(bad) }),
    ).rejects.toThrow(/zod validation/);
  });

  it('throws when guestName missing', async () => {
    await expect(
      extractKeyMoments(TRANSCRIPT, {
        guestName: '',
        podcastContext: GDIY_CTX,
      }, { llmFn: fixedLlmFn(VALID_5_MOMENTS) }),
    ).rejects.toThrow(/guestName is required/);
  });

  it('throws when transcript full_text empty', async () => {
    await expect(
      extractKeyMoments({ ...TRANSCRIPT, full_text: '' }, {
        guestName: 'X',
        podcastContext: GDIY_CTX,
      }, { llmFn: fixedLlmFn(VALID_5_MOMENTS) }),
    ).rejects.toThrow(/full_text is empty/);
  });

  it('strips ```json fences if LLM wraps response', async () => {
    const raw = '```json\n' + JSON.stringify(VALID_5_MOMENTS) + '\n```';
    const result = await extractKeyMoments(TRANSCRIPT, {
      guestName: 'Frédéric Plais',
      podcastContext: GDIY_CTX,
    }, { llmFn: vi.fn(async () => raw) });
    expect(result.moments).toHaveLength(5);
  });
});
