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
});
