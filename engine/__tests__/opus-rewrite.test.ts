import { describe, it, expect } from 'vitest';
import {
  buildOpusRewritePrompt,
  rewriteWithOpus,
  type OpusEpisodeContext,
  type OpusRewriteOptions,
} from '@engine/agents/opusRewrite';
import type { LoadedNewsletter } from '@engine/agents/loadStyleCorpus';
import type { QualityValidationResult } from '@engine/agents/qualityValidator';

function makeNewsletters(): LoadedNewsletter[] {
  return Array.from({ length: 6 }, (_, i) => ({
    id: `n${i + 1}`,
    title: `Newsletter ${i + 1}`,
    date: '2025-12-0' + (i + 1),
    pattern_tags: ['anecdote'],
    excerpts: [],
    body: `Corps newsletter ${i + 1} sans front-matter.`,
    truncated: false,
  }));
}

function makeEpisodeContext(): OpusEpisodeContext {
  return {
    episodeTitle: 'Plais — 140M télétravail',
    guestName: 'Frédéric Plais',
    hostName: 'Matthieu Stefani',
    podcastDisplayName: 'Génération Do It Yourself',
    transcriptKeyPoints: '- 140M levés\n- équipe distribuée mondialement\n- pas de bureau central',
    activeLensSummary: 'lens "structure-vs-compromis", lens "souveraineté-données"',
    selectedCrossRefs: '- LM Pierre-Eric Leibovici (Daphni)\n- GDIY Frédéric Mazzella (BlaBlaCar)',
    ecosystemCanonicalPhrase: 'écosystème Orso',
    ecosystemAlternative: 'team GDIY et Orso Media',
    hostBlacklistPhrases: ['Casquette Verte', 'DOIT'],
  };
}

function makeValidation(score = 6, withSuggestions = true): QualityValidationResult {
  return {
    passed: false,
    score,
    issues: [
      {
        category: 'tone-mismatch',
        severity: 'major',
        description: 'Ouverture descriptive type "Dans cet épisode, X aborde Y".',
      },
      {
        category: 'generic-content',
        severity: 'minor',
        description: 'Conclusion en question rhétorique creuse.',
        excerpt: 'Et vous, qu\'en pensez-vous ?',
      },
    ],
    rewriteSuggestions: withSuggestions ? 'Remplacer ouverture par anecdote.' : undefined,
  };
}

describe('buildOpusRewritePrompt', () => {
  it('contains the 6 newsletters injected', () => {
    const prompt = buildOpusRewritePrompt({
      livrable: 'Livrable Sonnet faible.',
      livrableType: 'newsletter',
      validation: makeValidation(),
      iterationCount: 1,
      episodeContext: makeEpisodeContext(),
      newsletters: makeNewsletters(),
      targetLength: '450-700 mots',
      specificConstraints: 'Newsletter cross-refs naturelles.',
      llmFn: async () => '',
    });
    for (let i = 1; i <= 6; i++) {
      expect(prompt).toContain(`EXEMPLE ${i}`);
      expect(prompt).toContain(`Corps newsletter ${i}`);
    }
  });

  it('contains the validation issues and the current livrable', () => {
    const prompt = buildOpusRewritePrompt({
      livrable: 'TEXTE_ACTUEL_DU_LIVRABLE_SONNET',
      livrableType: 'newsletter',
      validation: makeValidation(),
      iterationCount: 2,
      episodeContext: makeEpisodeContext(),
      newsletters: makeNewsletters(),
      targetLength: '450-700 mots',
      specificConstraints: 'Newsletter.',
      llmFn: async () => '',
    });
    expect(prompt).toContain('TEXTE_ACTUEL_DU_LIVRABLE_SONNET');
    expect(prompt).toContain('Ouverture descriptive');
    expect(prompt).toContain('Conclusion en question rhétorique creuse');
    expect(prompt).toContain('2 itération(s)');
  });

  it('includes blacklist phrases as non-negotiable constraint', () => {
    const prompt = buildOpusRewritePrompt({
      livrable: 'L',
      livrableType: 'newsletter',
      validation: makeValidation(),
      iterationCount: 1,
      episodeContext: makeEpisodeContext(),
      newsletters: makeNewsletters(),
      targetLength: '450-700 mots',
      specificConstraints: 'Newsletter.',
      llmFn: async () => '',
    });
    expect(prompt).toContain('Casquette Verte');
    expect(prompt).toContain('DOIT');
    expect(prompt).toContain('NE JAMAIS attribuer');
  });

  it('includes episode transcript key points and cross-refs', () => {
    const prompt = buildOpusRewritePrompt({
      livrable: 'L',
      livrableType: 'newsletter',
      validation: makeValidation(),
      iterationCount: 1,
      episodeContext: makeEpisodeContext(),
      newsletters: makeNewsletters(),
      targetLength: '450-700 mots',
      specificConstraints: 'Newsletter.',
      llmFn: async () => '',
    });
    expect(prompt).toContain('140M levés');
    expect(prompt).toContain('Pierre-Eric Leibovici');
    expect(prompt).toContain('Frédéric Mazzella');
    expect(prompt).toContain('écosystème Orso');
  });

  it('omits validator suggestions block when none provided', () => {
    const prompt = buildOpusRewritePrompt({
      livrable: 'L',
      livrableType: 'newsletter',
      validation: makeValidation(6, false),
      iterationCount: 1,
      episodeContext: makeEpisodeContext(),
      newsletters: makeNewsletters(),
      targetLength: '450-700 mots',
      specificConstraints: 'Newsletter.',
      llmFn: async () => '',
    });
    expect(prompt).not.toContain('SUGGESTIONS CIBLÉES DU VALIDATEUR');
  });

  it('forbids front-matter generation explicitly', () => {
    const prompt = buildOpusRewritePrompt({
      livrable: 'L',
      livrableType: 'newsletter',
      validation: makeValidation(),
      iterationCount: 1,
      episodeContext: makeEpisodeContext(),
      newsletters: makeNewsletters(),
      targetLength: '450-700 mots',
      specificConstraints: 'Newsletter.',
      llmFn: async () => '',
    });
    expect(prompt).toContain('NE PAS générer de front-matter');
    expect(prompt).toContain('"> Date :"');
  });
});

describe('rewriteWithOpus', () => {
  it('calls llmFn with the built prompt and returns the text', async () => {
    let capturedPrompt = '';
    const llmFn = async (prompt: string) => {
      capturedPrompt = prompt;
      return 'REWRITTEN_TEXT';
    };
    const out = await rewriteWithOpus({
      livrable: 'L_v1',
      livrableType: 'newsletter',
      validation: makeValidation(),
      iterationCount: 1,
      episodeContext: makeEpisodeContext(),
      newsletters: makeNewsletters(),
      targetLength: '450-700 mots',
      specificConstraints: 'Newsletter.',
      llmFn,
    });
    expect(out).toBe('REWRITTEN_TEXT');
    expect(capturedPrompt).toContain('L_v1');
    expect(capturedPrompt).toContain('EXEMPLE 1');
  });

  it('coerces non-string responses to string', async () => {
    const llmFn = async () => ({ unexpected: 'object' });
    const out = await rewriteWithOpus({
      livrable: 'L',
      livrableType: 'newsletter',
      validation: makeValidation(),
      iterationCount: 1,
      episodeContext: makeEpisodeContext(),
      newsletters: makeNewsletters(),
      targetLength: '450-700 mots',
      specificConstraints: 'Newsletter.',
      llmFn,
    });
    expect(typeof out).toBe('string');
  });
});
