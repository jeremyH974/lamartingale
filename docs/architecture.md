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
├── scrape-deep.ts      # Articles complets + H2 chapters + liens classifiés (5 types)
├── scrape-rss.ts       # Durée + description depuis flux RSS Audiomeans
├── enrich-local.ts     # Enrichissement local (tags, sub_themes, quiz)
├── enrichment.ts       # Legacy (à unifier avec enrich-local)
├── db/
│   ├── schema.ts                    # 9 tables Drizzle + pgvector (episodes 20 colonnes)
│   ├── queries.ts                   # Raw SQL (neon tagged template) — Vercel compatible
│   ├── migrate-json.ts              # Migration base (310 ep, 614 quiz, 28 experts)
│   ├── migrate-enriched.ts          # +articles, bios, takeaways, ratings
│   ├── migrate-deep-scraping.ts     # +article_html, chapters, duration, rss_description, episode_links
│   ├── audit-deep-scraping.ts       # Audit état BDD vs schéma deep-scraping (réutilisable)
│   ├── insert-missing.ts            # Backfill épisodes absents (RSS → BDD)
│   ├── clean-bad-slugs.ts           # Nettoyage épisodes avec slug="" pollués
│   ├── collect-anomalies.ts         # Génère docs/feedback-orso-media.md
│   └── test-regression.ts           # 15 tests
└── ai/
    ├── embeddings.ts   # OpenAI text-embedding-3-large (3072d, contenu enrichi + chapters + rss)
    ├── similarity.ts   # Top-20 voisins pgvector (~6200 paires)
    ├── search.ts       # Hybrid search (pgvector + pg_trgm + RRF, 9/10 validation)
    ├── rag.ts          # RAG (gpt-4o-mini, system prompt pédagogique)
    ├── quiz-adaptive.ts # IRT simplifié (theta Bayesian, exploration/exploitation)
    └── analytics.ts    # Métriques SQL (Gini, co-occurrences, diversité)

public/
├── index.html          # V1 dark mode (D3.js graph, 7 vues)
└── v2.html             # V2 brand (#004cff, Poppins, 9 vues: search, chat, quiz adaptatif)
```

## Tables BDD (9)

1. `episodes` — 20 colonnes : core + article_content/html, chapters, duration_seconds, rss_description
2. `episodes_media` — thumbnails + audio
3. `episodes_enrichment` — tags, sub_themes, embedding (3072d)
4. `episode_similarities` — top-20 voisins pgvector
5. `episode_links` — **nouveau** — liens extraits classifiés (linkedin/resource/episode_ref/company/tool)
6. `guests` — +linkedin_url
7. `guest_episodes` — junction table
8. `quiz_questions` — 614 questions
9. `taxonomy` + `learning_paths`

## Notes de navigation

- Les endpoints Express sont tous dans `src/api.ts` — recherche par pattern `app.get|app.post`.
- Le dual-mode DB/JSON est piloté par `process.env.DATABASE_URL` (injecté par Vercel).
- Les fichiers JSON en `data/` sont exclus par `.claudeignore` (volumineux, non indexés).
