import { describe, it, expect } from 'vitest';
import {
  LensClassificationMetadataSchema,
  TranscriptSegmentSchema,
  type LensClassificationMetadata,
} from '../db/types/editorial-event-metadata';

// Tests pour le schema metadata du type lens_classification.
// Couvre : cas valides (minimal + complet), cas invalides (chaque
// contrainte), cas edge (bornes 0/1, segment instantané, array vide).

const RATIONALE_OK =
  'Match clair sur le segment où le guest discute deeptech VC.';

const baseValid: LensClassificationMetadata = {
  lens_id: 'ovni-vc-deeptech',
  lens_score: 0.87,
  transcript_segment: { start_seconds: 120, end_seconds: 245 },
  rationale: RATIONALE_OK,
};

describe('LensClassificationMetadataSchema — cas valides', () => {
  it('parse un payload minimal (matched_concepts absent)', () => {
    const result = LensClassificationMetadataSchema.parse(baseValid);
    expect(result.lens_id).toBe('ovni-vc-deeptech');
    expect(result.lens_score).toBe(0.87);
    expect(result.transcript_segment.start_seconds).toBe(120);
    expect(result.matched_concepts).toBeUndefined();
  });

  it('parse un payload complet avec matched_concepts', () => {
    const result = LensClassificationMetadataSchema.parse({
      ...baseValid,
      matched_concepts: ['deeptech', 'biotech', 'series-A'],
    });
    expect(result.matched_concepts).toEqual(['deeptech', 'biotech', 'series-A']);
  });
});

describe('LensClassificationMetadataSchema — cas invalides', () => {
  it('rejette lens_score > 1', () => {
    const result = LensClassificationMetadataSchema.safeParse({
      ...baseValid,
      lens_score: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejette lens_score < 0', () => {
    const result = LensClassificationMetadataSchema.safeParse({
      ...baseValid,
      lens_score: -0.1,
    });
    expect(result.success).toBe(false);
  });

  it('rejette transcript_segment où end < start', () => {
    const result = LensClassificationMetadataSchema.safeParse({
      ...baseValid,
      transcript_segment: { start_seconds: 200, end_seconds: 100 },
    });
    expect(result.success).toBe(false);
  });

  it('rejette transcript_segment avec start_seconds négatif', () => {
    const result = LensClassificationMetadataSchema.safeParse({
      ...baseValid,
      transcript_segment: { start_seconds: -1, end_seconds: 100 },
    });
    expect(result.success).toBe(false);
  });

  it('rejette rationale vide', () => {
    const result = LensClassificationMetadataSchema.safeParse({
      ...baseValid,
      rationale: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejette rationale trop court (< 20 chars)', () => {
    const result = LensClassificationMetadataSchema.safeParse({
      ...baseValid,
      rationale: 'trop court',
    });
    expect(result.success).toBe(false);
  });

  it('rejette rationale trop long (> 500 chars)', () => {
    const result = LensClassificationMetadataSchema.safeParse({
      ...baseValid,
      rationale: 'a'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('rejette lens_id vide', () => {
    const result = LensClassificationMetadataSchema.safeParse({
      ...baseValid,
      lens_id: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejette lens_id manquant', () => {
    const { lens_id, ...withoutLensId } = baseValid;
    const result = LensClassificationMetadataSchema.safeParse(withoutLensId);
    expect(result.success).toBe(false);
  });

  it('rejette transcript_segment manquant', () => {
    const { transcript_segment, ...withoutSegment } = baseValid;
    const result = LensClassificationMetadataSchema.safeParse(withoutSegment);
    expect(result.success).toBe(false);
  });

  it('rejette rationale manquant', () => {
    const { rationale, ...withoutRationale } = baseValid;
    const result = LensClassificationMetadataSchema.safeParse(withoutRationale);
    expect(result.success).toBe(false);
  });
});

describe('LensClassificationMetadataSchema — cas edge', () => {
  it('accepte lens_score = 0 (borne basse)', () => {
    const result = LensClassificationMetadataSchema.safeParse({
      ...baseValid,
      lens_score: 0,
    });
    expect(result.success).toBe(true);
  });

  it('accepte lens_score = 1 (borne haute)', () => {
    const result = LensClassificationMetadataSchema.safeParse({
      ...baseValid,
      lens_score: 1,
    });
    expect(result.success).toBe(true);
  });

  it('accepte transcript_segment où start = end (segment instantané)', () => {
    const result = LensClassificationMetadataSchema.safeParse({
      ...baseValid,
      transcript_segment: { start_seconds: 60, end_seconds: 60 },
    });
    expect(result.success).toBe(true);
  });

  it('accepte matched_concepts = [] (debug vide)', () => {
    const result = LensClassificationMetadataSchema.safeParse({
      ...baseValid,
      matched_concepts: [],
    });
    expect(result.success).toBe(true);
  });

  it('accepte rationale exactement 20 chars (borne min)', () => {
    const result = LensClassificationMetadataSchema.safeParse({
      ...baseValid,
      rationale: 'a'.repeat(20),
    });
    expect(result.success).toBe(true);
  });

  it('accepte rationale exactement 500 chars (borne max)', () => {
    const result = LensClassificationMetadataSchema.safeParse({
      ...baseValid,
      rationale: 'a'.repeat(500),
    });
    expect(result.success).toBe(true);
  });
});

describe('TranscriptSegmentSchema — exporté indépendamment', () => {
  it('parse un segment valide', () => {
    const seg = TranscriptSegmentSchema.parse({
      start_seconds: 0,
      end_seconds: 0,
    });
    expect(seg.start_seconds).toBe(0);
  });

  it('rejette end_seconds négatif', () => {
    const result = TranscriptSegmentSchema.safeParse({
      start_seconds: 10,
      end_seconds: -5,
    });
    expect(result.success).toBe(false);
  });
});
