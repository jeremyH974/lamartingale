# Architecture — Podcast Engine (univers MS)

Audience : Jérémy après une pause, ou un dev qui rejoint le projet.

État : 25 avril 2026. Post-M5 (restructuration `engine/` / `instances/`) + Phase E (auth magic-link) + Phase B (hub config-driven) + Rail 1 (quiz qualité LM).

## Vue d'ensemble

```
┌─────────────────────────┐      ┌──────────────────────────┐
│ lamartingale.io / etc.  │      │  RSS (Audiomeans/Ausha…) │
│ sites web tenants       │      │  XML feeds               │
└────────┬────────────────┘      └────────┬─────────────────┘
         │ engine/scraping/*                │ scrape-rss / ingest-rss
         ▼                                  ▼
   ┌──────────────────────────────────────────────────┐
   │ Neon Postgres — 1 DB partagée, 10 tables         │
   │ isolation par tenant_id + podcast_metadata       │
   │ ┌─────────────────────────────────────────────┐  │
   │ │ episodes, episodes_enrichment, guests,      │  │
   │ │ quiz_questions, episode_links, chapters,    │  │
   │ │ episode_similarities (pgvector 3072d),      │  │
   │ │ cross_podcast_guests, taxonomy_pillars,     │  │
   │ │ podcast_access (auth)                       │  │
   │ └─────────────────────────────────────────────┘  │
   └────────────┬──────────────────────────┬──────────┘
                │                          │
          Drizzle ORM                Raw SQL (@neondatabase/serverless)
                │                          │
                ▼                          ▼
   ┌──────────────────────────────────────────────────┐
   │ engine/api.ts — 30+ endpoints, 1146 lignes       │
   │ • scope tenant via process.env.PODCAST_ID        │
   │ • cache KV + LRU (engine/cache.ts, namespacé)    │
   │ • LLM router (Sonnet RAG / Haiku batch)          │
   │ • auth magic-link (engine/auth/*)                │
   └──────┬───────────────────────────────────────────┘
          │
          ▼ api/index.ts (wrap Vercel serverless)
   ┌──────────────────────────────────────────────────┐
   │ 7 projets Vercel (1 par tenant + hub)            │
   │ lamartingale-v2, gdiy-v2, lepanier-v2,           │
   │ finscale-v2, passionpatrimoine-v2,               │
   │ combiencagagne-v2, ms-hub                        │
   │                                                  │
   │ Servent frontend/v2.html (sous-sites) ou         │
   │ frontend/hub.html (ms-hub uniquement)            │
   │ + frontend/episode.html, v2-dashboard.html       │
   │ config-driven via /api/config                    │
   └──────────────────────────────────────────────────┘
```

Totaux prod : 6 podcasts + 1 hub · 2 409 eps · 2 506h · 1 208 profils invités consolidés.

## Structure du repo

```
engine/           moteur générique, multi-tenant
  api.ts          30+ endpoints (1146 lignes, god node)
  cache.ts        getCached(key, ttl, fn) — KV + LRU tenant-namespacé
  universe.ts     /api/universe aggregator hub (cross-tenant)
  types.ts        types partagés
  ai/             llm router, embeddings, similarity, search, rag, classify, quiz, dashboard
  auth/           magic-link, session HMAC, access (podcast_access table)
  classify/       tool-rules.ts (D3 step 1), episode-ref-rules.ts
  config/         podcast.config.ts (interface), index.ts (REGISTRY)
  cross/          match-guests, populate-guests (cross-tenant)
  db/             schema (Drizzle), queries (mix Drizzle + raw), migrations, cross-queries
  scraping/       ingest-rss, scrape-deep, scrape-bios, scrape-media, rss/extractors
  __tests__/      12 files, 238 tests

instances/        1 config.ts par podcast + _template.config.ts
                  (lamartingale, gdiy, lepanier, finscale,
                   passionpatrimoine, combiencagagne, hub)

frontend/         HTML statiques config-driven
  v2.html         page d'accueil (sous-sites, 6 tenants)
  episode.html    page détail épisode
  hub.html        agrégateur cross-podcast (ms-hub)
  v2-dashboard.html  dashboard créateur
  login.html      Phase E magic-link form

cli/index.ts      factory commander (init, ingest, refresh, deploy, status)
vercel-configs/   1 JSON par tenant (rewrites frontend/**)
api/              entry Vercel (wrap engine/api.ts)
src/              5 fichiers legacy (enrichment, scrapers historiques LM)
```

**Aliases TS** : `@engine/*` → `engine/*`, `@instances/*` → `instances/*`.

**Runtime Vercel = imports relatifs obligatoires** dans `engine/config/index.ts` (les aliases TS ne sont pas résolus par Vercel à l'exécution serverless, seulement au build).

## Les 4 couches

### Couche 0 — Scraping

Collecte depuis les sources publiques (RSS + sites web) vers la BDD.

- **Fichiers** : `engine/scraping/ingest-rss.ts`, `scrape-deep.ts`, `scrape-bios.ts`, `scrape-media.ts`, `rss/extractors.ts`
- **Scope** : RSS → tous les tenants ; scrape-deep → uniquement si `cfg.scraping.hasArticles=true` (LM, GDIY)
- **Dépendances externes** : feeds RSS (Audiomeans, Ausha), sites tenants
- **Rate-limit** : 2 s entre requêtes (`cfg.scraping.rateLimit`)
- **Relancer** : voir [PIPELINE.md](PIPELINE.md) ou [NEW_PODCAST.md](NEW_PODCAST.md)

### Couche 1 — BDD

10 tables Neon Postgres, toutes scopées `tenant_id` + `podcast_metadata` (1 ligne par tenant). Schéma Drizzle dans `engine/db/schema.ts`. Queries applicatives dans `engine/db/queries.ts` — mix Drizzle + raw SQL (voir ADR-4).

- **Dépendance** : `DATABASE_URL` (Neon HTTP driver)
- **Contraintes uniques** : toutes composites `(tenant_id, X)` — garantit l'isolation DB-level
- **Migrations** : `engine/db/migrate-*.ts`, idempotentes (`IF NOT EXISTS`)

### Couche 2 — Intelligence (embeddings + similarités + analytics)

Embeddings OpenAI `text-embedding-3-large` (3072d) sur un texte enrichi (title + abstract + article 2000c + chapters + rss_description + takeaways + tags → ~4× plus de signal vs abstract seul).

Similarités top-20 via pgvector cosine, **scopées intra-tenant** (0 paire cross-tenant dans `episode_similarities`). Cross-tenant est adressé séparément par `cross_podcast_guests`.

- **Fichiers** : `engine/ai/embeddings.ts`, `similarity.ts`, `analytics.ts`, `dashboard.ts`
- **Coût embed** : ~$0.04 pour re-embed 313 eps LM ; ~$0.30 pour l'univers complet
- **Relancer** : `PODCAST_ID=<id> npx tsx engine/ai/embeddings.ts --force && npx tsx engine/ai/similarity.ts`

### Couche 3 — IA applicative

Recherche hybride (pgvector + pg_trgm via RRF), RAG, quiz adaptatif (IRT simplifié, theta bayésien par pilier), cross-podcast universe aggregator.

- **Fichiers** : `engine/ai/search.ts`, `rag.ts`, `quiz-adaptive.ts`, `generate-quiz.ts`, `engine/universe.ts`
- **LLM router** : `engine/ai/llm.ts` — `getLLM()` (Sonnet 4.6 RAG) / `getLLMFast()` (Haiku 4.5 batch/extraction). **Ne jamais importer `@ai-sdk/anthropic` / `@ai-sdk/openai` directement ailleurs**.
- **Exposé** : `/api/search/hybrid`, `/api/chat`, `/api/quiz/next`, `/api/quiz/answer`, `/api/universe`

## God Nodes

Fichiers à ne pas casser sans validation explicite (OPUS obligatoire pour toute modif — cf. CLAUDE.md §Model routing).

### `engine/api.ts` (1146 lignes)

**Rôle** : point d'entrée HTTP, 30+ endpoints.

**Pattern critique** : chaque endpoint vérifie `process.env.DATABASE_URL` au **runtime** (pas au module load — Vercel injecte les env vars au runtime seulement). Vérifie aussi `getConfig()` au runtime via `PODCAST_ID`.

**Dépendances entrantes** : `api/index.ts` (wrap serverless), tests de régression.

**Ne pas casser** : le scope tenant via `tenant()` helper + la protection `ADMIN_TOKEN` sur `/api/cache/clear`. Les endpoints deep content (`/api/episodes/:id/chapters`, `/api/graph/episodes`, `/api/analytics/dashboard`) sont consommés par `frontend/v2.html` et `v2-dashboard.html`.

### `engine/db/schema.ts` (279 lignes)

**Rôle** : source de vérité du schéma (Drizzle). 10 tables + `podcast_metadata`.

**Ne pas casser** : chaque nouvelle colonne doit être **nullable** (rétrocompatibilité) et suivie d'une migration idempotente. Toute modif de contrainte unique doit rester **composite avec `tenant_id`**.

### `engine/db/queries.ts` (1089 lignes)

**Rôle** : toutes les queries applicatives. Mix Drizzle + raw SQL (voir ADR-4).

**Pattern critique** : toutes les queries filtrent via `tenant()` (`getConfig().database.tenantId`). Un oubli = fuite cross-tenant.

### `engine/db/cross-queries.ts` (875 lignes)

**Rôle** : aggregator cross-tenant pour le hub MS. Peuple `TENANTS` + `TENANT_META` via `ensureUniverseInit()` au premier appel.

**Filtres noise** : expose `HOSTS_NORMALIZED`, `HOST_LINKEDIN_SLUGS`, `HOST_NAME_PATTERNS` dérivés de `cfg.host + cfg.coHosts` via `deriveHostFilters()` (fin du hardcoding P2#11, commit `faec542`).

### `engine/universe.ts` (311 lignes)

**Rôle** : `/api/universe` endpoint consommé par `frontend/hub.html`. Cache 1h via `getCached`, cold hit ~2.15s / warm hit ~71ms.

**Filtres SQL** : exclut le bruit Audiomeans footer + Spotify/Apple show root (spec dans DETTE.md §Bruit cross_podcast_ref).

### `engine/ai/search.ts`

**Rôle** : `hybridSearch(query, limit, { depth })` — utilisé par `/api/search/hybrid` et par le RAG (retrieval). Support `depth:'chapter'` pour retourner le snippet chapitre.

### `engine/cache.ts` (103 lignes)

**Rôle** : `getCached(key, ttl, fn)` + `clearCache(prefix?)`. **Tenant-namespacé** (key = `${tenantId}:${rawKey}`). Vercel KV si `KV_REST_API_URL` présent, sinon fallback LRU in-memory.

### `engine/config/index.ts`

**Rôle** : `REGISTRY` dict + `getConfig()` résout depuis `process.env.PODCAST_ID`. `toPublicConfig()` masque les champs internes pour `/api/config`.

**Imports relatifs obligatoires** (pas d'alias TS) — Vercel serverless ne résout pas `@engine/*` au runtime.

### `frontend/v2.html`

**Rôle** : frontend unique config-driven. Charge `/api/config` → DOM (branding, platforms, socials, features flags, luminance WCAG). V1 supprimée le 24/04/26, ne pas recréer.

## Décisions d'architecture (ADR)

### ADR-1 : Neon Postgres plutôt que SQLite

- **Décision** : Neon Postgres serverless (HTTP driver).
- **Contexte** : besoin de pgvector (recherche sémantique) et déploiement Vercel sans état local.
- **Conséquences** : connexion HTTP serverless (latence ~100 ms cold start), pas de pool classique. Parallèle > ~10 requêtes → OOM `CacheMemoryContext` (batcher via `unnest()` multi-row INSERT plutôt que `Promise.all`).

### ADR-2 : Drizzle plutôt que Prisma

- **Décision** : Drizzle ORM pour le schéma et ~70 % des queries.
- **Conséquences** : types TS auto — mais Drizzle **cache le schéma au build time** → workaround raw SQL sur queries chaudes (voir ADR-4).

### ADR-3 : pgvector plutôt que FAISS / Pinecone

- **Décision** : extension `vector` dans Postgres.
- **Conséquences** : une seule source de vérité. Performance OK jusqu'à ~10 k vecteurs (actuel univers ~2 400 vecteurs, marge confortable).

### ADR-4 : Raw SQL pour les queries critiques

- **Décision** : `getEpisodeById` et queries deep content utilisent `neon()` tagged template, pas Drizzle.
- **Contexte** : bug Vercel après ajout de colonnes — Drizzle renvoyait les données sans ces colonnes car son schema cache était figé au build.
- **Conséquences** : perte de safety TS sur ces queries, mais garantie de voir toutes les colonnes runtime.

### ADR-5 : Multi-tenant via `PODCAST_ID` + `tenant_id`

- **Décision** : 1 DB Neon partagée, isolation logique par `tenant_id` sur 10 tables. 1 env var `PODCAST_ID` par projet Vercel.
- **Alternative rejetée** : 1 DB par tenant (scale-to-zero Neon free tier limité, coût × N, joins cross-tenant impossibles pour le hub).
- **Conséquences** : toutes les queries DOIVENT filtrer via `tenant()`. Contraintes uniques composites `(tenant_id, X)`. 0 paire cross-tenant dans `episode_similarities` (testé).

### ADR-6 : OpenAI embeddings (pas d'alternative Anthropic)

- **Décision** : OpenAI `text-embedding-3-large` (3072d).
- **Contexte** : Anthropic ne propose pas de modèle d'embedding ; qualité française critique.
- **Texte embed enrichi** : title + abstract + article (2000c) + chapters + rss_description + takeaways + tags → ~4× plus de signal.

### ADR-7 : LLM routing Anthropic Sonnet + Haiku

- **Décision** : Sonnet 4.6 pour RAG/chat (`getLLM()`), Haiku 4.5 pour extraction/batch (`getLLMFast()`). Fallback `gpt-4o-mini` si `ANTHROPIC_API_KEY` absent.
- **Contexte** : Haiku 4.5 offre un rapport qualité/coût optimal pour les tâches batch (génération quiz Rail 1 : 1 586 questions pour $2.47 sur 313 eps LM).
- **Provider unique** : `engine/ai/llm.ts`. **Ne jamais importer** `@ai-sdk/anthropic` / `@ai-sdk/openai` directement ailleurs pour la génération texte.

### ADR-8 : Config-driven frontend unique (pas V1 + V2)

- **Décision** : un seul `frontend/v2.html` pilote les 6 sous-sites via `/api/config`. V1 supprimée du repo le 24/04/26.
- **Contexte** : dupliquer V1/V2 créait de la dette immédiate et n'apportait pas de valeur produit.
- **Conséquences** : toute modif `v2.html` → 6 deploys (ou `cli deploy --all` depuis P3#19). Toute feature optionnelle (quiz qualité, piliers ready) gated par `features.XReady` flag propagé via `toPublicConfig()`.

### ADR-9 : 1 projet Vercel par tenant

- **Décision** : `lamartingale-v2`, `gdiy-v2`, …, `ms-hub` — 7 projets Vercel distincts pointant sur le même repo.
- **Alternative rejetée** : monorepo Vercel avec rewrites cross-project (complexité subpath, analytics mélangés, URLs pas présentables).
- **Conséquences** : `.vercel/project.json` doit être re-linké à chaque deploy. CLI factory (`cli deploy --podcast <id>`) automatise `rm -rf .vercel && vercel link && vercel deploy --prod`. **Vercel Git integration désactivée** sur chaque projet (`vercel git disconnect`) pour éviter les auto-deploys cross-tenant.

### ADR-10 : Hybrid search (pgvector + pg_trgm)

- **Décision** : RRF pondéré 0.7 sémantique + 0.3 lexical.
- **Contexte** : requêtes courtes ("PEA", "SCPI") matchent mal en sémantique pur.
- **Conséquences** : recall ≈ 9/10 sur set de test maison. Coût : un embedding API supplémentaire par requête (~$0.00001).

### ADR-11 : Auth magic-link (Phase E)

- **Décision** : passwordless via Resend, session cookie HMAC signée (`SESSION_SECRET`), scope `podcast_access(email, tenant_id, role)`.
- **Contexte** : pré-onboarding créateurs (Matthieu Stefani + Orso Media) sur le hub. Password + recovery = surface de sécurité non justifiée pour le scope actuel.
- **Convention** : `tenant_id = '*'` = root univers (accès tous podcasts + futurs auto-inclus). Seul admin seedé : `jeremyhenry974@gmail.com` role `root`.
- **Délivrabilité** : `onboarding@resend.dev` (free tier, pas de DNS custom). Pas de problème spam constaté pour usage interne.

### ADR-12 : Cache tenant-namespacé (KV + LRU)

- **Décision** : `engine/cache.ts` préfixe toutes les keys par `${tenantId}:`. Vercel KV si dispo, sinon LRU in-memory.
- **Contexte** : `getDashboard()` agrège 14 queries parallèles → ~1.5s cold, ~20ms warm. `/api/universe` : 4 queries parallèles cross-tenant → ~2.15s cold, ~71ms warm.
- **Conséquences** : `clearCache(prefix?)` est scopé au tenant appelant (sauf admin). Protection `ADMIN_TOKEN` sur `/api/cache/clear`.

## Dette technique

Le détail exhaustif est dans [DETTE.md](DETTE.md). En résumé au 25/04/26 :

- **P0** : scrape deep articles/chapitres manquants sur LP/Finscale/PP/CCG · Rail 1-bis quiz GDIY
- **P1** : DNS Resend custom (`sillon.dev` dispo)
- **P2** : audit entry points post-`c67f4bf` (Assistant/Graphe/Pour vous/Dashboard) · absorption dashboards externes
- **P3** : D3 step 2 (company-rules, heuristiques divergentes — audit DB 17k rows requis) · hub sans `/dashboard` propre
- **Dettes DB** : 16 LM eps sans slug · 68 GDIY eps sans article_url · divergence `episodes.guest_bio` (88) vs `guests.bio` · 4 LM sans match RSS
- **Fermées récemment** : ~~filtres noise SQL hardcodés~~ (P2#11, `faec542`) · ~~deploy séquentiel~~ (P3#19, `cbb2ac4`) · ~~divergence classifieur `tool`~~ (D3 step 1, `c157bde`)

Voir aussi [PIPELINE.md](PIPELINE.md) pour la vue opérationnelle des 10 étapes d'ingestion.
