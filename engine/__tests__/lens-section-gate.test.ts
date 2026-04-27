import { describe, it, expect } from 'vitest';
import { shouldGenerateLensSection } from '@engine/agents/lensSectionGate';

describe('shouldGenerateLensSection', () => {
  it('skips when matches_on_episode < 3 (default)', () => {
    const decision = shouldGenerateLensSection({
      lens_id: 'dtc-acquisition-tactical',
      matches_on_episode: 2,
      candidates: Array.from({ length: 10 }, (_, i) => ({ distance: 0.4 + i * 0.01 })),
    });
    expect(decision.shouldGenerate).toBe(false);
    expect(decision.reason).toMatch(/seulement 2 mention/);
    expect(decision.details.matches_on_episode).toBe(2);
  });

  it('skips when relevant candidates < 5 (default)', () => {
    const decision = shouldGenerateLensSection({
      lens_id: 'b2b-insurance-tech',
      matches_on_episode: 5,
      candidates: [
        { distance: 0.5 },
        { distance: 0.6 },
        { distance: 0.65 }, // 3 < 0.7
        { distance: 0.8 },
        { distance: 0.9 }, // 2 >= 0.7 (filtered out)
      ],
    });
    expect(decision.shouldGenerate).toBe(false);
    expect(decision.reason).toMatch(/Pool pgvector trop restreint/);
    expect(decision.details.relevant_candidates).toBe(3);
  });

  it('passes when both criteria met', () => {
    const decision = shouldGenerateLensSection({
      lens_id: 'ovni-vc-deeptech',
      matches_on_episode: 10,
      candidates: Array.from({ length: 8 }, (_, i) => ({ distance: 0.3 + i * 0.04 })),
    });
    expect(decision.shouldGenerate).toBe(true);
    expect(decision.reason).toBeUndefined();
    expect(decision.details.relevant_candidates).toBeGreaterThanOrEqual(5);
  });

  it('honours overridden thresholds', () => {
    const decision = shouldGenerateLensSection(
      {
        lens_id: 'editorial-base',
        matches_on_episode: 1,
        candidates: [{ distance: 0.2 }],
      },
      {
        minMatchesOnEpisode: 1,
        minRelevantCandidates: 1,
        maxRelevantDistance: 0.3,
      },
    );
    expect(decision.shouldGenerate).toBe(true);
  });

  it('reports thresholds in details', () => {
    const decision = shouldGenerateLensSection({
      lens_id: 'x',
      matches_on_episode: 5,
      candidates: [{ distance: 0.5 }, { distance: 0.6 }, { distance: 0.65 }],
    });
    expect(decision.details).toMatchObject({
      threshold_matches: 3,
      threshold_candidates: 5,
      threshold_distance: 0.7,
    });
  });
});
