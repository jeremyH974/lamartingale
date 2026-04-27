import { describe, it, expect, beforeEach } from 'vitest';
import {
  conceptMatchV1,
  CONCEPT_MATCH_V1_ID,
} from '@engine/lens/concept-match-v1';
import {
  registerPilotScoringStrategies,
  getScoringStrategy,
  hasScoringStrategy,
  clearScoringRegistry,
  listScoringStrategies,
} from '@engine/lens';
import type { EditorialEvent } from '@engine/primitives/persistEditorialEvents';

function makeEvent(overrides?: Partial<EditorialEvent>): EditorialEvent {
  return {
    id: 'mock-id',
    source_id: 'gdiy-266',
    source_type: 'episode',
    type: 'lens_classification',
    position: { start_seconds: 0, end_seconds: 60 },
    content_text: 'default content',
    metadata: {},
    lens_tags: [],
    created_at: '2026-04-28T10:00:00Z',
    ...overrides,
  };
}

describe('concept-match-v1', () => {
  it('returns 0 if concepts is empty', () => {
    expect(conceptMatchV1(makeEvent(), { concepts: [] })).toBe(0);
  });

  it('returns 0 if content_text is empty', () => {
    expect(
      conceptMatchV1(makeEvent({ content_text: '' }), { concepts: ['foo'] }),
    ).toBe(0);
  });

  it('returns 0 if content_text is null', () => {
    expect(
      conceptMatchV1(makeEvent({ content_text: null }), { concepts: ['foo'] }),
    ).toBe(0);
  });

  it('returns 1.0 when all concepts match', () => {
    const event = makeEvent({
      content_text:
        'Frédéric a levé 140 M€ pour Platform.sh, scaleup tech B2B européenne.',
    });
    const score = conceptMatchV1(event, {
      concepts: ['scaleup tech B2B européenne'],
    });
    expect(score).toBe(1);
  });

  it('returns ratio matched/total when partial match', () => {
    const event = makeEvent({
      content_text: 'Discussion sur le scaleup tech B2B en Europe.',
    });
    const score = conceptMatchV1(event, {
      concepts: ['scaleup tech B2B', 'levée Series B+', 'deeptech infrastructure'],
    });
    expect(score).toBeCloseTo(1 / 3, 5);
  });

  it('matches across accent variants (idéologie ↔ ideologie)', () => {
    const event = makeEvent({
      content_text: 'Le Bitcoin est une idéologie pour Eric.',
    });
    const score = conceptMatchV1(event, {
      concepts: ['ideologie', 'investissement'],
    });
    expect(score).toBeCloseTo(0.5, 5);
  });

  it('matches across casing variants (Bitcoin ↔ bitcoin)', () => {
    const event = makeEvent({
      content_text: 'BITCOIN est partout.',
    });
    const score = conceptMatchV1(event, { concepts: ['bitcoin'] });
    expect(score).toBe(1);
  });

  it('throws when params is not { concepts: string[] }', () => {
    expect(() => conceptMatchV1(makeEvent(), null)).toThrow(/params/);
    expect(() => conceptMatchV1(makeEvent(), {})).toThrow(/params/);
    expect(() =>
      conceptMatchV1(makeEvent(), { concepts: 'not-array' as unknown as string[] }),
    ).toThrow(/params/);
    expect(() =>
      conceptMatchV1(makeEvent(), { concepts: [123] as unknown as string[] }),
    ).toThrow(/params/);
  });

  it('skips empty/whitespace concepts in count denominator? No, kept in denominator', () => {
    // The denominator stays at the count provided. Empty concepts count as
    // 0 matches but ARE in the denominator. This is intentional: a config
    // with whitespace concepts is malformed and the score reflects it.
    const event = makeEvent({ content_text: 'foo bar baz' });
    const score = conceptMatchV1(event, {
      concepts: ['foo', '', '   '],
    });
    expect(score).toBeCloseTo(1 / 3, 5);
  });
});

describe('registerPilotScoringStrategies', () => {
  beforeEach(() => {
    clearScoringRegistry();
  });

  it('registers concept-match-v1 in the registry', () => {
    expect(hasScoringStrategy(CONCEPT_MATCH_V1_ID)).toBe(false);
    registerPilotScoringStrategies();
    expect(hasScoringStrategy(CONCEPT_MATCH_V1_ID)).toBe(true);
    expect(getScoringStrategy(CONCEPT_MATCH_V1_ID)).toBe(conceptMatchV1);
  });

  it('is idempotent', () => {
    registerPilotScoringStrategies();
    const before = listScoringStrategies();
    registerPilotScoringStrategies();
    const after = listScoringStrategies();
    expect(after).toEqual(before);
  });

  it('returns the list of registered ids', () => {
    const list = registerPilotScoringStrategies();
    expect(list).toContain(CONCEPT_MATCH_V1_ID);
  });
});
