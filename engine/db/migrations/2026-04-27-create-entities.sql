-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : 2026-04-27 — Create `entities` table
-- ─────────────────────────────────────────────────────────────────────────────
--
-- CONTEXTE
-- ────────
-- Sillon : préparation architecturale couche primitives (lundi 28/04).
-- Généralisation du pattern `cross_podcast_guests` vers une table polymorphe
-- `entities` capable de représenter person/organization
-- selon les verticales identifiées dans docs/ROADMAP_INTERNE.md
-- (podcast actuel = person, presse/cinéma/talent = organization explicite).
--
-- 'brand'/'place'/'work' délibérément exclus du CHECK : pas justifiés par
-- la roadmap actuelle. ALTER trivial le jour où un cas concret apparaît.
--
-- `cross_podcast_guests` reste 100% fonctionnelle en parallèle.
-- La migration progressive des données se fera post-pilote.
--
-- RÈGLE ANTI-OVERGENERALIZATION
-- ─────────────────────────────
-- Chaque champ ajouté est justifié par :
--   - cas présent (cross_podcast_guests, person)
--   - ET cas futur listé dans docs/ROADMAP_INTERNE.md.
--
-- entity_type CHECK constraint volontairement limitatif (pas de "ANY TEXT")
-- pour éviter le scope creep involontaire à l'INSERT.
--
-- IDEMPOTENCE
-- ───────────
-- IF NOT EXISTS partout. Réexécutable sans casser une instance déjà migrée.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS entities (
  id              BIGSERIAL PRIMARY KEY,
  entity_type     TEXT NOT NULL,
  canonical_slug  TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT entities_type_check CHECK (
    entity_type IN ('person', 'organization')
  )
);

CREATE INDEX IF NOT EXISTS entities_type_idx ON entities (entity_type);
CREATE INDEX IF NOT EXISTS entities_slug_idx ON entities (canonical_slug);
