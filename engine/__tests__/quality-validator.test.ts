import { describe, it, expect, vi } from 'vitest';
import {
  validateLivrableQuality,
  buildValidatorPrompt,
  rewriteLivrable,
  runValidatedGeneration,
} from '@engine/agents/qualityValidator';
import type { LLMFn } from '@engine/primitives/types';
import type { ClientStyleCorpus } from '@engine/types/client-config';

const STYLE_CORPUS: ClientStyleCorpus = {
  newsletters: [],
  host_blacklist_phrases: ['Casquette Verte', 'Phrase fétiche du host'],
  signature_expressions: ['Boom.', 'Sale.'],
  ecosystem_reference: {
    canonical_phrase: 'écosystème Orso',
    alternatives: ['catalogue Orso Media'],
    must_appear_in: ['newsletter'],
    appearance_style: 'naturelle',
  },
};

const CTX = {
  guestName: 'Frédéric Plais',
  hostName: 'Matthieu Stefani',
  styleCorpus: STYLE_CORPUS,
  forbiddenPatterns: ['plongez dans', 'résonance avec'],
};

function fixedLlmFn(payload: unknown): LLMFn {
  return vi.fn(async () => JSON.stringify(payload));
}

describe('buildValidatorPrompt', () => {
  it('includes blacklist, forbidden, ecosystem and livrable', () => {
    const prompt = buildValidatorPrompt('Texte du livrable test.', 'newsletter', CTX);
    expect(prompt).toContain('Casquette Verte');
    expect(prompt).toContain('plongez dans');
    expect(prompt).toContain('écosystème Orso');
    expect(prompt).toContain('Texte du livrable test.');
    expect(prompt).toContain('newsletter');
    expect(prompt).toContain('Frédéric Plais');
  });
});

describe('validateLivrableQuality', () => {
  it('returns parsed result when LLM returns valid JSON', async () => {
    const llm = fixedLlmFn({
      passed: true,
      score: 8.2,
      issues: [],
    });
    const r = await validateLivrableQuality('texte', 'newsletter', CTX, llm);
    expect(r.passed).toBe(true);
    expect(r.score).toBe(8.2);
    expect(r.issues).toEqual([]);
  });

  it('returns conservative fallback when LLM returns garbage', async () => {
    const llm: LLMFn = vi.fn(async () => 'not a json string at all');
    const r = await validateLivrableQuality('texte', 'newsletter', CTX, llm);
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0);
    expect(r.issues.length).toBeGreaterThan(0);
  });

  it('returns conservative fallback when LLM call throws', async () => {
    const llm: LLMFn = vi.fn(async () => {
      throw new Error('rate limited');
    });
    const r = await validateLivrableQuality('texte', 'newsletter', CTX, llm);
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0);
    expect(r.issues[0].description).toMatch(/rate limited/);
  });

  it('returns 0 + critical issue when livrable is empty', async () => {
    const llm = fixedLlmFn({ passed: true, score: 10, issues: [] });
    const r = await validateLivrableQuality('   ', 'newsletter', CTX, llm);
    expect(r.score).toBe(0);
    expect(r.issues[0].severity).toBe('critical');
    expect(llm).not.toHaveBeenCalled();
  });

  it('rejects schema-invalid payloads (score out of range)', async () => {
    const llm = fixedLlmFn({ passed: true, score: 42, issues: [] });
    const r = await validateLivrableQuality('texte', 'newsletter', CTX, llm);
    expect(r.passed).toBe(false);
  });

  it('detects blacklist forbidden-phrase issue from LLM', async () => {
    const llm = fixedLlmFn({
      passed: false,
      score: 5,
      issues: [
        {
          category: 'forbidden-phrase',
          severity: 'critical',
          description: 'Phrase Casquette Verte attribuée à invité',
          excerpt: 'Casquette Verte',
        },
      ],
      rewriteSuggestions: 'Supprimer la phrase fautive.',
    });
    const r = await validateLivrableQuality('texte', 'newsletter', CTX, llm);
    expect(r.passed).toBe(false);
    expect(r.issues[0].category).toBe('forbidden-phrase');
    expect(r.rewriteSuggestions).toBeDefined();
  });
});

describe('rewriteLivrable', () => {
  it('calls LLM with rewrite prompt containing issues block', async () => {
    let captured = '';
    const llm: LLMFn = vi.fn(async (prompt: string) => {
      captured = prompt;
      return 'Texte réécrit propre.';
    });
    const out = await rewriteLivrable({
      livrable: 'texte original',
      livrableType: 'newsletter',
      context: CTX,
      validation: {
        passed: false,
        score: 5.5,
        issues: [
          {
            category: 'generic-content',
            severity: 'major',
            description: 'Trop scolaire',
            excerpt: 'Phrase scolaire',
          },
        ],
        rewriteSuggestions: 'Casser les phrases courtes.',
      },
      originalPrompt: 'PROMPT D ORIGINE',
      llmFn: llm,
    });
    expect(out).toBe('Texte réécrit propre.');
    expect(captured).toContain('PROMPT D ORIGINE');
    expect(captured).toContain('Trop scolaire');
    expect(captured).toContain('Casser les phrases courtes');
  });
});

describe('runValidatedGeneration', () => {
  it('returns immediately when initial passes', async () => {
    const llm = fixedLlmFn({ passed: true, score: 8.5, issues: [] });
    const out = await runValidatedGeneration({
      initialText: 'OK',
      originalPrompt: 'P',
      livrableType: 'newsletter',
      context: CTX,
      llmFn: llm,
    });
    expect(out.iterations).toBe(1);
    expect(out.finalValidation.passed).toBe(true);
    expect(llm).toHaveBeenCalledTimes(1);
  });

  it('caps at maxIterations and returns best version seen', async () => {
    let call = 0;
    const llm: LLMFn = vi.fn(async (prompt: string) => {
      call++;
      // Validation passes return JSON, rewrite passes return text
      if (prompt.includes('CRITÈRES DE VALIDATION')) {
        // First validation: 5.0, second: 6.0, third: 6.5 (none pass 7.5)
        if (call === 1) return JSON.stringify({ passed: false, score: 5.0, issues: [{ category: 'tone-mismatch', severity: 'major', description: 'issue placeholder' }], rewriteSuggestions: 'r' });
        if (call === 3) return JSON.stringify({ passed: false, score: 6.0, issues: [{ category: 'tone-mismatch', severity: 'minor', description: 'issue placeholder' }] });
        if (call === 5) return JSON.stringify({ passed: false, score: 6.5, issues: [{ category: 'tone-mismatch', severity: 'minor', description: 'issue placeholder' }] });
      }
      // Rewrite passes
      return 'Rewritten';
    });
    const out = await runValidatedGeneration({
      initialText: 'Initial',
      originalPrompt: 'P',
      livrableType: 'newsletter',
      context: CTX,
      llmFn: llm,
      maxIterations: 3,
    });
    expect(out.iterations).toBe(3);
    expect(out.finalValidation.score).toBe(6.5);
    expect(out.history.length).toBe(3);
  });

  it('returns success on iteration 2 if rewrite improves to >= 7.5', async () => {
    let call = 0;
    const llm: LLMFn = vi.fn(async (prompt: string) => {
      call++;
      if (prompt.includes('CRITÈRES DE VALIDATION')) {
        if (call === 1) return JSON.stringify({ passed: false, score: 6.0, issues: [{ category: 'tone-mismatch', severity: 'major', description: 'issue placeholder' }], rewriteSuggestions: 'r' });
        return JSON.stringify({ passed: true, score: 8.0, issues: [] });
      }
      return 'Better text';
    });
    const out = await runValidatedGeneration({
      initialText: 'Initial',
      originalPrompt: 'P',
      livrableType: 'newsletter',
      context: CTX,
      llmFn: llm,
      maxIterations: 3,
    });
    expect(out.iterations).toBe(2);
    expect(out.finalText).toBe('Better text');
    expect(out.finalValidation.score).toBe(8.0);
  });

  it('stops cleanly if rewrite throws (returns best so far)', async () => {
    let call = 0;
    const llm: LLMFn = vi.fn(async (prompt: string) => {
      call++;
      if (prompt.includes('CRITÈRES DE VALIDATION')) {
        return JSON.stringify({ passed: false, score: 5.5, issues: [{ category: 'tone-mismatch', severity: 'major', description: 'issue placeholder' }], rewriteSuggestions: 'r' });
      }
      throw new Error('rewrite failed');
    });
    const out = await runValidatedGeneration({
      initialText: 'Initial',
      originalPrompt: 'P',
      livrableType: 'newsletter',
      context: CTX,
      llmFn: llm,
      maxIterations: 3,
    });
    expect(out.iterations).toBe(1);
    expect(out.finalText).toBe('Initial');
    expect(out.finalValidation.score).toBe(5.5);
  });
});
