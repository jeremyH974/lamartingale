# Dette technique — Podcast Engine

État au **20 avril 2026**, après clôture session audit P0 univers MS (commit `c1a1d12`).

Classement par priorité décroissante. **P0 = bloquant / P1 = forte valeur / P2 = améliorations / P3 = moyen terme**.

---

## P0 — Bloquant ou à fort ROI immédiat

### 1. Deep scrape Orso — 0 articles sur 4 podcasts
- **Tenants concernés** : `lepanier`, `finscale`, `passionpatrimoine`, `combiencagagne`
- **État** : `hasArticles: false` dans leurs configs → aucun `article_content`, `article_html`, ni extraction liens classifiés via `scrape-deep`
- **Impact** : embeddings appauvris (~4x moins de signal vs LM), pas de `/api/links/stats`, `links` très limités, pas de biographie invités canoniques.
- **Action** : investiguer sources (site `lepanier.io`, `passionpatrimoine.com`, `orsomedia.io/podcast/combien-ca-gagne`, Finscale site absent). Définir sélecteurs par instance, passer `hasArticles: true`, relancer `cli ingest --podcast <id>` étape scrape-deep.

### 2. Quiz LM/GDIY encore en template (hors top 5 démo)
- **État** : `quiz_questions` LM=621, GDIY=979 générées via `generate-quiz.ts` (format template Q1 pilier / Q2 invité). Seuls ~5 épisodes démo ont eu un quiz LLM de qualité via `regenerate-quality-quiz.ts`.
- **Impact** : UX quiz médiocre sur 95% des épisodes LM/GDIY.
- **Action** : batch `regenerate-quality-quiz.ts` pour tous les eps LM + GDIY (~1300 eps × 5 questions = 6500 appels Haiku, coût ≈ $5). Étendre à LP/PP/CCG/Finscale.

### 3. CCG guests LinkedIn
- **État** : CCG a 64 guests (post P0), 19 LinkedIn renseignés (30%). Versus LM ~95%.
- **Impact** : profils invités CCG pauvres, sourcing des LinkedIn absent.
- **Action** : script `scripts/denormalize-linkedin.ts` PODCAST_ID=combiencagagne + backfill manuel pour les 45 restants (recherche LinkedIn par nom + domaine d'activité).

---

## P1 — Forte valeur, à planifier

### 4. Finscale 332/567 épisodes ingérés
- **État** : RSS feed Audiomeans expose 332 eps, mais 567 annoncés sur le site.
- **Hypothèses** : limite pagination Audiomeans, dedup sur `episode_number IS NULL`, feed secondaire non référencé.
- **Action** : curl `https://feeds.audiomeans.fr/feed/55e0559e-ee0f-44ea-9e0f-acb0a18ec478.xml?items=9999` pour confirmer la limite. Chercher feed secondaire. Investiguer `finscale.com/archive` pour complétion manuelle.

### 5. cross_podcast_ref = 0
- **État** : `episode_similarities` a 0 paires cross-tenant par design. `cross_podcast_guests` donne 59 guests cross-podcast, mais aucune référence explicite d'un épisode d'un podcast citant un épisode d'un autre.
- **Impact** : graph cross-univers incomplet, potentiel de navigation horizontale inexploité.
- **Action** : nouveau pipeline `cross-references.ts` qui cherche dans `episodes.rss_description` + `article_content` les mentions d'épisodes d'autres tenants (heuristique : nom de podcast + numéro/titre). Populate table `cross_podcast_refs (from_tenant, from_episode, to_tenant, to_episode, context)`.

### 6. Passion Patrimoine sous-volume
- **État** : 195/214 annoncés. Desync mineure (~9%).
- **Action** : idem Finscale — vérifier feed, items manquants via site.

---

## P2 — Améliorations qualité/UX

### 7. KV store pas encore créé
- **État** : `engine/cache.ts` utilise LRU mémoire (fallback), Vercel KV jamais branché.
- **Impact** : cache perdu à chaque cold start Vercel (~1s latence première requête post-idle).
- **Action** : créer KV sur Vercel, injecter `KV_REST_API_URL` + `KV_REST_API_TOKEN` dans env vars des 7 projets. Code déjà prêt, active automatiquement.

### 8. Classifications incomplètes (batch LLM fail)
- **État** : post-P0, certains eps restent `UNCLASSIFIED` :
  - CCG 6/65 (10%), PP 46/142 (33%), LP 35/376 (9%), Finscale 1 ep
- **Action** : rerun `classify-predefined --prune` avec prompt amélioré, ou classifier manuellement par episode_number pour petits volumes.

### 9. Divergence LM `episodes.guest_bio` (88) vs `guests.bio`
- **État** : bio denormalisée sur 88 eps LM, bio canonique sur ~288 guests. Probable duplication obsolète.
- **Action** : audit `SELECT count(DISTINCT e.id) FROM episodes e JOIN guests g ON ... WHERE e.guest_bio != g.bio` — confirmer, puis `UPDATE episodes SET guest_bio = NULL` et lire depuis `guests` en JOIN.

### 10. 17 LM eps sans slug · 68 GDIY eps sans article_url · 4 LM sans match RSS
- **État** : inchangé depuis M4.
- **Action** : re-crawler listing canonique `lamartingale.io?current_page=N` pour retrouver les slugs. `scripts/fix-empty-slugs-v2-lm.ts` existe mais partiel.

### 11. Filtres SQL noise hardcodés
- **État** : `engine/api.ts` + `engine/ai/dashboard.ts` blacklisent les noms MS en dur.
- **Action** : externaliser en `cfg.analytics.noiseFilters[]` dans la config podcast.

---

## P3 — Moyen terme / nice-to-have

### 12. Le Gratin (C3) pas encore ajouté
- **État** : podcast non onboardé. Pitch à faire.
- **Action** : `cli init --name "Le Gratin" --id legratin --rss "..."` + `ingest`. ~15 min vu le workflow CLI.

### 13. Migration Next.js
- **État** : 4 frontends HTML statiques (v2.html, episode.html, hub.html, v2-dashboard.html) + API Vercel serverless.
- **Motivations possibles** : SSR pour SEO, App Router pour routing dynamique cleaner, auth NextAuth pour profils persistants.
- **Risques** : perte de l'architecture single-file config-driven très simple, build plus lourd, re-écriture vanilla JS → React.
- **Action** : décision architecture à prendre avant de se lancer. Pas urgent — l'actuel fonctionne et est maintenu.

### 14. Hub sans /dashboard
- **État** : hub.html agrège déjà cross-podcast, pas de frontend dashboard dédié au hub.
- **Action** : créer `frontend/hub-dashboard.html` avec KPIs univers (total eps, heures, guests cross, top pillars par tenant) + rewrite `/dashboard` dans `vercel-hub.json`.

### 15. Rename repo GitHub + custom domain
- **État** : repo = `jeremyH974/lamartingale`, ms-hub sur `.vercel.app`.
- **Action** : rename → `podcast-factory` + custom domain `univers-ms.io` (ou similaire) + certificats.

### 16. Auth + profil persistant cross-tenant
- **État** : aucun état utilisateur (quiz progress, favoris, historique). Tout est anonyme.
- **Action** : NextAuth + Postgres `users` + jointure cross-tenant `user_quiz_progress`. Pré-requis pour Le Gratin roadmap long-terme.

### 17. API `/api/demo/summary` instance-spécifique
- **État** : endpoint LM-only dans `engine/api.ts` pour la démo Stefani.
- **Action** : soit supprimer (démo passée), soit généraliser (`/api/demo/summary?n=N` pour toutes instances).

### 18. Similarité cross-tenant
- **État** : 0 paires dans `episode_similarities` cross-tenant (par design multi-tenant).
- **Décision à prendre** : est-ce pertinent d'avoir "épisodes similaires" qui traversent les podcasts ? Risque de bruit, mais valeur découverte cross-univers. Orthogonal à cross_podcast_refs (#5).
