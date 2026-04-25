-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : 2026-04-25 — Fix tenant attribution + composite FK invariant
-- ─────────────────────────────────────────────────────────────────────────────
--
-- CONTEXTE
-- ────────
-- Bug détecté pendant l'audit Q1bis (Phase 1.5 du chantier LinkedIn pollution) :
-- 1853 rows dans `episode_links` portaient `tenant_id='lamartingale'` alors que
-- leur `episode_id` parent appartenait en réalité à `tenant_id='gdiy'`.
--
-- Asymétrie totale : 0 row inverse (gdiy → lamartingale). 7 autres relations
-- enfant (episodes_media, episodes_enrichment, quiz_questions,
-- episode_similarities ×2, guest_episodes ×2) auditées : toutes propres.
--
-- Hypothèse causale : backfill historique pré-multi-tenant qui a default'é
-- `episode_links.tenant_id = 'lamartingale'` lors de l'ajout de la colonne,
-- sans JOIN sur `episodes`. Les guests/episodes inserts ultérieurs en GDIY
-- ont créé l'asymétrie observée.
--
-- IMPACT PRODUIT (avant fix)
-- ──────────────────────────
-- Distribution des 1853 rows mal attribuées :
--   company=701, resource=646, episode_ref=375, linkedin=127, tool=4
-- Conséquences :
--   - LinkedIn parasites attribués au mauvais tenant (pollution scrape-deep)
--   - cross_podcast_ref biaisés
--   - dashboard /api/links/stats incorrect
--
-- STRATÉGIE
-- ─────────
-- 1. UPDATE de réalignement : `episode_links.tenant_id = episodes.tenant_id`
-- 2. UNIQUE composites sur les 2 parents (`episodes`, `guests`) sur (id, tenant_id)
-- 3. 8 FK simples remplacées par FK composites (child_col, tenant_id)
--    REFERENCES parent(id, tenant_id) — garantit qu'un mismatch tenant ne peut
--    PLUS être inséré au niveau contrainte.
--
-- ON DELETE CASCADE préservée explicitement sur episode_links (seule FK qui
-- l'avait avant). Toutes les autres : NO ACTION (default Postgres).
--
-- PERSISTANCE
-- ───────────
-- Appliqué en transaction atomique sur Neon prod le 2026-04-25 (~6s).
-- Re-audit hors-transaction : 0/8 cross-tenant rows restantes ✅.
-- Test invariant en prod : INSERT désaligné rejeté (FK violation) ✅.
--
-- Re-jouable : safe en idempotence si déjà appliqué (les ALTER échoueront sur
-- contraintes existantes — wrap dans une transaction et adapter au besoin).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Phase 1 — Réalignement des 1853 rows ────────────────────────────────────
UPDATE episode_links el
SET tenant_id = e.tenant_id
FROM episodes e
WHERE el.episode_id = e.id
  AND el.tenant_id <> e.tenant_id;
-- → rowCount attendu : 1853 (lamartingale → gdiy)

-- ── Phase 2 — UNIQUE composites sur les 2 parents ───────────────────────────
ALTER TABLE episodes
  ADD CONSTRAINT uq_episodes_id_tenant UNIQUE (id, tenant_id);

ALTER TABLE guests
  ADD CONSTRAINT uq_guests_id_tenant UNIQUE (id, tenant_id);

-- ── Phase 3 — 8 FK composites (drop simple FK + add composite FK) ───────────
-- episode_links → episodes (ON DELETE CASCADE conservé)
ALTER TABLE episode_links DROP CONSTRAINT episode_links_episode_id_fkey;
ALTER TABLE episode_links
  ADD CONSTRAINT episode_links_episode_id_tenant_fkey
  FOREIGN KEY (episode_id, tenant_id)
  REFERENCES episodes(id, tenant_id)
  ON DELETE CASCADE;

-- episodes_media → episodes
ALTER TABLE episodes_media DROP CONSTRAINT episodes_media_episode_id_episodes_id_fk;
ALTER TABLE episodes_media
  ADD CONSTRAINT episodes_media_episode_id_tenant_fkey
  FOREIGN KEY (episode_id, tenant_id)
  REFERENCES episodes(id, tenant_id);

-- episodes_enrichment → episodes
ALTER TABLE episodes_enrichment DROP CONSTRAINT episodes_enrichment_episode_id_episodes_id_fk;
ALTER TABLE episodes_enrichment
  ADD CONSTRAINT episodes_enrichment_episode_id_tenant_fkey
  FOREIGN KEY (episode_id, tenant_id)
  REFERENCES episodes(id, tenant_id);

-- quiz_questions → episodes
ALTER TABLE quiz_questions DROP CONSTRAINT quiz_questions_episode_id_episodes_id_fk;
ALTER TABLE quiz_questions
  ADD CONSTRAINT quiz_questions_episode_id_tenant_fkey
  FOREIGN KEY (episode_id, tenant_id)
  REFERENCES episodes(id, tenant_id);

-- episode_similarities → episodes (deux FK : episode_id et similar_episode_id)
ALTER TABLE episode_similarities DROP CONSTRAINT episode_similarities_episode_id_episodes_id_fk;
ALTER TABLE episode_similarities
  ADD CONSTRAINT episode_similarities_episode_id_tenant_fkey
  FOREIGN KEY (episode_id, tenant_id)
  REFERENCES episodes(id, tenant_id);

ALTER TABLE episode_similarities DROP CONSTRAINT episode_similarities_similar_episode_id_episodes_id_fk;
ALTER TABLE episode_similarities
  ADD CONSTRAINT episode_similarities_similar_episode_id_tenant_fkey
  FOREIGN KEY (similar_episode_id, tenant_id)
  REFERENCES episodes(id, tenant_id);

-- guest_episodes → episodes + guests
ALTER TABLE guest_episodes DROP CONSTRAINT guest_episodes_episode_id_episodes_id_fk;
ALTER TABLE guest_episodes
  ADD CONSTRAINT guest_episodes_episode_id_tenant_fkey
  FOREIGN KEY (episode_id, tenant_id)
  REFERENCES episodes(id, tenant_id);

ALTER TABLE guest_episodes DROP CONSTRAINT guest_episodes_guest_id_guests_id_fk;
ALTER TABLE guest_episodes
  ADD CONSTRAINT guest_episodes_guest_id_tenant_fkey
  FOREIGN KEY (guest_id, tenant_id)
  REFERENCES guests(id, tenant_id);

COMMIT;

-- ── Vérifications post-commit (à exécuter hors-transaction) ─────────────────
-- 1. Aucune row cross-tenant restante :
--    SELECT count(*) FROM episode_links el JOIN episodes e ON e.id=el.episode_id
--      WHERE el.tenant_id <> e.tenant_id;
--    → attendu : 0
--
-- 2. 8 FK composites présentes + 2 UNIQUE composites :
--    SELECT conname FROM pg_constraint
--      WHERE conname LIKE '%_id_tenant_fkey' OR conname LIKE 'uq_%_id_tenant';
--
-- 3. Test invariant : INSERT désaligné doit être rejeté :
--    BEGIN;
--      INSERT INTO episode_links (episode_id, tenant_id, link_type, url)
--      VALUES (<some_lm_episode_id>, 'gdiy', 'tool', 'https://test.example');
--    ROLLBACK;
--    → attendu : ERROR (foreign key violation)
