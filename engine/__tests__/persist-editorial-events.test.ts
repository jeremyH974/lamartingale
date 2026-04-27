import { describe, it, expect, vi } from 'vitest';
import {
  persistEditorialEvents,
  defaultValidators,
  chunkArray,
  EditorialEventPositionSchema,
  type EditorialEventInput,
  type EditorialEvent,
  type InsertBatchFn,
  type MetadataValidator,
} from '@engine/primitives/persistEditorialEvents';

const SOURCE_ID = 'gdiy-266';

const VALID_LENS_EVENT: EditorialEventInput = {
  type: 'lens_classification',
  position: { start_seconds: 120, end_seconds: 180 },
  content_text: 'Frédéric explique sa stratégie 100% remote.',
  metadata: {
    lens_id: 'ovni-vc-deeptech',
    lens_score: 0.85,
    transcript_segment: { start_seconds: 120, end_seconds: 180 },
    rationale: 'Scaleup tech B2B européenne, levée significative.',
    matched_concepts: ['scaleup tech B2B', 'levée Series'],
  },
  lens_tags: ['ovni-vc-deeptech'],
};

function makeInsertedFromInput(events: EditorialEventInput[], sourceId: string, sourceType: string): EditorialEvent[] {
  return events.map((ev, i) => ({
    id: `mock-id-${sourceId}-${i}-${Math.random().toString(36).slice(2, 6)}`,
    source_id: sourceId,
    source_type: sourceType,
    type: ev.type,
    position: ev.position,
    content_text: ev.content_text ?? null,
    metadata: ev.metadata,
    lens_tags: ev.lens_tags ?? [],
    created_at: new Date().toISOString(),
  }));
}

function trackingInsertBatchFn(): {
  fn: InsertBatchFn;
  batches: Array<{ size: number; sourceId: string; sourceType: string }>;
} {
  const batches: Array<{ size: number; sourceId: string; sourceType: string }> = [];
  const fn: InsertBatchFn = vi.fn(async (events, sourceId, sourceType) => {
    batches.push({ size: events.length, sourceId, sourceType });
    return makeInsertedFromInput(events, sourceId, sourceType);
  });
  return { fn, batches };
}

describe('chunkArray', () => {
  it('splits 20 items into batches of 8/8/4', () => {
    const arr = Array.from({ length: 20 }, (_, i) => i);
    const chunks = chunkArray(arr, 8);
    expect(chunks.map((c) => c.length)).toEqual([8, 8, 4]);
  });

  it('splits 5 items into single batch of 5 with size 8', () => {
    expect(chunkArray([1, 2, 3, 4, 5], 8)).toEqual([[1, 2, 3, 4, 5]]);
  });

  it('throws on size <= 0', () => {
    expect(() => chunkArray([1], 0)).toThrow();
  });
});

describe('EditorialEventPositionSchema', () => {
  it('accepts valid position', () => {
    expect(() =>
      EditorialEventPositionSchema.parse({ start_seconds: 0, end_seconds: 60 }),
    ).not.toThrow();
  });

  it('rejects end < start', () => {
    expect(() =>
      EditorialEventPositionSchema.parse({ start_seconds: 60, end_seconds: 30 }),
    ).toThrow();
  });

  it('rejects negative seconds', () => {
    expect(() =>
      EditorialEventPositionSchema.parse({ start_seconds: -1, end_seconds: 10 }),
    ).toThrow();
  });
});

describe('defaultValidators', () => {
  it('contains lens_classification', () => {
    const v = defaultValidators();
    expect(v.has('lens_classification')).toBe(true);
  });

  it('lens_classification validator throws on invalid metadata', () => {
    const v = defaultValidators();
    const validator = v.get('lens_classification')!;
    expect(() => validator({ lens_id: '', lens_score: 2 })).toThrow();
  });

  it('lens_classification validator passes on valid metadata', () => {
    const v = defaultValidators();
    const validator = v.get('lens_classification')!;
    expect(() => validator(VALID_LENS_EVENT.metadata)).not.toThrow();
  });
});

describe('persistEditorialEvents', () => {
  it('inserts a valid lens_classification event', async () => {
    const { fn, batches } = trackingInsertBatchFn();
    const result = await persistEditorialEvents(
      [VALID_LENS_EVENT],
      { sourceId: SOURCE_ID },
      { insertBatchFn: fn },
    );
    expect(result.events).toHaveLength(1);
    expect(result.events[0].source_id).toBe(SOURCE_ID);
    expect(result.events[0].source_type).toBe('episode');
    expect(batches).toHaveLength(1);
    expect(batches[0].size).toBe(1);
  });

  it('throws when lens_classification metadata fails zod validation', async () => {
    const bad: EditorialEventInput = {
      ...VALID_LENS_EVENT,
      metadata: {
        lens_id: 'ovni-vc-deeptech',
        lens_score: 1.5, // out of range
        transcript_segment: { start_seconds: 0, end_seconds: 10 },
        rationale: 'short', // too short (<20)
      },
    };
    const { fn } = trackingInsertBatchFn();
    await expect(
      persistEditorialEvents([bad], { sourceId: SOURCE_ID }, { insertBatchFn: fn }),
    ).rejects.toThrow(/metadata invalid for type 'lens_classification'/);
  });

  it('batches 20 events into 3 batches of 8/8/4', async () => {
    const events = Array.from({ length: 20 }, () => ({ ...VALID_LENS_EVENT }));
    const { fn, batches } = trackingInsertBatchFn();
    const result = await persistEditorialEvents(events, { sourceId: SOURCE_ID }, {
      insertBatchFn: fn,
    });
    expect(result.events).toHaveLength(20);
    expect(batches.map((b) => b.size)).toEqual([8, 8, 4]);
  });

  it('respects custom batchSize', async () => {
    const events = Array.from({ length: 10 }, () => ({ ...VALID_LENS_EVENT }));
    const { fn, batches } = trackingInsertBatchFn();
    await persistEditorialEvents(events, { sourceId: SOURCE_ID }, {
      insertBatchFn: fn,
      batchSize: 4,
    });
    expect(batches.map((b) => b.size)).toEqual([4, 4, 2]);
  });

  it('warns when type has no registered validator (non-strict mode)', async () => {
    const unknown: EditorialEventInput = {
      type: 'audience_match',
      position: { start_seconds: 0, end_seconds: 10 },
      metadata: { foo: 'bar' },
    };
    const { fn } = trackingInsertBatchFn();
    const result = await persistEditorialEvents([unknown], { sourceId: SOURCE_ID }, {
      insertBatchFn: fn,
    });
    expect(result.events).toHaveLength(1);
    expect(result.warnings.some((w) => /no registered validator/.test(w))).toBe(true);
  });

  it('throws when type has no validator and strictMode=true', async () => {
    const unknown: EditorialEventInput = {
      type: 'audience_match',
      position: { start_seconds: 0, end_seconds: 10 },
      metadata: { foo: 'bar' },
    };
    const { fn } = trackingInsertBatchFn();
    await expect(
      persistEditorialEvents([unknown], { sourceId: SOURCE_ID }, {
        insertBatchFn: fn,
        strictMode: true,
      }),
    ).rejects.toThrow(/strict mode/);
  });

  it('throws when sourceId missing', async () => {
    await expect(
      persistEditorialEvents([VALID_LENS_EVENT], { sourceId: '' }, {
        insertBatchFn: trackingInsertBatchFn().fn,
      }),
    ).rejects.toThrow(/sourceId is required/);
  });

  it('throws when position end < start', async () => {
    const bad: EditorialEventInput = {
      ...VALID_LENS_EVENT,
      position: { start_seconds: 100, end_seconds: 50 },
    };
    await expect(
      persistEditorialEvents([bad], { sourceId: SOURCE_ID }, {
        insertBatchFn: trackingInsertBatchFn().fn,
      }),
    ).rejects.toThrow(/invalid position/);
  });

  it('returns empty result with warning on empty events', async () => {
    const { fn } = trackingInsertBatchFn();
    const result = await persistEditorialEvents([], { sourceId: SOURCE_ID }, {
      insertBatchFn: fn,
    });
    expect(result.events).toHaveLength(0);
    expect(result.warnings).toContain('no events to persist (empty input)');
    expect(fn).not.toHaveBeenCalled();
  });

  it('uses custom validators registry when provided', async () => {
    const customValidators = new Map<string, MetadataValidator>([
      [
        'custom_type',
        (meta: unknown) => {
          if (
            typeof meta !== 'object' ||
            meta === null ||
            !('expected' in meta)
          ) {
            throw new Error('custom_type requires `expected` field');
          }
          return meta;
        },
      ],
    ]);
    const ev: EditorialEventInput = {
      type: 'custom_type',
      position: { start_seconds: 0, end_seconds: 5 },
      metadata: { expected: true },
    };
    const { fn } = trackingInsertBatchFn();
    const result = await persistEditorialEvents([ev], { sourceId: SOURCE_ID }, {
      insertBatchFn: fn,
      validators: customValidators,
    });
    expect(result.events).toHaveLength(1);
  });

  it('respects custom sourceType', async () => {
    const { fn, batches } = trackingInsertBatchFn();
    await persistEditorialEvents([VALID_LENS_EVENT], {
      sourceId: SOURCE_ID,
      sourceType: 'pitch_deck',
    }, { insertBatchFn: fn });
    expect(batches[0].sourceType).toBe('pitch_deck');
  });
});
