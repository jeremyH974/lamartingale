# Deployment — La Martingale

Audience : Jeremy qui redéploie après un changement.

## Environnements

| Env | URL | Projet Vercel | Source | Config |
|---|---|---|---|---|
| **V1** prod | <https://lamartingale.vercel.app> | `lamartingale` | branch `master` | `vercel.json` (racine) |
| **V2** prod | <https://lamartingale-v2.vercel.app> | `lamartingale-v2` | branch `master` | `vercel-v2.json` |
| **Dev local** | http://localhost:3001 | — | — | `.env` |

Les deux projets Vercel pointent sur le même repo GitHub et partagent l'API serverless `api/index.ts` + la BDD Neon. Seul le routing statique diffère (V1 sert `public/index.html`, V2 sert `public/v2.html`).

## Variables d'environnement

Toutes définies dans `.env` (local) et dans Vercel Project Settings (prod).

| Var | Obligatoire | Usage | Où l'obtenir |
|---|---|---|---|
| `DATABASE_URL` | ✅ requis | Neon Postgres connection string | [Neon console](https://console.neon.tech) → Connection Details |
| `OPENAI_API_KEY` | ⚠️ requis pour embeddings, hybrid search, RAG chat | OpenAI API | [platform.openai.com](https://platform.openai.com/api-keys) |
| `USE_DB` | optionnel | Si `"true"` + `DATABASE_URL` → force mode BDD. Sinon auto-detect via présence de `DATABASE_URL` | — |
| `ANTHROPIC_API_KEY` | optionnel | Fallback LLM pour RAG (non actif par défaut) | [console.anthropic.com](https://console.anthropic.com) |
| `PORT` | optionnel | Port local (défaut `3001`) | — |

**Ne pas committer `.env`** — il est dans `.gitignore`. Seul `.env.example` (template sans valeurs) est versionné.

Format attendu :
- `DATABASE_URL` → `postgresql://USER:PASSWORD@ep-xxx-xxx.region.aws.neon.tech/dbname?sslmode=require`
- `OPENAI_API_KEY` → `sk-proj-xxx...`
- `ANTHROPIC_API_KEY` → `sk-ant-api03-xxx...`

## Procédure de déploiement standard

```bash
# 0. Sanity
npm run build              # tsc --noEmit équivalent (vérifie la compile)
npm run test:regression    # 15 tests endpoints (requiert API locale sur :3001)

# 1. Commit
git add -A
git commit -m "feat: ..."
git push origin master      # ⚠️ push déclenche auto-deploy V1 ET V2

# 2. Deploy explicite (optionnel, pour skipper l'auto-deploy ou rebuild sans push)
npm run deploy              # → lamartingale.vercel.app
npm run deploy:v2           # → lamartingale-v2.vercel.app
```

### Deploy V2 — sous le capot

Le script `deploy:v2` utilise les env vars `VERCEL_ORG_ID` et `VERCEL_PROJECT_ID` pour rediriger vers le projet V2 sans modifier le fichier local `.vercel/project.json` (qui reste lié à V1). Cf. `package.json` :

```json
"deploy:v2": "vercel --yes --prod --scope jeremyh974s-projects --name lamartingale-v2 --local-config vercel-v2.json"
```

**Première fois** : il faut que les env vars (`DATABASE_URL`, `OPENAI_API_KEY`, `USE_DB`) soient aussi définies sur le projet `lamartingale-v2` (sinon l'API serverless renverra 503). Procédure :

```bash
export VERCEL_ORG_ID=team_xxx
export VERCEL_PROJECT_ID=prj_xxx

# Copier chaque var depuis .env
source .env
printf '%s' "$DATABASE_URL"   | vercel env add DATABASE_URL production --force
printf '%s' "$OPENAI_API_KEY" | vercel env add OPENAI_API_KEY production --force
printf '%s' "$USE_DB"         | vercel env add USE_DB production --force
```

## Vérifier le déploiement

```bash
curl -I https://lamartingale.vercel.app          # V1 HTTP 200
curl -I https://lamartingale-v2.vercel.app       # V2 HTTP 200
curl https://lamartingale.vercel.app/api/stats   # {"total_episodes":313,...}
curl https://lamartingale-v2.vercel.app/api/stats # idem
```

Dashboard :
- V1 : `vercel ls lamartingale --scope jeremyh974s-projects`
- V2 : `vercel ls lamartingale-v2 --scope jeremyh974s-projects`

## Troubleshooting — problèmes déjà rencontrés

### 1. Bug Drizzle schema cache (commit `54a2169`)

**Symptôme** : après ajout d'une colonne (ex: `article_content`), l'endpoint `/api/episodes/:id` renvoie les données **sans** la nouvelle colonne sur Vercel, alors que ça marche en local.

**Cause** : Drizzle inline le schéma au build time. Quand Vercel rebuild lit le schéma d'un moment T, il ne voit pas la colonne ajoutée à T+1 via une migration SQL.

**Fix** : utiliser du **raw SQL tagged template** (`@neondatabase/serverless`) pour les queries qui retournent les colonnes enrichies. Voir `src/db/queries.ts#getEpisodeById`.

**Signe** : `{ "id": 312, "title": "..." }` sans `article_content`, `chapters`, etc.

### 2. Slugs vides polluant scrape-deep

**Symptôme** : 22 épisodes avec `slug = ""` → le scraper fetchait `/tous//` → récupérait la page d'accueil du site (1207 c identiques) → pollution des embeddings (commit `5a7a545`).

**Fix appliqué** :
- `scrape-deep.ts` filtre désormais `WHERE slug IS NOT NULL AND slug <> ''`.
- Les 22 épisodes polluants ont été nettoyés (`src/db/clean-bad-slugs.ts`, `finalize-rss-only.ts`).
- 6 ont retrouvé leur vrai slug via slugification du titre RSS ; les 17 autres sont marqués RSS-only.

**Prévention** : ne jamais commettre `slug = ""` — laisser `NULL`.

### 3. `USE_DB` constant parsé au module load (commit `fb89d17`)

**Symptôme** : l'endpoint tournait en mode JSON sur Vercel alors que `DATABASE_URL` était défini.

**Cause** : l'ancien code avait `const USE_DB = process.env.USE_DB === 'true'` en tête de module. Vercel parse les env vars au runtime, pas au module load — donc `USE_DB` restait `undefined` côté serverless.

**Fix** : chaque endpoint vérifie `process.env.DATABASE_URL` au runtime (dans le handler, pas au module load). `USE_DB` reste comme flag optionnel pour le fallback JSON, mais n'est plus critique.

### 4. Vercel "preview" vs "production"

**Symptôme** : `npm run deploy` affiche un message "Promote to production" dans la sortie JSON — alors que `--prod` est passé.

**Ça n'est pas un bug** : le message est un help générique Vercel CLI. Le deploy est bien en prod (vérifier via `target: "production"` dans la sortie et via `/api/stats` live).

## Rollback

Via Vercel dashboard :
1. `vercel ls <project-name> --scope jeremyh974s-projects` → liste des deploys.
2. Dashboard Vercel → Deployments → clic sur un ancien deploy → "Promote to production".

Via CLI :
```bash
vercel alias set <ancien-deployment-url> lamartingale.vercel.app --scope jeremyh974s-projects
```

## Scale et limites connues

- **Neon free tier** : 500 MB storage, scale-to-zero. Actuellement 313 épisodes + 6260 similarités + 9906 liens ≈ 50 MB. Marge large.
- **OpenAI** : quota compte-dépendant. Embeddings `3-large` = 1M tokens $0.13, donc full re-embed à $0.036.
- **Vercel free** : 100 GB bandwidth / mois, fonctions serverless ≤ 10 s timeout, ≤ 1024 MB mémoire. Les endpoints sont OK mais `/api/search/hybrid` peut approcher les 5 s sur cold start.

## Prochaines améliorations infra prévues

- **Vercel KV cache** pour `/api/search/hybrid` et `/api/chat` (cold start 2 s → <100 ms).
- **Edge Functions** pour les endpoints read-only (`/api/stats`, `/api/episodes`) — latence globale réduite.
- **CDN image** pour `thumbnail_350` (actuellement servi par lamartingale.io directement).
