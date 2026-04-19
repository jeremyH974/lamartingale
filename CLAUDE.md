# Podcast Factory — Multi-tenant

Plateforme data-driven générique (Couches 0-3 + deep content + multi-tenant).
Instances actives :
- **La Martingale** (tenant `lamartingale`, 313 eps, Matthieu Stefani / Orso Media, bleu #004cff)
- **Génération Do It Yourself** (tenant `gdiy`, 533 eps, Matthieu Stefani / Cosa Vostra, noir + vert néon)

DB Neon unique, isolation par `tenant_id`. Un podcast = une config + un projet Vercel.
Onboarding nouveau podcast : voir [`docs/NEW_PODCAST.md`](docs/NEW_PODCAST.md).

## Commandes

Toutes les commandes d'un tenant donné doivent être préfixées par `PODCAST_ID=<id>`.
Défaut = `lamartingale`.

```bash
# API locale (port 3001=LM, 3002=GDIY — voir .claude/launch.json)
PODCAST_ID=gdiy PORT=3002 npx tsx src/api.ts

# Ingestion (nouveau podcast / refresh)
PODCAST_ID=<id> npx tsx src/ingest-rss.ts                     # --dry, --limit N, --feed-file <path>
PODCAST_ID=<id> npx tsx src/ai/embeddings.ts                  # --force pour re-embed
PODCAST_ID=<id> npx tsx src/ai/similarity.ts                  # ~10×N paires intra-tenant
PODCAST_ID=<id> npx tsx src/ai/classify-predefined.ts --prune # mode='predefined'
PODCAST_ID=<id> npx tsx src/ai/auto-taxonomy.ts               # mode='auto'

# Migrations (one-shot, idempotent)
npx tsx src/db/migrate-multi-tenant.ts          # M1 : ajoute tenant_id partout
npx tsx src/db/migrate-rss-exhaustive.ts        # M3 : 13 colonnes + podcast_metadata

# Scraping (LM uniquement — hasArticles=true)
PODCAST_ID=lamartingale npx tsx src/scrape-media.ts
PODCAST_ID=lamartingale npx tsx src/scrape-bios.ts
PODCAST_ID=lamartingale npx tsx src/scrape-deep.ts
PODCAST_ID=lamartingale npx tsx src/scrape-rss.ts

# Tests + build
npx vitest run                     # 48 tests multi-tenant (tenant-isolation + rss-extractors)
npm run build                      # tsc strict

# Deploy Vercel (projet distinct par tenant)
vercel --prod                      # depuis le projet linké
```

## Architecture

Arborescence détaillée : voir [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## God Nodes (ne pas casser)

- `src/api.ts` — 30+ endpoints, charge DB via process.env.DATABASE_URL, expose `/api/config` (public tenant)
- `src/db/schema.ts` — 10 tables scopées `tenant_id` + `podcast_metadata` (1 ligne / tenant)
- `src/db/queries.ts` — Raw SQL pour Vercel, **toutes les queries filtrent `tenant()`**
- `src/ai/search.ts` — hybridSearch() filtrée par tenant_id, support `{depth:'chapter'}`
- `src/ai/dashboard.ts` — getDashboard() agrège 14 queries parallèles pour `/api/analytics/dashboard`
- `src/cache.ts` — `getCached(key, ttl, fn)` + `clearCache(prefix?)`, tenant-namespaced, Vercel KV + LRU
- `src/config/podcast.config.ts` — interface PodcastConfig (identité, branding, taxonomy, platforms, socials)
- `src/config/index.ts` — REGISTRY + `getConfig()` résout depuis `PODCAST_ID`
- `public/v2.html` — frontend unique config-driven (`/api/config` → DOM)
- `public/v2-dashboard.html` — dashboard créateur (KPIs, insights, charts, D3 graph)

## Endpoints deep content (ajoutés)
- `GET /api/episodes/:id/chapters` — chapitres + extraits article
- `GET /api/episodes/:id` — enrichi (chapters, links groupés, guest_detail, similar_episodes)
- `GET /api/links/stats` — par type + top_domains + top_tools + cross_references
- `GET /api/guests/:name` — profil invité (bio, linkedin, épisodes)
- `GET /api/graph/episodes` — nodes + edges (références inter-épisodes)
- `GET /api/analytics/dashboard` — données dashboard créateur
- `GET /api/search/hybrid?q=...&depth=chapter` — search avec snippet chapitre
- `GET /api/cache/stats` · `POST /api/cache/clear?prefix=X` (protection via `ADMIN_TOKEN` header `x-admin-token`)

## LLM — provider centralisé

- **RAG / chat** : Anthropic Claude Sonnet 4.6 (`claude-sonnet-4-6`) via `@ai-sdk/anthropic`
- **Extraction / batch** : Anthropic Claude Haiku 4.5 (`claude-haiku-4-5-20251001`)
- **Embeddings** : OpenAI `text-embedding-3-large` (pas d'alternative Anthropic — inchangé)
- **Fallback auto** : `gpt-4o-mini` si `ANTHROPIC_API_KEY` absent
- **Provider unique** : `src/ai/llm.ts` → `getLLM()` / `getLLMFast()` / `getModelId()`. **Ne jamais importer `@ai-sdk/anthropic` ou `@ai-sdk/openai` directement ailleurs** pour la génération texte.

## Décisions techniques clés

1. **process.env.DATABASE_URL** au lieu de constante USE_DB — Vercel injecte env vars au runtime
2. **Raw SQL** (neon tagged template) pour getEpisodeById — Drizzle cache le schema au build time
3. **Embeddings enrichis** : title + abstract + article(2000c) + chapters + rss_description + takeaways + tags = ~4x plus de signal vs abstract seul
4. **Deep scraping** : 312/313 épisodes ont article complet (avg 5000c), 290/313 chapitrage, 9901 liens classifiés (tool/company/linkedin/episode_ref/resource)
5. **Multi-tenant** : 1 DB Neon partagée, isolation via `tenant_id` sur 10 tables + contraintes uniques composites `(tenant_id, X)`. 0 paire cross-tenant dans `episode_similarities`.
6. **Frontend config-driven** : un seul `public/v2.html`, pilote tout (branding, tagline, platforms, socials, logo, CTA accent) via `/api/config`. Luminance WCAG pour choisir le texte hero/CTA.
7. **Vercel = 1 projet par tenant** : pas de subpath, pas de rewrites. `lamartingale-v2` et `gdiy-v2` partagent la même DB.

## Dette technique ouverte (à investiguer)
- **22 épisodes (#126..#279) avec slug="" en BDD** → titres non-canoniques ("Crise SCPI", "5 regles or investissement"). Articles présumés exister sur lamartingale.io sous un autre slug. Script à écrire : re-crawler le listing pour retrouver les vrais slugs, puis scrape-deep --episode.
- **Divergence `episodes.guest_bio` (88/310) vs `guests.bio` (potentiellement ~288/310)** — probable duplication/dénormalisation obsolète. Audit à faire avant d'en supprimer une des deux colonnes.
- **4 épisodes sans match RSS** (#307, #295, #291, #174) — désynchronisation titre site/RSS. Voir `docs/feedback-orso-media.md`.
- **Feedback Orso Media** prêt dans `docs/feedback-orso-media.md` à envoyer à Matthieu Stefani quand l'occasion se présente.

## URLs prod

- LaMartingale V1 : https://lamartingale.vercel.app
- LaMartingale V2 : https://lamartingale-v2.vercel.app (à vérifier — projet séparé)
- GDIY V2 : `gdiy-v2.vercel.app` (projet Vercel à créer — action externe, non déployée)
- GitHub : https://github.com/jeremyH974/lamartingale

## Chartes graphiques

- **La Martingale** : primary #004cff · Poppins · "Prenez le contrôle de votre argent"
- **GDIY** : primary #000000 · secondary #00F5A0 (accent vert néon) · Inter · "Les histoires de celles et ceux qui se sont construits par eux-mêmes" · logo Symbol_Full_Black

## Model routing (80/15/5)

Avant chaque tâche, auto-classifie dans HAIKU, SONNET ou OPUS.

- **HAIKU (~5%)** — renommages, ajout console.log, fix lint/typo trivial, lookup d'un nom d'endpoint
- **SONNET (~80%) — défaut** — nouvel endpoint, query SQL, composant HTML/D3, scraper, test de régression, enrichissement
- **OPUS (~15%)** — modif `src/db/schema.ts` (god node), refactor cross-fichiers `api.ts ↔ queries.ts ↔ schema.ts`, debug divergence Vercel runtime vs local, décision archi dual-mode DB/JSON ou pgvector

### Overrides projet
- Toute modif d'un god node → OPUS minimum
- Raw SQL vs Drizzle sur un endpoint existant → SONNET mais lire `queries.ts` d'abord
- Migration schema (ajout colonne) → OPUS (impact migrate-json + migrate-enriched + regression)
- Front V2 isolé (`public/v2.html`) → SONNET
- Ajout script Python `scripts/` isolé → SONNET

### Protocole
1. Affiche `[Classification: X] — [justification 10 mots]` au début de chaque tâche
2. Si mismatch avec modèle actif : propose switch, ATTENDS validation
3. Escalation si >3 fichiers modifiés, décision archi, ou boucle d'erreurs Vercel

## Compact instructions

When compacting, preserve: file paths modified, SQL queries added/changed, endpoint signatures, migration decisions, test results, Vercel deploy errors, god-node impacts.
Discard: exploratory reasoning, intermediate attempts, verbose tool outputs, raw JSON dumps.
