# La Martingale — Éducation Financière

Plateforme data-driven basée sur le podcast La Martingale (310 épisodes, Matthieu Stefani / Orso Media).

## Commandes

```bash
npx tsx src/api.ts                 # API Express (port 3001, USE_DB=true → Neon Postgres)
npm run build                      # tsc
npx tsx src/db/migrate-json.ts     # Migration JSON → Postgres
npx tsx src/db/test-regression.ts  # 15 tests non-régression
npx tsx src/ai/embeddings.ts       # Générer embeddings OpenAI (310 ep, ~$0.004)
npx tsx src/ai/similarity.ts       # Calculer similarités pgvector (6200 paires)
python scripts/clustering.py       # UMAP + OPTICS clustering
vercel --yes --prod --scope jeremyh974s-projects  # Deploy prod
```

## Architecture

```
src/
├── api.ts              # 26 endpoints Express, dual-mode DB/JSON (USE_DB)
├── types.ts            # Types + getRecommendations()
├── scraper.ts          # Scraper épisodes (JSON-LD)
├── scrape-media.ts     # Scraper thumbnails + audio Audiomeans
├── enrich-local.ts     # Enrichissement local (tags, sub_themes, quiz)
├── enrichment.ts       # Enrichissement legacy (à unifier avec enrich-local)
├── db/
│   ├── schema.ts       # 8 tables Drizzle + pgvector
│   ├── queries.ts      # 15 fonctions SQL (couche query)
│   ├── index.ts        # Client Neon HTTP
│   ├── migrate-json.ts # Migration idempotente JSON → Postgres
│   └── test-regression.ts  # 15 tests non-régression
└── ai/
    ├── embeddings.ts   # OpenAI text-embedding-3-large (3072d)
    ├── similarity.ts   # Top-20 voisins pgvector cosine
    ├── search.ts       # Hybrid search (pgvector + pg_trgm + RRF)
    ├── rag.ts          # Pipeline RAG (retrieve → augment → gpt-4o-mini)
    ├── quiz-adaptive.ts # Quiz IRT simplifié (theta Bayesian)
    └── analytics.ts    # Métriques data science SQL

data/                   # ⚠️ NE PAS INDEXER — voir .claudeignore
public/
├── index.html          # V1 dark mode (D3.js graph)
└── v2.html             # V2 brand (#004cff, Poppins)
```

## Stack

Neon Postgres + pgvector + pg_trgm + Drizzle ORM + OpenAI embeddings (3072d) + gpt-4o-mini RAG

## God Nodes (ne pas casser)

- `src/api.ts` — 26 endpoints, charge DB + fallback JSON
- `src/db/schema.ts` — 8 tables Postgres (episodes, enrichment, media, quiz, guests, taxonomy, paths, similarities)
- `src/types.ts` — getRecommendations() importé par api.ts
- `src/ai/search.ts` — hybridSearch() utilisé par RAG

## URLs prod

- V1 : https://lamartingale.vercel.app
- V2 : https://lamartingale.vercel.app/v2.html
- GitHub : https://github.com/jeremyH974/lamartingale

## Charte graphique La Martingale

- Couleur : #004cff (bleu électrique) | Font : Poppins | Tagline : "Prenez le contrôle de votre argent"

## Conventions

- TypeScript strict, français dans les commentaires
- Dual-mode DB/JSON via USE_DB env var
- Git commits : feat/fix/refactor en anglais
- Chaque point d'étape : git push + vercel deploy + maj mémoire + graphify
