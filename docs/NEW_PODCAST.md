# Ajouter un nouveau podcast

## Prérequis
- Node.js 18+
- `.env` configuré (`DATABASE_URL`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`)
- URL du flux RSS du podcast
- Projet Vercel créé (sur vercel.com → New Project → nom `{id}-v2`)

## Workflow CLI (3 commandes)

### 1. Initialiser

```bash
npx tsx cli/index.ts init \
  --name "Le Gratin" \
  --id legratin \
  --rss "https://feed.audiomeans.fr/feed/le-gratin-xxx.xml" \
  --color "#FF6B6B" \
  --font "Inter" \
  --host "Pauline Laigneau"
```

Crée :
- `instances/legratin.config.ts` (depuis `_template.config.ts` avec placeholders remplis)
- `vercel-configs/vercel-legratin.json` (rewrites `frontend/**` → `v2.html`)

Auto-détecte via le RSS : titre, image, langue, catégories, nombre d'épisodes.

### 2. Ingérer

```bash
npx tsx cli/index.ts ingest --podcast legratin
```

Pipeline enchaîné :
1. `engine/scraping/scrape-rss.ts` — épisodes en DB
2. `engine/scraping/rss/backfill-parsed.ts` — parse descriptions RSS
3. `engine/scraping/scrape-deep.ts` — articles (si `scraping.hasArticles=true`)
4. `engine/ai/generate-quiz.ts --write` — quiz par épisode
5. `engine/ai/embeddings.ts` — embeddings OpenAI
6. `engine/ai/similarity.ts` — paires de similarité intra-tenant

Durée typique : ~15 min pour 300 épisodes. Coût : ~$0.05.
Étapes 3 et 4 marquées optionnelles (fail non bloquant).

### 3. Déployer

```bash
npx tsx cli/index.ts deploy --podcast legratin
```

Supprime `.vercel/`, re-link vers le projet `legratin-v2`, déploie en prod
avec `vercel-configs/vercel-legratin.json`.

Vérifier :
- `https://legratin-v2.vercel.app/api/config` → `id=legratin`
- `https://legratin-v2.vercel.app/api/stats` → count episodes
- Homepage charge le branding

## Maintenance

```bash
npx tsx cli/index.ts refresh --podcast legratin   # nouveaux eps + re-embeddings + re-similarités
npx tsx cli/index.ts status                       # état de tous les podcasts (count DB + Flags QP/qP/qp/--)
npx tsx cli/index.ts deploy --all                 # redeploy TOUS les tenants (utile après modif frontend/v2.html commun)
npx tsx cli/index.ts deploy --all --exclude hub   # redeploy tous sauf hub
```

La colonne **Flags** de `status` indique l'état `features.qualityQuizReady` / `features.pillarsReady` :
- `QP` — quiz ready + pillars ready
- `qP` — pillars ready, quiz template (attend Rail 1-bis)
- `Qp` — quiz ready, pillars non ready
- `--` — ni l'un ni l'autre


## Adapter la config manuellement

Ouvrir `instances/legratin.config.ts` pour affiner :
- `scraping.articleSelectors`, `chapterSelector` — si `hasArticles=true`
- `scraping.timelineInRss`, `requiresArticleUrl` — cas spéciaux (GDIY-like)
- `platforms` (Spotify, Apple, Deezer, YouTube)
- `socials` (Instagram, LinkedIn, Twitter, TikTok)
- `taxonomy.mode` : `'auto'` (clustering LLM) ou `'predefined'` (piliers fixes)
- `branding.secondaryColor`, `logoUrl`
- `coHosts` (optionnel) : liste de noms à exclure des stats invités (en plus du `host` principal). Ex. GDIY : `['Amaury de Tonquédec']`. Alimente `HOSTS_NORMALIZED` via `deriveHostFilters()` (`engine/db/cross-queries.ts`).
- `features` (optionnel) : flags propagés vers `/api/config` puis `window.PODCAST_CFG.features` :
  - `qualityQuizReady: true` — active la tile hero quiz cliquable (défaut `false`, à activer uniquement après régénération Rail 1 qualité sur ce tenant)
  - `pillarsReady: true` — active section "Pour vous" + dots piliers sur carte épisode (défaut `false` si bucket UNCLASSIFIED > 10% après clustering)

## Troubleshooting

| Symptôme | Fix |
|---|---|
| `deploy` échoue sur `vercel link` | Projet absent sur vercel.com — le créer manuellement |
| `/api/config` renvoie erreur | env var `PODCAST_ID` absente sur le projet Vercel — `vercel env add PODCAST_ID production` |
| RSS renvoie 403 sur Audiomeans | Télécharger manuellement le feed → `engine/scraping/ingest-rss.ts --feed-file data/tmp/<id>.xml` |
| Aucun article scrapé | `scraping.hasArticles` doit être `true` + vérifier `articleSelectors` sur le site cible |
| Similarités retournent 0 | L'étape `embeddings` n'a pas rempli `episodes_enrichment.embedding` — relancer avec `--force` |

## Architecture sous-jacente

Un podcast = un `tenant_id` dans la DB partagée (Neon Postgres). Toutes les
queries dans `engine/db/queries.ts` sont scopées via `getConfig().database.tenantId`.
Aucune ligne d'une instance ne peut être lue depuis une autre (contraintes uniques
composites `(tenant_id, X)`).
