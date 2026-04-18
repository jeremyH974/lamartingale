# Architecture — La Martingale

Extrait de `CLAUDE.md` lors de la configuration token-safe (refactoring R1). Ce fichier détaille l'arborescence ; le CLAUDE.md racine conserve les god nodes, décisions techniques et commandes.

## Arborescence source

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

## Notes de navigation

- Les endpoints Express sont tous dans `src/api.ts` — recherche par pattern `app.get|app.post`.
- Le dual-mode DB/JSON est piloté par `process.env.DATABASE_URL` (injecté par Vercel).
- Les fichiers JSON en `data/` sont exclus par `.claudeignore` (volumineux, non indexés).
