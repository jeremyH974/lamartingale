# La Martingale — Éducation Financière

Plateforme data-driven basée sur le podcast La Martingale (313 épisodes, Matthieu Stefani / Orso Media). Couches 0-3 terminées + pipeline deep content (avr 2026).

## Commandes

```bash
npx tsx src/api.ts                 # API Express (port 3001, détecte DATABASE_URL auto)
npm run build                      # tsc
npx tsx src/db/migrate-json.ts     # Migration JSON → Postgres (base)
npx tsx src/db/migrate-enriched.ts # Migration enrichie (articles, bios, takeaways)
npx tsx src/db/migrate-deep-scraping.ts # +article_html, chapters, duration, rss_description, episode_links
npx tsx src/db/test-regression.ts  # 15 tests non-régression
npx tsx src/ai/embeddings.ts       # Embeddings OpenAI (--force pour re-embed)
npx tsx src/ai/similarity.ts       # Similarités pgvector (~6200 paires)
npx tsx src/scrape-media.ts        # Scraper thumbnails + audio
npx tsx src/scrape-bios.ts         # Scraper bios invités
npx tsx src/scrape-deep.ts         # Articles complets + chapitres + liens classifiés
npx tsx src/scrape-rss.ts          # Durée + description RSS Audiomeans
python scripts/clustering.py       # UMAP + OPTICS
npm run deploy                     # Vercel prod
```

## Architecture

Arborescence détaillée : voir [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## God Nodes (ne pas casser)

- `src/api.ts` — 26 endpoints, charge DB via process.env.DATABASE_URL
- `src/db/schema.ts` — 9 tables (episodes a 20 colonnes dont article_html/chapters/duration_seconds/rss_description)
- `src/db/queries.ts` — Raw SQL pour Vercel (pas Drizzle ORM pour les queries critiques)
- `src/ai/search.ts` — hybridSearch() utilisé par RAG

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

## Dette technique ouverte (à investiguer)
- **22 épisodes (#126..#279) avec slug="" en BDD** → titres non-canoniques ("Crise SCPI", "5 regles or investissement"). Articles présumés exister sur lamartingale.io sous un autre slug. Script à écrire : re-crawler le listing pour retrouver les vrais slugs, puis scrape-deep --episode.
- **Divergence `episodes.guest_bio` (88/310) vs `guests.bio` (potentiellement ~288/310)** — probable duplication/dénormalisation obsolète. Audit à faire avant d'en supprimer une des deux colonnes.
- **4 épisodes sans match RSS** (#307, #295, #291, #174) — désynchronisation titre site/RSS. Voir `docs/feedback-orso-media.md`.
- **Feedback Orso Media** prêt dans `docs/feedback-orso-media.md` à envoyer à Matthieu Stefani quand l'occasion se présente.

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
