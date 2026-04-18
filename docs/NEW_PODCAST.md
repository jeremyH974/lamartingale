# Onboarding d'un nouveau podcast

Guide end-to-end pour instancier la plateforme sur un nouveau podcast
(multi-tenant, DB unique, frontend commun). Durée typique : ~1 h pour un
flux Audiomeans/RSS standard.

---

## TL;DR

```bash
# 1. Créer la config
src/config/<id>.config.ts            # copier un existant + adapter
# → l'enregistrer dans src/config/index.ts (REGISTRY)

# 2. Ingestion RSS (tenant isolé)
PODCAST_ID=<id> npx tsx src/ingest-rss.ts               # ou --feed-file data/tmp/<id>.xml si 403

# 3. Enrichissement (embeddings + similarités + taxonomie)
PODCAST_ID=<id> npx tsx src/ai/embeddings.ts
PODCAST_ID=<id> npx tsx src/ai/similarity.ts
PODCAST_ID=<id> npx tsx src/ai/classify-predefined.ts --prune   # si taxonomy.mode='predefined'
PODCAST_ID=<id> npx tsx src/ai/auto-taxonomy.ts                 # si taxonomy.mode='auto'

# 4. Vérifs
PODCAST_ID=<id> npx tsx scripts/check-gdiy-complete.ts  # adapter le script si besoin
npx vitest run                                          # 48/48 attendu

# 5. Lancer l'API locale
PORT=3XXX PODCAST_ID=<id> npx tsx src/api.ts            # 3002 pour gdiy, 3003+ libre
open http://localhost:3XXX/v2.html
```

---

## 1. Créer la config

Fichier `src/config/<id>.config.ts`. Prendre `lamartingale.config.ts` (taxonomie
prédéfinie + articles) ou `gdiy.config.ts` (taxonomie auto + RSS seul) comme
squelette.

Champs obligatoires :

| Champ | Exemple |
| --- | --- |
| `id` | `'gdiy'` (slug court, = `tenant_id`) |
| `name` | `'Génération Do It Yourself'` |
| `tagline` | `'Les histoires de celles et ceux qui se sont construits par eux-mêmes'` |
| `host`, `producer` | `'Matthieu Stefani'`, `'Cosa Vostra'` |
| `description` | 1-2 phrases (sert de meta + hero + footer) |
| `website` | URL canonique du podcast |
| `episodeUrlPattern` | `'https://site.com/episode/{slug}'` (utilisé si `hasArticles=true`) |
| `rssFeeds.main` | URL du feed Audiomeans/RSS |
| `platforms` | `{ apple, spotify, deezer, youtube, youtubeMusic?, amazonMusic? }` |
| `socials` | `{ instagram?, tiktok?, linkedin?, twitter?, youtube? }` |
| `scraping.hasArticles` | `true` si site canonique (LM) / `false` si RSS seul (GDIY) |
| `scraping.timelineInRss` | `true` si chapitres dans description RSS |
| `scraping.rateLimit` | ms entre requêtes (2000 LM / 4000 GDIY) |
| `branding.primaryColor` | Couleur principale (fond hero) |
| `branding.secondaryColor` | Accent (CTA vif sur fond sombre — optionnel) |
| `branding.font` | `'Poppins'`, `'Inter'`, ... (Google Fonts) |
| `branding.logoUrl` | PNG/SVG public (optionnel — remplace le texte brand) |
| `taxonomy.mode` | `'predefined'` ou `'auto'` |
| `taxonomy.pillars` | Array 5-20 piliers (si `predefined`) |
| `taxonomy.autoPillarCount` | Nombre de piliers à générer (si `auto`) |
| `database.tenantId` | Doit matcher `id` |
| `deploy.vercelProject` | Nom du projet Vercel (`<id>-v2`) |

Puis l'enregistrer dans `src/config/index.ts` :

```ts
import { newPodcastConfig } from './newpodcast.config';
const REGISTRY: Record<string, PodcastConfig> = {
  lamartingale: lamartingaleConfig,
  gdiy: gdiyConfig,
  newpodcast: newPodcastConfig,
};
```

## 2. Ingestion RSS

```bash
PODCAST_ID=<id> npx tsx src/ingest-rss.ts --dry            # preview sans write
PODCAST_ID=<id> npx tsx src/ingest-rss.ts                  # write DB
```

Si le feed renvoie 403 (bot detection Audiomeans fréquent) :

```bash
# Télécharger le XML depuis un navigateur (clic droit → Enregistrer sous)
# Le placer dans data/tmp/<id>.xml, puis :
PODCAST_ID=<id> npx tsx src/ingest-rss.ts --feed-file data/tmp/<id>.xml
```

Le script upserte par `(tenant_id, episode_number)`. Les doublons entre
feeds (ex. GDIY 986 items → 533 épisodes uniques) sont déduplliqués.

## 3. Enrichissement

**Embeddings** (OpenAI `text-embedding-3-large`, ~$0.00002/episode) :

```bash
PODCAST_ID=<id> npx tsx src/ai/embeddings.ts
PODCAST_ID=<id> npx tsx src/ai/embeddings.ts --force   # re-embed tout
```

**Similarités pgvector** (cosine top-20, ~6 s pour 500 eps) :

```bash
PODCAST_ID=<id> npx tsx src/ai/similarity.ts
```

**Taxonomie** — deux modes :

- **`predefined`** (LM, GDIY) : 19 catégories fixées dans la config →
  Claude Haiku classe chaque épisode dans UNE catégorie. Orphelins
  fallback sur `BUSINESS` ou premier pilier.

  ```bash
  PODCAST_ID=<id> npx tsx src/ai/classify-predefined.ts --prune
  ```

- **`auto`** : sample 80 épisodes stratifié → Haiku propose N piliers
  (`autoPillarCount`) → classifie en batches. Utile pour un podcast sans
  taxonomie canonique.

  ```bash
  PODCAST_ID=<id> npx tsx src/ai/auto-taxonomy.ts
  PODCAST_ID=<id> npx tsx src/ai/auto-taxonomy.ts --dry  # preview
  ```

## 4. Tests de régression

```bash
npx vitest run
```

Doit rester à **48/48** verts. Les tests `tenant-isolation.test.ts`
vérifient :

- `tenant_id` présent sur les 10 tables scopées
- 0 ligne `tenant_id IS NULL` dans `episodes`
- 0 paire cross-tenant dans `episode_similarities`
- Contraintes composites `(tenant_id, episode_number)` etc. en place
- Nouveau tenant coexiste avec les anciens sans pollution

Checks rapides sur la DB :

```bash
PODCAST_ID=<id> npx tsx scripts/check-gdiy-complete.ts
# → adapter le nom si besoin, voir distribution pillar, NULL, cross-tenant
```

## 5. Frontend

Le fichier `public/v2.html` est **unique** et **config-driven**. L'API
Express sert `/api/config` avec la config publique du tenant (branding,
tagline, platforms, socials, taxonomy pillars).

En local :

```bash
PORT=3XXX PODCAST_ID=<id> npx tsx src/api.ts
open http://localhost:3XXX/v2.html
```

Tout ce qui est piloté par la config : titre (document.title), brand
header (logo ou texte), hero h1 (tagline), hero p (description), hero
stats (episodes/quiz/experts/paths), hero CTA background, footer brand,
footer desc, platforms + socials, footer copy (producer + host).

Pour un preview Claude Code, ajouter dans `.claude/launch.json` :

```json
{
  "name": "<id>-api",
  "runtimeExecutable": "npx",
  "runtimeArgs": ["tsx", "src/api.ts"],
  "port": 3XXX,
  "autoPort": false,
  "env": { "PORT": "3XXX", "PODCAST_ID": "<id>" }
}
```

## 6. Déploiement Vercel

Chaque podcast = un projet Vercel distinct (pas de subpath, pas de
rewrites cross-tenant).

```bash
# Nouveau projet Vercel (à faire une fois via UI ou vercel CLI)
vercel link --scope jeremyh974s-projects --project <id>-v2
vercel env add DATABASE_URL production      # Neon URL (partagée)
vercel env add OPENAI_API_KEY production
vercel env add ANTHROPIC_API_KEY production
vercel env add PODCAST_ID production         # = 'gdiy', 'lamartingale', ...

vercel deploy --prod
```

L'URL finale est `https://<id>-v2.vercel.app`. Les deux projets
partagent la même DB Neon (isolation via `tenant_id`).

---

## Checklist finale (définition de "done")

- [ ] `src/config/<id>.config.ts` complet, enregistré dans `index.ts`
- [ ] `ingest-rss.ts` a créé N épisodes avec `tenant_id=<id>`
- [ ] `embeddings.ts` → N embeddings
- [ ] `similarity.ts` → ~10×N paires intra-tenant
- [ ] Taxonomie : 0 orphelin dans `episodes.pillar`
- [ ] `npx vitest run` → 48/48
- [ ] `/api/stats` retourne `total_quiz`, `total_episodes`, etc. = 0 pour les tenants sans données
- [ ] Preview local : hero + stats + footer = cohérent avec la config
- [ ] Screenshot de la home = branding attendu (couleurs, logo, tagline)
- [ ] (Optionnel) `vercel deploy` vers un projet dédié
- [ ] Commit + push + mémoire mise à jour
