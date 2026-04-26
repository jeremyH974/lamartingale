// Editorial event metadata schemas
//
// Each event type stored in editorial_events table (created Phase 2 lundi)
// has its own metadata jsonb shape. This file centralizes the shapes for
// runtime validation (zod) and compile-time typing (TypeScript).
//
// Discipline:
// - One schema per event type, named <Type>MetadataSchema
// - Schemas are append-only: new fields must be optional, removed fields
//   must go through migration with backfill (no silent breaking change)
// - lens_classification is the critical type for lensClassificationAgent
//   (pivot agent identified in persona validation 2026-04-27)
//
// Validation runtime is mandatory: metadata is read from a jsonb column,
// TypeScript types alone offer zero guarantee at the DB boundary.
//
// Anti-overgeneralization (cf. ROADMAP_INTERNE.md, Engagement 4) :
// - Cas présent : lens_classification consommé par cross-refs, brief annexe,
//   newsletter cross-corpus du pilote Stefani-Orso.
// - Cas futurs validés : Espace 2 (re-circulation catalogue), Espace 3
//   (pitch decks sponsor, type audience_match avec shape distinct).
// - Pas de spéculation sur des shapes hypothétiques (key_moment, quote,
//   cross_reference) — placeholders en bas de fichier seulement.
//
// @see clients/stefani-orso.config.ts — lens definitions du pilote
// @see docs/ROADMAP_INTERNE.md — Engagements architecturaux

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Type: lens_classification
// Producer: lensClassificationAgent (pivot post-validation persona 2026-04-27)
// Consumers:
//   - cross-refs by lens                 (Pack 2, livrable cross-refs)
//   - brief annexe « Pour aller plus loin » (Pack 2, livrable annexe)
//   - newsletter cross-corpus            (Pack 2, livrable newsletter)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Position of a matched segment inside source content.
 *
 * Shape kept as a sub-object (not flattened start_seconds/end_seconds at
 * top level) to allow extension to non-podcast formats without breaking
 * existing rows. Future variants likely:
 *   - article  : { paragraph_index: number }
 *   - video    : { start_seconds, end_seconds, frame_url? }
 *
 * The current shape covers the podcast pilot only. A discriminated union
 * will be introduced once a second format is actually implemented (cf.
 * ROADMAP_INTERNE.md vertical presse — pas d'extension spéculative ici).
 */
export const TranscriptSegmentSchema = z
  .object({
    start_seconds: z.number().nonnegative(),
    end_seconds: z.number().nonnegative(),
  })
  .refine((s) => s.end_seconds >= s.start_seconds, {
    message: 'end_seconds must be >= start_seconds',
    path: ['end_seconds'],
  });

export type TranscriptSegment = z.infer<typeof TranscriptSegmentSchema>;

/**
 * Metadata shape for editorial_events of type 'lens_classification'.
 *
 * Design notes (justification anti-overgeneralization) :
 *
 * - lens_id : string (not enum)
 *   Lens registry is per-client (cf. ClientConfig.lenses). A TS enum here
 *   would require a code change every time a client adds a lens. The
 *   producer (lensClassificationAgent) validates lens_id against the
 *   active client's registry — that's where the closed set lives.
 *
 * - lens_score : [0, 1]
 *   Cohérence avec les conventions math (cosine similarity, pgvector,
 *   embedding distances) déjà utilisées dans engine/ai/. Évite les
 *   conversions silencieuses 0–100 ↔ 0–1 entre agents.
 *
 * - rationale : mandatory, 20–500 chars
 *   Explicabilité non-régressive. Un lens sans rationale est suspect et
 *   non-actionnable (sanity check Phase 4 mercredi, debug Sillon UI,
 *   transparence livrables Pack 2). 20 chars min interdit les chaînes
 *   triviales. 500 chars max impose la concision (1–2 phrases).
 *
 * - matched_concepts : optional
 *   Debug uniquement — explainability deep-dive et calibration. Pas
 *   nécessaire au fonctionnement des consommateurs en aval.
 */
export const LensClassificationMetadataSchema = z.object({
  /**
   * Lens ID — référence vers une Lens enregistrée dans le scoring registry
   * du client actif (cf. ClientConfig.lenses).
   *
   * @example 'ovni-vc-deeptech', 'editorial-base', 'expedition-discipline-mentale'
   */
  lens_id: z.string().min(1),

  /**
   * Score de confiance du match.
   * Range : [0, 1] — 1 = match parfait, 0 = aucun match.
   * Threshold d'inclusion en livrable : calibré par lensClassificationAgent
   * (Phase 4 mercredi).
   */
  lens_score: z.number().min(0).max(1),

  /**
   * Position du segment matché dans le contenu source.
   */
  transcript_segment: TranscriptSegmentSchema,

  /**
   * Justification lisible (1–2 phrases). OBLIGATOIRE.
   * Utilisé en : Sillon UI debug, livrables Pack 2 transparence, sanity
   * check Phase 4 mercredi.
   */
  rationale: z.string().min(20).max(500),

  /**
   * Liste de concepts qui ont matché. Debug only, NOT shown to end users.
   */
  matched_concepts: z.array(z.string()).optional(),
});

export type LensClassificationMetadata = z.infer<
  typeof LensClassificationMetadataSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// Future event types (placeholders — implementation deferred)
//
// - key_moment       : pour extractKeyMomentsAgent
// - quote            : pour extractQuotesAgent
// - cross_reference  : pour crossReferenceEpisodeAgent
//
// Each will get its own *MetadataSchema in this file when actually built.
// Tant que le shape n'a pas un consommateur concret, il n'est pas écrit.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Discriminated union of all editorial event metadata shapes.
 * Currently only lens_classification is implemented.
 *
 * Usage from a consumer that reads editorial_events:
 *
 *   if (event.type === 'lens_classification') {
 *     const meta = LensClassificationMetadataSchema.parse(event.metadata);
 *     // meta is fully typed
 *   }
 */
export type EditorialEventMetadata = LensClassificationMetadata;
// | KeyMomentMetadata        (future)
// | QuoteMetadata            (future)
// | CrossReferenceMetadata   (future)
