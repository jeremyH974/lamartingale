# Data Pipeline — La Martingale

Audience : Jeremy qui veut relancer un scraper, ajouter un épisode, ou comprendre d'où vient une donnée.

## Vue d'ensemble

```
Source                         Script                      Destination                    Idempotent
──────────────────────────────────────────────────────────────────────────────────────────────────────
lamartingale.io listing     →  src/scraper.ts           →  data/episodes.json             oui (refetch tout)
lamartingale.io pages       →  src/scrape-media.ts      →  episodes_media                 oui (skip si thumb+audio)
lamartingale.io pages       →  src/scrape-deep.ts       →  episodes.article_content/html, oui (skip si article rempli)
                                                           chapters, episode_links
lamartingale.io pages       →  src/scrape-bios.ts       →  guests.bio, linkedin_url       oui
feed.audiomeans.fr (RSS)    →  src/scrape-rss.ts        →  episodes.duration_seconds,     oui (COALESCE)
                                                           rss_description
LLM (OpenAI/Anthropic)      →  src/enrich-local.ts      →  episodes_enrichment.tags,      partiel (skip si tags déjà)
                                                           sub_themes + quiz_questions
OpenAI embeddings API       →  src/ai/embeddings.ts     →  episodes_enrichment.embedding  --force requis pour re-embed
pgvector                    →  src/ai/similarity.ts     →  episode_similarities           non (DELETE + INSERT)
Python (UMAP+HDBSCAN)       →  scripts/clustering.py    →  data/clustering.json           non
```

## Détail par script

### `src/scraper.ts` — scraping base
- **Input** : `lamartingale.io/listes-des-episodes/?current_page=N` (pagination 1..32).
- **Output** : `data/episodes.json` (JSON-LD : `episodeNumber`, `name`, `dateCreated`, `abstract`).
- **Commande** : `npm run scrape` ou `npm run scrape:all` (batch complet).
- **Idempotent** : écrase le JSON à chaque run.
- **Durée** : ~5 min (32 pages × ~10 s).
- **Coût** : gratuit.
- **Dépendances amont** : aucune.

### `src/scrape-media.ts` — thumbnails + audio
- **Input** : pages épisode (`/tous/{slug}/`). Requiert `data/episodes.json`.
- **Output** : `data/episodes-media.json` + table `episodes_media`.
- **Commande** : `npm run scrape:media`.
- **Idempotent** : re-scrape tout (pas de skip). Timing court donc OK.
- **Durée** : ~6 min (~2 s/ép × 310).
- **Coût** : gratuit.
- **Dépendances amont** : `scraper.ts`.

### `src/scrape-deep.ts` — article complet + chapitres + liens ⭐
- **Input** : pages épisode. Requiert colonne `episodes.slug` remplie (sinon skip).
- **Output** : 
  - `episodes.article_content` (texte nettoyé),
  - `episodes.article_html` (HTML brut),
  - `episodes.chapters` (jsonb `[{title, order}]`),
  - `episode_links` (insertion classifiée avec `ON CONFLICT DO UPDATE`),
  - `guests.linkedin_url` (first `linkedin.com/in/*` hors Stefani).
- **Commande** : `npm run scrape:deep` ou `npm run scrape:deep:force`.
- **Idempotent** : **oui** — skip si `article_content ≥ 200 c` ET `article_html` non-null. `--force` écrase tout.
- **Filtre** : `WHERE slug IS NOT NULL AND slug <> ''` (hardened après incident pollution homepage).
- **Rate limiting** : 2 s entre requêtes, backoff exponentiel sur 429, pause 5 min après 5 erreurs consécutives.
- **Durée** : ~12 min pour 307 épisodes.
- **Coût** : gratuit.
- **Dépendances amont** : `migrate-deep-scraping.ts` (schéma), `scraper.ts` (pour avoir les slugs).

### `src/scrape-bios.ts` — bios invités
- **Input** : pages épisode + table `guests`.
- **Output** : `data/guests-bios.json` + `guests.bio`.
- **Commande** : `npx tsx src/scrape-bios.ts`.
- **Durée** : ~3 min.
- **Coût** : gratuit.

### `src/scrape-rss.ts` — durée + description RSS
- **Input** : 2 flux RSS Audiomeans (`la-martingale-010afa69a4c1.xml` + `allo-la-martingale-5d56dcf7.xml`).
- **Output** : `episodes.duration_seconds`, `episodes.rss_description`.
- **Match** : par `itunes:episode`, fallback parse de `"#NNN"` dans le titre.
- **Commande** : `npm run scrape:rss`.
- **Idempotent** : oui (`COALESCE`).
- **Durée** : ~30 s.
- **Coût** : gratuit.
- **Dépendances amont** : `migrate-deep-scraping.ts` (schéma).

### `src/enrich-local.ts` — enrichissement LLM (tags, quiz, takeaways)
- **Input** : épisodes + abstract / article_content.
- **Output** : `episodes_enrichment` (tags, sub_themes) + `quiz_questions` + `episodes.key_takeaways`.
- **Commande** : `npm run enrich:local` (ou `enrich:quiz` pour le quiz seul).
- **Idempotent** : partiel — skip si tags déjà présents.
- **Durée** : ~10 min si LLM local, peut être plus long si API payante.
- **Coût** : si OpenAI/Anthropic API → ~$0.50 pour un full run.

### `src/ai/embeddings.ts` — embeddings OpenAI
- **Input** : `episodes` joined avec `episodes_enrichment`. Texte construit = title + guest + pillar + difficulty + abstract + chapters + article_content (2000 c) + rss_description + takeaways + tags + sub_themes (cap 5000 c).
- **Output** : `episodes_enrichment.embedding` (vector 3072 d).
- **Commande** : `npm run embeddings` (incrémental) ou `npm run embeddings:force` (tout).
- **Batch** : 50 épisodes par call OpenAI, 2 s entre batchs.
- **Durée** : ~50 s pour 313 épisodes.
- **Coût** : **~$0.036** pour full re-embed (277 k tokens × $0.13/1M).
- **Dépendances amont** : `scrape-deep.ts`, `scrape-rss.ts`, `enrich-local.ts`.

### `src/ai/similarity.ts` — recalcul top-20 pgvector
- **Input** : `episodes_enrichment.embedding`.
- **Output** : table `episode_similarities` (DELETE + INSERT de 313 × 20 lignes).
- **Commande** : `npm run similarity`.
- **Idempotent** : pas de skip — efface toujours avant d'insérer.
- **Durée** : ~10 min.
- **Coût** : gratuit (calcul côté Postgres).
- **Dépendances amont** : `embeddings.ts`.

### `scripts/clustering.py` — UMAP + HDBSCAN
- **Input** : lit les embeddings via une query Postgres (requiert `DATABASE_URL` dans l'env Python).
- **Output** : `data/clustering.json` (coordonnées 2D UMAP + cluster HDBSCAN par épisode).
- **Commande** : `python scripts/clustering.py`.
- **Durée** : ~2 min.
- **Coût** : gratuit.

## Migrations (one-shot, idempotentes)

| Script | Quand le relancer |
|---|---|
| `src/db/migrate-json.ts` | Première fois : charge `data/*.json` dans la BDD (episodes, guests, paths, taxonomy, quiz). |
| `src/db/migrate-enriched.ts` | Quand `data/episodes-ai-enriched.json` / `guests-bios.json` ont été regénérés. |
| `src/db/migrate-deep-scraping.ts` | Une seule fois (ALTER TABLE + CREATE TABLE `episode_links`). |

Toutes les migrations utilisent `IF NOT EXISTS` — relançables sans danger.

## Ordre d'exécution pour un refresh complet

```bash
# 1. Scraping (sources externes) — ~30 min total
npm run scrape               # ~5 min
npm run scrape:media         # ~6 min
npm run scrape:deep          # ~12 min
npm run scrape:rss           # ~30 s
npx tsx src/scrape-bios.ts   # ~3 min

# 2. Migration BDD (si première fois)
npx tsx src/db/migrate-json.ts
npx tsx src/db/migrate-enriched.ts
npx tsx src/db/migrate-deep-scraping.ts

# 3. Enrichissement LLM (optionnel si déjà en BDD)
npm run enrich:local         # ~10 min, gratuit si local / ~$0.50 API

# 4. Embeddings + similarités — ~11 min, $0.04
npm run embeddings:force
npm run similarity

# 5. Clustering (optionnel)
python scripts/clustering.py # ~2 min
```

## Ajouter un nouvel épisode

Quand un nouvel épisode sort sur lamartingale.io :

```bash
# 1. Scraper récupère le nouvel épisode (détecté via JSON-LD + listing pagination)
npm run scrape
npm run scrape:media

# 2. Deep content
npm run scrape:deep         # idempotent, scrape uniquement les nouveaux slugs

# 3. RSS (durée + description)
npm run scrape:rss          # COALESCE : seulement remplit les colonnes NULL

# 4. Enrichissement LLM sur l'épisode ajouté
npm run enrich:local

# 5. Embedding du nouvel épisode (incrémental, skip si déjà embeddé)
npm run embeddings

# 6. Recalcul similarités (toutes, pour intégrer le nouveau)
npm run similarity

# 7. Deploy (Vercel re-deploy auto sur push, sinon explicite)
git add -A && git commit -m "feat: add episode #NNN"
git push origin master
npm run deploy
npm run deploy:v2           # si on veut pousser V2 aussi explicitement
```

## Backfill d'un épisode manquant

Si un épisode est absent de BDD mais présent dans le RSS :

```bash
# Cas #313/#264/#224 (cf. src/db/insert-missing.ts)
npx tsx src/db/insert-missing.ts   # insère 1+ épisodes avec données RSS
npm run scrape:deep                # tente de récupérer l'article si slug connu
```

Si slug inconnu : l'épisode restera "RSS-only" (voir [`docs/orso-media-feedback.md`](orso-media-feedback.md)).

## Vérification / audit

```bash
npm run audit:deep           # fill rates, colonnes candidates, existence tables
npm run test:regression      # 15 tests endpoints (requiert API locale sur :3001)
```

## Coûts cumulés attendus

| Opération | Fréquence | Coût |
|---|---|---|
| Full scrape (deep + RSS + bios) | Init + nouveaux ép | $0 |
| Enrichissement LLM via API | Nouveaux ép uniquement | ~$0.01/ép |
| Full re-embed (313) | Après changement signal embedding | $0.036 |
| Similarité | Après re-embed | $0 |
| Hybrid search (par requête) | Par usage | ~$0.00001 |
| RAG chat (par message) | Par usage | ~$0.002 (gpt-4o-mini) |

**Coût cumulé session deep scraping (avril 2026)** : ~$0.12 (3 cycles re-embed + enrichment minor).
