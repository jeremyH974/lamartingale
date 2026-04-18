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

Arborescence détaillée : voir [`docs/architecture.md`](docs/architecture.md).

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
