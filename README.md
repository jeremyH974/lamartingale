# Podcast Engine

Transforme n'importe quel podcast en plateforme data-driven avec IA.
Search sémantique, RAG conversationnel, dashboard analytics, pages épisodes enrichies, agrégateur cross-podcast.

![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178c6)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-000)
![Neon Postgres](https://img.shields.io/badge/BDD-Neon%20%2B%20pgvector-00e59b)
![Status](https://img.shields.io/badge/Status-Prod-brightgreen)

## 3 commandes pour un nouveau podcast

```bash
npx tsx cli/index.ts init --name "Mon Podcast" --rss "https://feed..." --color "#FF0000" --host "Alice"
npx tsx cli/index.ts ingest --podcast monpodcast
npx tsx cli/index.ts deploy --podcast monpodcast
```

## Podcasts actifs

| Podcast | Épisodes | Heures | URL |
|---------|---------:|-------:|-----|
| La Martingale | 313 | 335h | [lamartingale-v2.vercel.app](https://lamartingale-v2.vercel.app) |
| Génération Do It Yourself | 959 | 1391h | [gdiy-v2.vercel.app](https://gdiy-v2.vercel.app) |
| Hub Univers MS | — | — | [ms-hub.vercel.app](https://ms-hub.vercel.app) |

`npx tsx cli/index.ts status` pour l'état à jour.

## Architecture

```
engine/          moteur 100% générique, pilote par PODCAST_ID
  api.ts         30+ endpoints Express (v2 podcast + /api/cross/* univers)
  cache.ts       Vercel KV + LRU, tenant-namespaced
  config/        PodcastConfig interface + registry (loader dynamique)
  db/            schema Drizzle, queries scopées tenant, migrations
  ai/            embeddings, recherche hybride, RAG, quiz adaptatif, analytics
  cross/         agregation cross-podcast (match-guests)
  scraping/      scrape-rss, scrape-deep, rss extractors
  __tests__/     76 tests Vitest multi-tenant

instances/       un fichier config par podcast (source de vérité)
  _template.config.ts
  lamartingale.config.ts
  gdiy.config.ts
  hub.config.ts

frontend/        HTML statiques config-driven (chargent /api/config)
  v2.html        podcast standalone
  episode.html   page episode
  hub.html       agregateur univers
  v2-dashboard.html

cli/index.ts     CLI factory (init, ingest, deploy, refresh, status)
vercel-configs/  vercel-{id}.json par instance (rewrites frontend/)
api/index.ts     entry Vercel (wrap engine/api.ts)
scripts/         outils one-shot, audits, migrations ponctuelles
```

### Isolation engine / instances

Le moteur `engine/` est 100% générique : aucune référence hardcodée à un podcast. Toute spécificité (URL, couleur, sélecteurs scraping, catégories) vit dans `instances/{id}.config.ts`. Exception documentée : `engine/db/cross-queries.ts` + `/api/demo/summary` contiennent la liste de l'univers MS — c'est l'agrégateur multi-podcast par nature.

## Stack

TypeScript · Express · Neon Postgres · pgvector (3072d) · pg_trgm · Drizzle ORM · OpenAI text-embedding-3-large · Anthropic Claude (Sonnet/Haiku) · Vercel · Chart.js · D3.js

## Démarrage local

```bash
git clone https://github.com/jeremyH974/lamartingale.git
cd lamartingale
npm install
cp .env.example .env   # DATABASE_URL, OPENAI_API_KEY, ANTHROPIC_API_KEY

# API locale (un podcast à la fois)
PODCAST_ID=lamartingale npx tsx engine/api.ts   # port 3001
PODCAST_ID=gdiy PORT=3002 npx tsx engine/api.ts
```

Ouvrir http://localhost:3001/.

## Tests

```bash
npm test              # 76 tests Vitest (tenant-isolation + rss-extractors + config + llm + parse-description)
npx tsc --noEmit      # type-check
```

## Documentation

- [Ajouter un nouveau podcast](docs/NEW_PODCAST.md) — workflow CLI complet
- [Architecture](docs/ARCHITECTURE.md) — god nodes, décisions techniques
- [API Reference](docs/API.md) — 30+ endpoints
- [Data Pipeline](docs/PIPELINE.md) — ordre d'exécution ingestion
- [Deployment](docs/DEPLOYMENT.md) — env vars, procédure Vercel

## Crédits

La Martingale © Matthieu Stefani / Orso Media. Génération Do It Yourself © Matthieu Stefani / Cosa Vostra. Ce moteur est un projet indépendant non-commercial.
