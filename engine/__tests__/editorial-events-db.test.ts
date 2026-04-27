import { describe, it, expect, vi } from 'vitest';
import {
  createInsertBatchFn,
  getEditorialEventsBySource,
  countEditorialEventsBySource,
} from '@engine/db/editorial-events';
import type { EditorialEventInput } from '@engine/primitives/persistEditorialEvents';

// Mock SqlClient (Neon tagged template). The Neon HTTP client is a tagged
// template literal function: it's called as sql`SELECT ...`, which JS
// transpiles to sql([strings_array], ...args). We mock the function to
// inspect the call shape and return a fixture.
type MockResult = unknown[];

function makeMockSql(
  resultPerCall: MockResult[],
): {
  fn: any;
  calls: Array<{ strings: string[]; values: unknown[] }>;
} {
  let callIdx = 0;
  const calls: Array<{ strings: string[]; values: unknown[] }> = [];
  const fn: any = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ strings: [...strings], values });
    const r = resultPerCall[callIdx];
    callIdx++;
    return r ?? [];
  });
  return { fn, calls };
}

const VALID_LENS_INPUT: EditorialEventInput = {
  type: 'lens_classification',
  position: { start_seconds: 120, end_seconds: 180 },
  content_text: 'Frédéric explique sa stratégie 100% remote.',
  metadata: {
    lens_id: 'ovni-vc-deeptech',
    lens_score: 0.85,
    transcript_segment: { start_seconds: 120, end_seconds: 180 },
    rationale: 'Scaleup tech B2B européenne, levée significative.',
  },
  lens_tags: ['ovni-vc-deeptech'],
};

const INSERTED_FIXTURE = {
  id: '11111111-2222-3333-4444-555555555555',
  source_id: 'gdiy-266',
  source_type: 'episode',
  type: 'lens_classification',
  position: { start_seconds: 120, end_seconds: 180 },
  content_text: 'Frédéric explique sa stratégie 100% remote.',
  metadata: VALID_LENS_INPUT.metadata,
  lens_tags: ['ovni-vc-deeptech'],
  created_at: '2026-04-28T10:00:00.000Z',
};

describe('createInsertBatchFn', () => {
  it('returns empty array for empty input', async () => {
    const { fn } = makeMockSql([]);
    const insert = createInsertBatchFn(fn);
    const result = await insert([], 'gdiy-266', 'episode');
    expect(result).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it('inserts one event and returns the inserted row', async () => {
    const { fn, calls } = makeMockSql([[INSERTED_FIXTURE]]);
    const insert = createInsertBatchFn(fn);
    const result = await insert([VALID_LENS_INPUT], 'gdiy-266', 'episode');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(INSERTED_FIXTURE.id);
    expect(fn).toHaveBeenCalledOnce();

    // The tagged template should include the sourceId, sourceType, type
    // values in the value-args (positions 0, 1, 2 in our SQL template).
    const [call] = calls;
    expect(call.values).toContain('gdiy-266');
    expect(call.values).toContain('episode');
    expect(call.values).toContain('lens_classification');
  });

  it('inserts N events sequentially', async () => {
    const fixtures = [
      { ...INSERTED_FIXTURE, id: 'id-1' },
      { ...INSERTED_FIXTURE, id: 'id-2' },
      { ...INSERTED_FIXTURE, id: 'id-3' },
    ];
    const { fn } = makeMockSql([
      [fixtures[0]],
      [fixtures[1]],
      [fixtures[2]],
    ]);
    const insert = createInsertBatchFn(fn);
    const result = await insert(
      [VALID_LENS_INPUT, VALID_LENS_INPUT, VALID_LENS_INPUT],
      'gdiy-266',
      'episode',
    );
    expect(result.map((r) => r.id)).toEqual(['id-1', 'id-2', 'id-3']);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('passes content_text=null when not provided', async () => {
    const { fn, calls } = makeMockSql([[INSERTED_FIXTURE]]);
    const insert = createInsertBatchFn(fn);
    const ev: EditorialEventInput = {
      type: 'lens_classification',
      position: { start_seconds: 0, end_seconds: 10 },
      metadata: {},
    };
    await insert([ev], 'gdiy-266', 'episode');
    expect(calls[0].values).toContain(null);
  });

  it('serializes position and metadata as JSON strings', async () => {
    const { fn, calls } = makeMockSql([[INSERTED_FIXTURE]]);
    const insert = createInsertBatchFn(fn);
    await insert([VALID_LENS_INPUT], 'gdiy-266', 'episode');
    const positionStr = calls[0].values.find(
      (v) => typeof v === 'string' && v.includes('start_seconds'),
    );
    expect(positionStr).toBeDefined();
    expect(JSON.parse(positionStr as string)).toEqual(VALID_LENS_INPUT.position);
  });
});

describe('getEditorialEventsBySource', () => {
  it('returns events from sql result', async () => {
    const { fn } = makeMockSql([[INSERTED_FIXTURE, { ...INSERTED_FIXTURE, id: 'id-2' }]]);
    const result = await getEditorialEventsBySource(fn, 'gdiy-266');
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(INSERTED_FIXTURE.id);
  });

  it('passes source_id and source_type to query', async () => {
    const { fn, calls } = makeMockSql([[]]);
    await getEditorialEventsBySource(fn, 'gdiy-266', 'pitch_deck');
    expect(calls[0].values).toContain('gdiy-266');
    expect(calls[0].values).toContain('pitch_deck');
  });

  it('passes types filter when provided', async () => {
    const { fn, calls } = makeMockSql([[]]);
    await getEditorialEventsBySource(fn, 'gdiy-266', 'episode', {
      types: ['lens_classification', 'key_moment'],
    });
    const arrayValue = calls[0].values.find(
      (v): v is string[] => Array.isArray(v) && (v as string[]).includes('lens_classification'),
    );
    expect(arrayValue).toEqual(['lens_classification', 'key_moment']);
  });

  it('passes null types filter when omitted (no filter applied)', async () => {
    const { fn, calls } = makeMockSql([[]]);
    await getEditorialEventsBySource(fn, 'gdiy-266');
    expect(calls[0].values).toContain(null);
  });

  it('default sourceType is episode', async () => {
    const { fn, calls } = makeMockSql([[]]);
    await getEditorialEventsBySource(fn, 'gdiy-266');
    expect(calls[0].values).toContain('episode');
  });
});

describe('countEditorialEventsBySource', () => {
  it('returns 0 when no rows', async () => {
    const { fn } = makeMockSql([[]]);
    const c = await countEditorialEventsBySource(fn, 'gdiy-266');
    expect(c).toBe(0);
  });

  it('returns count from {c: N}', async () => {
    const { fn } = makeMockSql([[{ c: 42 }]]);
    const c = await countEditorialEventsBySource(fn, 'gdiy-266');
    expect(c).toBe(42);
  });
});
