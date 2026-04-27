import { describe, it, expect } from 'vitest';
import { stefaniOrsoConfig } from '../../clients/stefani-orso.config';

// Test minimal — vérifie que la config Stefani charge, parse au type
// ClientConfig, et expose les invariants attendus (pilote, tenants, packs).

describe('stefani-orso client config', () => {
  it('client_id matches expected', () => {
    expect(stefaniOrsoConfig.client_id).toBe('stefani-orso');
  });

  it('covers the 6 Stefani tenants', () => {
    expect(stefaniOrsoConfig.tenants).toEqual(
      expect.arrayContaining([
        'lamartingale', 'gdiy', 'lepanier',
        'finscale', 'passionpatrimoine', 'combiencagagne',
      ]),
    );
  });

  it('declares pilot context with concrete dates', () => {
    expect(stefaniOrsoConfig.pilot?.is_pilot).toBe(true);
    expect(stefaniOrsoConfig.pilot?.pilot_episodes_target).toBeGreaterThan(0);
    expect(stefaniOrsoConfig.pilot?.pilot_start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('declares forbidden tone patterns', () => {
    expect(stefaniOrsoConfig.tone_profile.forbidden_patterns.length).toBeGreaterThan(0);
  });

  it('declares at least one lens and one sensitive topic', () => {
    expect(stefaniOrsoConfig.lenses.length).toBeGreaterThan(0);
    expect(stefaniOrsoConfig.sensitive_topics.length).toBeGreaterThan(0);
  });

  it('declares the 5 pilot lenses (4 thematic + 1 fallback)', () => {
    const ids = stefaniOrsoConfig.lenses.map((l) => l.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'ovni-vc-deeptech',
        'alternative-investments',
        'dtc-acquisition-tactical',
        'b2b-insurance-tech',
        'editorial-base',
      ]),
    );
    expect(stefaniOrsoConfig.lenses).toHaveLength(5);
  });

  it('all pilot lenses use concept-match-v1 scoring strategy', () => {
    for (const lens of stefaniOrsoConfig.lenses) {
      expect(lens.scoring_strategy_id).toBe('concept-match-v1');
      expect(lens.applicable_content_types).toContain('podcast_episode');
      expect(Array.isArray((lens.parameters as { concepts?: unknown }).concepts)).toBe(true);
    }
  });

  // V4 (refonte Phase 5) — vérifie le bloc style_corpus injecté pour few-shot.
  describe('style_corpus (Phase 5 V4)', () => {
    const corpus = stefaniOrsoConfig.tone_profile.style_corpus;

    it('declares 6 Stefani newsletters with required metadata', () => {
      expect(corpus).toBeDefined();
      expect(corpus!.newsletters).toHaveLength(6);
      for (const n of corpus!.newsletters) {
        expect(n.id).toMatch(/^[a-z0-9-]+$/);
        expect(n.title).toBeTruthy();
        expect(n.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(n.pattern_tags.length).toBeGreaterThan(0);
      }
    });

    it('declares the host_blacklist_phrases superset (>= V2 list)', () => {
      const blacklist = corpus!.host_blacklist_phrases;
      expect(blacklist).toContain('Nous sommes la moyenne des personnes que nous fréquentons');
      expect(blacklist).toContain('Casquette Verte');
    });

    it('declares ecosystem_reference with canonical phrase + alternatives', () => {
      const eco = corpus!.ecosystem_reference;
      expect(eco.canonical_phrase).toBe('écosystème Orso');
      expect(eco.alternatives.length).toBeGreaterThan(0);
      expect(eco.must_appear_in).toEqual(
        expect.arrayContaining(['newsletter', 'brief-annexe']),
      );
    });

    it('declares signature_expressions for recognition', () => {
      expect(corpus!.signature_expressions.length).toBeGreaterThan(0);
      expect(corpus!.signature_expressions).toContain('Boom.');
    });
  });
});
