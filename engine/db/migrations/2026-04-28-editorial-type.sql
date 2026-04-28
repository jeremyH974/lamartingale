-- Phase A.5.4 (2026-04-28) — ajout colonne editorial_type sur table episodes
-- ────────────────────────────────────────────────────────────────────────
--
-- ATTENTION sémantique :
--   `episode_type`    (déjà existant) = iTunes RSS <itunes:episodeType>
--                                       valeurs : 'full' | 'bonus' | 'trailer' | NULL
--   `editorial_type`  (cette migration) = classification ÉDITORIALE issue du title
--                                       valeurs : 'full' | 'extract' | 'teaser' |
--                                                 'rediff' | 'bonus' | 'hs' |
--                                                 'unknown'
--
-- Les deux notions cohabitent (orthogonales). Le hub queries en double filtre :
--   (episode_type = 'full' OR episode_type IS NULL) AND editorial_type = 'full'
--
-- Étape 1/3 : ALTER TABLE (non-destructive, instantanée).
-- Étape 2/3 : CREATE INDEX (non-destructive, instantanée).
-- Étape 3/3 : backfill via scripts/migrate-editorial-type.ts (--dry → --write).
--
-- Toutes les rows existantes recevront 'unknown' par DEFAULT à l'ALTER, le
-- backfill les classifiera ensuite via classifyEditorialType(title).
-- Les futures rows (post-A.5.5) recevront leur classification dès l'INSERT
-- via ingest-rss.ts.
--
-- Idempotence : ADD COLUMN IF NOT EXISTS et CREATE INDEX IF NOT EXISTS
-- permettent de re-run cette migration sans erreur si déjà appliquée.
-- ────────────────────────────────────────────────────────────────────────

-- Étape 1 : colonne avec default 'unknown'
ALTER TABLE episodes
  ADD COLUMN IF NOT EXISTS editorial_type TEXT NOT NULL DEFAULT 'unknown';

-- Étape 2 : index composite (tenant_id, editorial_type) — supporte les queries
-- universe.ts (filtre `tenant_id = ANY(...) AND editorial_type = 'full'`).
CREATE INDEX IF NOT EXISTS idx_episodes_tenant_editorial_type
  ON episodes (tenant_id, editorial_type);

-- Étape 3 : voir scripts/migrate-editorial-type.ts (Node, dry-run obligatoire).
