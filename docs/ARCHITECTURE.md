# Architecture — La Martingale

Audience : Jeremy après une pause, ou un dev qui rejoint le projet.

## Vue d'ensemble

```
┌──────────────────┐      ┌──────────────────┐
│  lamartingale.io │      │   RSS Audiomeans │
│   (site HTML)    │      │   (XML feeds)    │
└────────┬─────────┘      └────────┬─────────┘
         │ scrape-*.ts              │ scrape-rss.ts
         ▼                          ▼
   ┌─────────────────────────────────────┐
   │        Neon Postgres (9 tables)     │
   │   ┌──────────────────────────────┐  │
   │   │ episodes (20 cols, 313 rows) │  │
   │   └──┬────────────┬──────┬───────┘  │
   │      │            │      │          │
   │  episodes_*   quiz_*  episode_*     │
   │  enrichment   questions links       │
   │  media (+pgvector 3072d)            │
   └────────────┬──────────────────┬─────┘
                │                  │
          Drizzle ORM        Raw SQL (Neon HTTP)
                │                  │
                ▼                  ▼
   ┌─────────────────────────────────────┐
   │  Express API (src/api.ts, 27 eps)   │
   │  • dual-mode DB/JSON                │
   │  • OpenAI (embeddings + RAG chat)   │
   │  • pgvector similarity + pg_trgm    │
   └──────┬──────────────────────────┬───┘
          │                          │
   api/index.ts handler       (dev local: port 3001)
          │
          ▼
   ┌─────────────────────────────────────────────────────────┐
   │ 7 projets Vercel (1 par tenant)                         │
   │ lamartingale-v2, gdiy-v2, lepanier-v2, finscale-v2,     │
   │ passionpatrimoine-v2, combiencagagne-v2, ms-hub         │
   │ Servent frontend/v2.html (config-driven via /api/config)│
   │ + frontend/episode.html + frontend/hub.html (hub-only)  │
   └─────────────────────────────────────────────────────────┘
```

## Les 4 couches

### Couche 0 — Scraping

Collecte depuis les sources publiques (site web + RSS) vers la BDD.

**Fichiers** : `src/scraper.ts`, `src/scrape-media.ts`, `src/scrape-bios.ts`, `src/scrape-deep.ts`, `src/scrape-rss.ts`
**Dépendances externes** : `lamartingale.io`, `feed.audiomeans.fr`
**Relancer** : voir [PIPELINE.md](PIPELINE.md). Rate-limited 2 s entre requêtes (cheerio + `fetch`).

### Couche 1 — BDD

9 tables Neon Postgres (détail : [DATA.md](DATA.md)). Schéma Drizzle dans `src/db/schema.ts`. Queries applicatives dans `src/db/queries.ts` — mix Drizzle + raw SQL selon le besoin Vercel.

**Dépendance** : `DATABASE_URL` (Neon connection string). Fallback JSON si absent.
**Relancer** : `npx tsx src/db/migrate-json.ts` (base) puis `migrate-enriched.ts` puis `migrate-deep-scraping.ts`.

### Couche 2 — Intelligence (embeddings + similarités + analytics)

Embeddings OpenAI text-embedding-3-large (3072d) sur un texte enrichi (title + abstract + article 2000 c + chapters + rss_desc + takeaways + tags). Similarités top-20 via pgvector cosine. Analytics SQL.

**Fichiers** : `src/ai/embeddings.ts`, `src/ai/similarity.ts`, `src/ai/analytics.ts`
**Dépendance** : `OPENAI_API_KEY`
**Coût** : ~$0.04 pour re-embed les 313 épisodes
**Relancer** : `npx tsx src/ai/embeddings.ts --force && npx tsx src/ai/similarity.ts`

### Couche 3 — IA applicative

Recherche hybride (pgvector + pg_trgm via RRF), RAG (gpt-4o-mini, prompt pédagogique), quiz adaptatif (IRT simplifié, theta bayésien par pilier).

**Fichiers** : `src/ai/search.ts`, `src/ai/rag.ts`, `src/ai/quiz-adaptive.ts`
**Dépendances** : `DATABASE_URL` + `OPENAI_API_KEY`
**Exposé via** : `/api/search/hybrid`, `/api/chat`, `/api/quiz/next`, `/api/quiz/answer`

## God Nodes

Fichiers à ne pas casser sans validation explicite (OPUS obligatoire pour toute modif).

### `src/api.ts` (605 lignes)
**Rôle** : Express app, 27 endpoints, dual-mode DB/JSON.
**Pattern critique** : chaque endpoint vérifie `process.env.DATABASE_URL` au runtime (pas au module load). Fallback sur JSON si absent.
**Dépendances entrantes** : `api/index.ts` (wrap Vercel), `test-regression.ts`.
**Ne pas casser** : la dual-mode. Toujours garder le chemin JSON en fallback pour dev local sans BDD.

### `src/db/schema.ts` (145 lignes)
**Rôle** : source de vérité du schéma BDD (Drizzle).
**9 tables**, dont `episodes` à 20 colonnes.
**Dépendances entrantes** : `queries.ts`, `embeddings.ts`, `search.ts`, migrations.
**Ne pas casser** : chaque nouvelle colonne doit être **nullable** (rétrocompatibilité) et suivie d'une migration idempotente (`IF NOT EXISTS`).

### `src/db/queries.ts` (488 lignes)
**Rôle** : toutes les queries applicatives. Mix Drizzle + raw SQL.
**Pattern critique** : `getEpisodeById` utilise du **raw SQL tagged template** (via `@neondatabase/serverless`) — pas Drizzle — car Drizzle cache le schéma au build time et ne voit pas les colonnes ajoutées après le build sur Vercel.
**Dépendances entrantes** : `api.ts` (la quasi-totalité des endpoints l'utilisent).
**Ne pas casser** : le raw SQL pour les queries qui retournent les colonnes enrichies.

### `src/ai/search.ts`
**Rôle** : `hybridSearch(query, limit)` — utilisé par `/api/search/hybrid` et par le RAG (`rag.ts` le réutilise pour retrieval).
**Dépendances entrantes** : `rag.ts`, `api.ts`.

### `api/index.ts` (7 lignes, wrap serverless)
**Rôle** : export d'un handler Vercel qui délègue à `src/api.ts`. Partagé entre V1 et V2.
**Ne pas casser** : les deux projets Vercel pointent ici, toute modif affecte les deux prods.

### `src/types.ts`
**Rôle** : types partagés (`Episode`, `Expert`, `LearningPath`, …) + `getRecommendations()` (moteur de scoring utilisé par `/api/recommend`).
**Dépendances entrantes** : `api.ts`, `queries.ts`.

## Décisions d'architecture (ADR)

### ADR-1 : Neon Postgres plutôt que SQLite

- **Décision** : Neon Postgres serverless.
- **Contexte** : besoin de pgvector (recherche sémantique) et déploiement Vercel sans état local.
- **Alternatives rejetées** : SQLite (pas de vector natif), Supabase (OK techniquement, Neon a un free tier plus généreux pour serverless scale-to-zero).
- **Conséquences** : connexion HTTP serverless (latence ~100 ms sur cold start), pas de pool classique.

### ADR-2 : Drizzle plutôt que Prisma

- **Décision** : Drizzle ORM pour le schéma et ~80 % des queries.
- **Contexte** : ORM léger, typé, compatible avec le runtime Neon HTTP.
- **Alternatives rejetées** : Prisma (bundle trop lourd pour serverless, binaire natif), SQL brut partout (verbeux).
- **Conséquences** : types TS auto — mais Drizzle **cache le schéma au build time** → workaround raw SQL (voir ADR-4).

### ADR-3 : pgvector plutôt que FAISS / Pinecone

- **Décision** : extension `vector` dans Postgres.
- **Contexte** : ~313 vecteurs à stocker, besoin de filtrer par pilier/difficulté et faire des joins SQL sur les résultats.
- **Alternatives rejetées** : FAISS (pas de filtres, self-hosted), Pinecone (latence + coût + vendor lock-in).
- **Conséquences** : une seule source de vérité (BDD). Performance OK jusqu'à ~10 k vecteurs (au-delà, indexation IVFFlat/HNSW requise).

### ADR-4 : Raw SQL pour les queries critiques

- **Décision** : `getEpisodeById` et `/api/similar/:id` utilisent `neon()` tagged template, pas Drizzle.
- **Contexte** : bug sur Vercel après ajout de colonnes — Drizzle renvoyait les données sans ces colonnes car son schema cache était figé au build (commit `54a2169`).
- **Alternative rejetée** : rebuild complet à chaque migration (contraire à la fluidité du dev).
- **Conséquences** : perte de safety TS sur ces queries, mais garantie de voir toutes les colonnes runtime.

### ADR-5 : Dual-mode DB/JSON via `DATABASE_URL`

- **Décision** : si `DATABASE_URL` présent → Postgres ; sinon → fichiers JSON dans `data/`.
- **Contexte** : permettre au dev local de lancer l'app sans BDD (offline, pas de VPN).
- **Alternative rejetée** : `USE_DB=true` constant parsé au module load — ne marchait pas sur Vercel runtime (commit `fb89d17`).
- **Conséquences** : chaque endpoint a deux branches. Les JSON lourds dans `data/` sont gitignored (volumes MB).

### ADR-6 : OpenAI text-embedding-3-large plutôt que modèle local

- **Décision** : OpenAI 3072 d.
- **Contexte** : petit corpus (313), qualité embedding française critique.
- **Alternatives rejetées** : `sentence-transformers` multilingue (qualité FR moyenne), Voyage AI (payant aussi, pas de gain décisif).
- **Conséquences** : dépendance `OPENAI_API_KEY` ; ~$0.04 pour un full re-embed.

### ADR-7 : Deux projets Vercel (V1 + V2)

- **Décision** : `lamartingale` et `lamartingale-v2` pointent sur le même repo.
- **Contexte** : V1 (dark mode, D3.js graph) garde sa valeur d'exploration. V2 (brand-aligned pour pitch Matthieu) a besoin de son propre URL propre.
- **Alternative rejetée** : un seul projet avec `/v2.html` en sub-route (URL pas présentable, analytics partagés).
- **Conséquences** : deux configs Vercel (`vercel.json`, `vercel-v2.json`). Deploy indépendants via `npm run deploy` et `npm run deploy:v2`. Voir [DEPLOYMENT.md](DEPLOYMENT.md).

### ADR-8 : HTML monolithique plutôt que React / Next.js

- **Décision** : un `index.html` et un `v2.html` statiques, JS vanille.
- **Contexte** : prototype solo, pas de build step, pas de contribution externe attendue.
- **Alternatives rejetées** : React (over-engineering pour le scope), Next.js (mélange backend/front).
- **Conséquences** : onboarding zéro, aucune dépendance front. Inconvénient : pas de typing côté front.

### ADR-9 : Hybrid search (pgvector + pg_trgm) plutôt que vector-only

- **Décision** : RRF pondéré 0.7 sémantique + 0.3 lexical.
- **Contexte** : les requêtes courtes ("PEA", "SCPI") matchent mal en sémantique pur. Les requêtes longues matchent bien en sémantique.
- **Alternative rejetée** : vector-only (recall dégradé sur requêtes courtes).
- **Conséquences** : recall ≈ 9/10 sur set de test maison. Coût : un embedding API supplémentaire par requête (~$0.00001).

## Dette technique

1. **17 épisodes RSS-only** (#126..#232) — pas de page article sur lamartingale.io. Titres et abstracts récupérés depuis RSS, `slug=NULL`. Action côté Orso (voir [orso-media-feedback.md](orso-media-feedback.md)).
2. **Divergence `episodes.guest_bio` (88/313) vs `guests.bio` (28/28)** — duplication historique. Audit avant dédup.
3. **4 épisodes sans match RSS** (#307, #295, #291, #174) — désync titre site/RSS.
4. **Type `EnrichedEpisode` dupliqué** dans `enrich-local.ts` et `enrichment.ts` (legacy).
5. **Queries Drizzle restantes à migrer vers raw SQL** pour cohérence Vercel.
6. **Clustering Python pas intégré** — `scripts/clustering.py` écrit dans `data/clustering.json`, pas auto-regen.
7. **Pas de cache** sur les queries coûteuses (`/api/search/hybrid` ~2 s cold start). Vercel KV prévu.

Voir aussi [PIPELINE.md](PIPELINE.md) pour la vue opérationnelle.
