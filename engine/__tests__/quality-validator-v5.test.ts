import { describe, it, expect } from 'vitest';
import {
  runValidatedGenerationV5,
  type RunValidatedGenerationV5Options,
  type QualityValidationContext,
} from '@engine/agents/qualityValidator';
import type { LoadedNewsletter } from '@engine/agents/loadStyleCorpus';
import type { OpusEpisodeContext } from '@engine/agents/opusRewrite';
import type { LLMFn } from '@engine/primitives/types';

function makeNewsletters(): LoadedNewsletter[] {
  return Array.from({ length: 6 }, (_, i) => ({
    id: `n${i + 1}`,
    title: `Newsletter ${i + 1}`,
    date: '2025-12-01',
    pattern_tags: ['anecdote'],
    excerpts: [],
    body: `Body ${i + 1}.`,
    truncated: false,
  }));
}

function makeEpisodeContext(): OpusEpisodeContext {
  return {
    episodeTitle: 'Plais — 140M',
    guestName: 'Frédéric Plais',
    hostName: 'Matthieu Stefani',
    podcastDisplayName: 'GDIY',
    transcriptKeyPoints: '- 140M',
    activeLensSummary: 'lens X',
    selectedCrossRefs: '- LM ép3',
    ecosystemCanonicalPhrase: 'écosystème Orso',
    ecosystemAlternative: 'team Orso',
    hostBlacklistPhrases: ['Casquette Verte'],
  };
}

function makeContext(): QualityValidationContext {
  return {
    guestName: 'Frédéric Plais',
    hostName: 'Matthieu Stefani',
    styleCorpus: {
      newsletters: [],
      host_blacklist_phrases: ['Casquette Verte'],
      signature_expressions: ['Boom.'],
      ecosystem_reference: {
        canonical_phrase: 'écosystème Orso',
        alternatives: ['team Orso'],
        must_appear_in: ['newsletter'],
        appearance_style: 'naturelle',
      },
    },
  };
}

/** Validateur mock qui retourne le score correspondant à une signature dans le texte. */
function makeScoreValidator(scoreMap: Record<string, number>): LLMFn {
  return async (prompt: string) => {
    let score = 5;
    for (const [sig, s] of Object.entries(scoreMap)) {
      if (prompt.includes(sig)) {
        score = s;
        break;
      }
    }
    return JSON.stringify({
      passed: score >= 7.5,
      score,
      issues: score < 7.5
        ? [{ category: 'tone-mismatch', severity: 'major', description: 'Sonnet stagne' }]
        : [],
      rewriteSuggestions: score < 7.5 ? 'Reformule.' : undefined,
    });
  };
}

const baseOpts = (
  validatorLlmFn: LLMFn,
  rewriteLlmFn: LLMFn,
  initialText = 'INITIAL_SONNET',
): RunValidatedGenerationV5Options => ({
  initialText,
  livrableType: 'newsletter',
  context: makeContext(),
  episodeContext: makeEpisodeContext(),
  newsletters: makeNewsletters(),
  validatorLlmFn,
  rewriteLlmFn,
  targetLength: '450-700 mots',
  specificConstraints: 'Newsletter.',
});

describe('runValidatedGenerationV5', () => {
  it('accepts Sonnet initial when score >= 7.5 (no Opus call)', async () => {
    let opusCalls = 0;
    const rewriteLlmFn: LLMFn = async () => {
      opusCalls++;
      return 'OPUS_REWRITE';
    };
    const validatorLlmFn = makeScoreValidator({ INITIAL_SONNET: 8.2 });
    const out = await runValidatedGenerationV5(baseOpts(validatorLlmFn, rewriteLlmFn));
    expect(out.finalSource).toBe('sonnet-initial');
    expect(out.finalValidation.score).toBe(8.2);
    expect(out.usedDegradedFallback).toBe(false);
    expect(opusCalls).toBe(0);
  });

  it('triggers Opus rewrite #1 when Sonnet score < 7.5 and accepts if Opus passes', async () => {
    let opusCalls = 0;
    const rewriteLlmFn: LLMFn = async () => {
      opusCalls++;
      return 'OPUS_V1_OK';
    };
    const validatorLlmFn = makeScoreValidator({
      INITIAL_SONNET: 6,
      OPUS_V1_OK: 8.0,
    });
    const out = await runValidatedGenerationV5(baseOpts(validatorLlmFn, rewriteLlmFn));
    expect(out.finalSource).toBe('opus-rewrite-1');
    expect(out.finalText).toBe('OPUS_V1_OK');
    expect(out.finalValidation.score).toBe(8.0);
    expect(opusCalls).toBe(1);
    expect(out.history).toHaveLength(2);
  });

  it('runs up to 2 Opus rewrites when first Opus also fails', async () => {
    let opusCalls = 0;
    const rewriteLlmFn: LLMFn = async () => {
      opusCalls++;
      return opusCalls === 1 ? 'OPUS_V1_FAIL' : 'OPUS_V2_OK';
    };
    const validatorLlmFn = makeScoreValidator({
      INITIAL_SONNET: 5,
      OPUS_V1_FAIL: 7.0,
      OPUS_V2_OK: 8.5,
    });
    const out = await runValidatedGenerationV5(baseOpts(validatorLlmFn, rewriteLlmFn));
    expect(out.finalSource).toBe('opus-rewrite-2');
    expect(out.finalText).toBe('OPUS_V2_OK');
    expect(out.finalValidation.score).toBe(8.5);
    expect(opusCalls).toBe(2);
    expect(out.history).toHaveLength(3);
  });

  it('falls back to degraded format when 2 Opus rewrites both fail and builder provided', async () => {
    let opusCalls = 0;
    const rewriteLlmFn: LLMFn = async () => {
      opusCalls++;
      return opusCalls === 1 ? 'OPUS_V1_FAIL' : 'OPUS_V2_FAIL';
    };
    const validatorLlmFn = makeScoreValidator({
      INITIAL_SONNET: 4,
      OPUS_V1_FAIL: 5,
      OPUS_V2_FAIL: 6,
      DEGRADED_FORMAT: 7.2, // dégradé passe sans atteindre 7.5
    });
    const opts = baseOpts(validatorLlmFn, rewriteLlmFn);
    opts.degradedFallbackBuilder = () => 'DEGRADED_FORMAT_BULLETS_INTRO_OUTRO';
    const out = await runValidatedGenerationV5(opts);
    expect(out.usedDegradedFallback).toBe(true);
    expect(out.finalSource).toBe('degraded-fallback');
    expect(out.finalText).toContain('DEGRADED_FORMAT_BULLETS_INTRO_OUTRO');
    expect(opusCalls).toBe(2);
  });

  it('returns best-of attempts when no degradedFallbackBuilder and all fail', async () => {
    let opusCalls = 0;
    const rewriteLlmFn: LLMFn = async () => {
      opusCalls++;
      return opusCalls === 1 ? 'OPUS_V1_LOW' : 'OPUS_V2_HIGHER';
    };
    const validatorLlmFn = makeScoreValidator({
      INITIAL_SONNET: 4,
      OPUS_V1_LOW: 5.5,
      OPUS_V2_HIGHER: 6.8,
    });
    const out = await runValidatedGenerationV5(baseOpts(validatorLlmFn, rewriteLlmFn));
    expect(out.usedDegradedFallback).toBe(false);
    expect(out.finalSource).toBe('opus-rewrite-2');
    expect(out.finalText).toBe('OPUS_V2_HIGHER');
    expect(out.finalValidation.score).toBe(6.8);
    expect(opusCalls).toBe(2);
  });

  it('caps Opus rewrites strictly at maxOpusRewrites (default 2)', async () => {
    let opusCalls = 0;
    const rewriteLlmFn: LLMFn = async () => {
      opusCalls++;
      return `OPUS_V${opusCalls}`;
    };
    const validatorLlmFn = makeScoreValidator({}); // tout score 5 par défaut
    await runValidatedGenerationV5(baseOpts(validatorLlmFn, rewriteLlmFn));
    expect(opusCalls).toBe(2);
  });

  it('respects custom maxOpusRewrites=1', async () => {
    let opusCalls = 0;
    const rewriteLlmFn: LLMFn = async () => {
      opusCalls++;
      return `OPUS_V${opusCalls}`;
    };
    const validatorLlmFn = makeScoreValidator({});
    const opts = baseOpts(validatorLlmFn, rewriteLlmFn);
    opts.maxOpusRewrites = 1;
    await runValidatedGenerationV5(opts);
    expect(opusCalls).toBe(1);
  });

  it('keeps best-of when Opus rewrite throws', async () => {
    const rewriteLlmFn: LLMFn = async () => {
      throw new Error('Opus API timeout');
    };
    const validatorLlmFn = makeScoreValidator({ INITIAL_SONNET: 6.5 });
    const out = await runValidatedGenerationV5(baseOpts(validatorLlmFn, rewriteLlmFn));
    expect(out.finalSource).toBe('sonnet-initial');
    expect(out.finalValidation.score).toBe(6.5);
    expect(out.usedDegradedFallback).toBe(false);
  });
});
