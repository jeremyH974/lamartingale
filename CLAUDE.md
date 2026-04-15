# La Martingale — Éducation Financière

Plateforme data-driven basée sur le podcast La Martingale (310 épisodes, Matthieu Stefani / Orso Media). Couches 0-3 terminées.

## Commandes

```bash
npx tsx src/api.ts                 # API Express (port 3001, détecte DATABASE_URL auto)
npm run build                      # tsc
npx tsx src/db/migrate-json.ts     # Migration JSON → Postgres (base)
npx tsx src/db/migrate-enriched.ts # Migration enrichie (articles, bios, takeaways)
npx tsx src/db/test-regression.ts  # 15 tests non-régression
npx tsx src/ai/embeddings.ts       # Embeddings OpenAI (--force pour re-embed)
npx tsx src/ai/similarity.ts       # Similarités pgvector (6200 paires)
npx tsx src/scrape-media.ts        # Scraper thumbnails + audio
npx tsx src/scrape-bios.ts         # Scraper bios invités
python scripts/clustering.py       # UMAP + OPTICS
npm run deploy                     # Vercel prod
```

## Architecture

```
src/
├── api.ts              # 26 endpoints Express, dual-mode DB/JSON (process.env.DATABASE_URL)
├── types.ts            # Types + getRecommendations()
├── scraper.ts          # Scraper épisodes (JSON-LD)
├── scrape-media.ts     # Scraper thumbnails + audio Audiomeans
├── scrape-bios.ts      # Scraper bios invités
├── enrich-local.ts     # Enrichissement local (tags, sub_themes, quiz)
├── enrichment.ts       # Legacy (à unifier avec enrich-local)
├── db/
│   ├── schema.ts       # 8 tables Drizzle + pgvector (15 colonnes episodes)
│   ├── queries.ts      # Raw SQL (neon tagged template) — Vercel compatible
│   ├── migrate-json.ts # Migration base (310 ep, 614 quiz, 28 experts)
│   ├── migrate-enriched.ts  # +articles, bios, takeaways, ratings
│   └── test-regression.ts   # 15 tests
└── ai/
    ├── embeddings.ts   # OpenAI text-embedding-3-large (3072d, contenu enrichi)
    ├── similarity.ts   # Top-20 voisins pgvector (6200 paires, max=0.94)
    ├── search.ts       # Hybrid search (pgvector + pg_trgm + RRF, 9/10 validation)
    ├── rag.ts          # RAG (gpt-4o-mini, system prompt pédagogique)
    ├── quiz-adaptive.ts # IRT simplifié (theta Bayesian, exploration/exploitation)
    └── analytics.ts    # Métriques SQL (Gini, co-occurrences, diversité)

public/
├── index.html          # V1 dark mode (D3.js graph, 7 vues)
└── v2.html             # V2 brand (#004cff, Poppins, 9 vues: search, chat, quiz adaptatif)
```

## God Nodes (ne pas casser)

- `src/api.ts` — 26 endpoints, charge DB via process.env.DATABASE_URL
- `src/db/schema.ts` — 8 tables (episodes a 15 colonnes)
- `src/db/queries.ts` — Raw SQL pour Vercel (pas Drizzle ORM pour les queries critiques)
- `src/ai/search.ts` — hybridSearch() utilisé par RAG

## Décisions techniques clés

1. **process.env.DATABASE_URL** au lieu de constante USE_DB — Vercel injecte env vars au runtime
2. **Raw SQL** (neon tagged template) pour getEpisodeById — Drizzle cache le schema au build time
3. **Embeddings enrichis** : title + abstract + article(500c) + key_takeaways + tags = 2.5x plus de signal

## URLs prod

- V1 : https://lamartingale.vercel.app | V2 : https://lamartingale.vercel.app/v2.html
- GitHub : https://github.com/jeremyH974/lamartingale

## Charte graphique

Couleur : #004cff | Font : Poppins | Tagline : "Prenez le contrôle de votre argent"
