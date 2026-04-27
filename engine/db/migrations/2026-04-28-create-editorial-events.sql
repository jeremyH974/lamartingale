-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : 2026-04-28 — Create `editorial_events` table
-- ─────────────────────────────────────────────────────────────────────────────
--
-- CONTEXTE
-- ────────
-- Engagement architectural 1 du brief-primitives-2026-04-28 (Sillon pilote
-- Stefani-Orso, Phase 2). Table polymorphe destinée aux événements
-- éditoriaux produits par la couche primitives + lensClassificationAgent.
--
-- Types d'events stockés au moment du pilote :
--   - lens_classification (producteur : lensClassificationAgent, Phase 3)
--   - key_moment          (producteur : extractKeyMoments)
--   - quote               (producteur : extractQuotes)
--   - cross_reference     (producteur : crossReferenceEpisode)
--
-- Types prévus à terme (Espaces 2/3 du récit produit) — ALTER non requis :
--   - audience_match      (Espace 3, attribution sponsor)
--   - sponsor_pitch_seg   (Espace 3, pitch decks)
--   - re_circulation_hit  (Espace 2, re-circulation catalogue)
--
-- DESIGN NOTES
-- ────────────
-- - `type` : TEXT libre (pas d'ENUM SQL). Extensibilité aux espaces 1/2/3
--   sans migration. Le set fermé vit côté code (validators registry zod
--   dans engine/primitives/persistEditorialEvents.ts).
--
-- - `source_id` + `source_type` : permettent d'attacher un event à n'importe
--   quel objet (épisode, article, future colonne pitch deck). source_type
--   default 'episode' pour l'usage pilote.
--
-- - `position` : JSONB pour permettre des positions polymorphes (timestamps
--   audio, paragraph_index pour articles, frame_url pour vidéos). Le
--   shape concret est validé runtime par zod côté primitive (cf.
--   EditorialEventPositionSchema dans persistEditorialEvents.ts).
--
-- - `metadata` : JSONB validé par type. Schéma zod côté code (cf.
--   engine/db/types/editorial-event-metadata.ts). Pas de contrainte SQL
--   forte — la validation est en amont à l'INSERT par
--   `persistEditorialEvents`.
--
-- - `lens_tags` : TEXT[] pour requêtes filtrées par lens. Indexé GIN.
--
-- IDEMPOTENCE
-- ───────────
-- IF NOT EXISTS partout. Réexécutable sans casse.
--
-- WRAPPER
-- ───────
-- Appliqué via `engine/db/migrate-editorial-events.ts` (utilise
-- `engine/db/run-sql-file.ts`, parser SQL corrigé après le bug du legacy
-- parser de `migrate-entities.ts`).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS editorial_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id    TEXT NOT NULL,
  source_type  TEXT NOT NULL DEFAULT 'episode',
  type         TEXT NOT NULL,
  position     JSONB NOT NULL,
  content_text TEXT,
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  lens_tags    TEXT[] NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS editorial_events_source_idx
  ON editorial_events (source_id, source_type);

CREATE INDEX IF NOT EXISTS editorial_events_type_idx
  ON editorial_events (type);

CREATE INDEX IF NOT EXISTS editorial_events_lens_tags_idx
  ON editorial_events USING gin (lens_tags);
