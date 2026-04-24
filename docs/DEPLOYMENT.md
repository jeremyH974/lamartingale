# Deployment — Podcast Engine multi-tenant

Audience : Jeremy qui redéploie après un changement.

## Environnements

Un projet Vercel par tenant. Tous pointent sur le même repo GitHub et partagent l'API serverless `api/index.ts` + la BDD Neon. Isolation par `tenant_id` côté code (cf. `engine/config/index.ts`).

| Env | URL | Projet Vercel | Config |
|---|---|---|---|
| **La Martingale** prod | <https://lamartingale-v2.vercel.app> | `lamartingale-v2` | `vercel-configs/vercel-lamartingale.json` |
| **GDIY** prod | <https://gdiy-v2.vercel.app> | `gdiy-v2` | `vercel-configs/vercel-gdiy.json` |
| **Le Panier** prod | <https://lepanier-v2.vercel.app> | `lepanier-v2` | `vercel-configs/vercel-lepanier.json` |
| **Finscale** prod | <https://finscale-v2.vercel.app> | `finscale-v2` | `vercel-configs/vercel-finscale.json` |
| **Passion Patrimoine** prod | <https://passionpatrimoine-v2.vercel.app> | `passionpatrimoine-v2` | `vercel-configs/vercel-passionpatrimoine.json` |
| **Combien ça gagne** prod | <https://combiencagagne-v2.vercel.app> | `combiencagagne-v2` | `vercel-configs/vercel-combiencagagne.json` |
| **Hub Univers MS** prod | <https://ms-hub.vercel.app> | `ms-hub` | `vercel-configs/vercel-hub.json` |
| **Dev local** | http://localhost:3001 (LM) / 3002 (GDIY) | — | `.env` |

## Variables d'environnement

Toutes définies dans `.env` (local) et dans Vercel Project Settings (prod, par projet).

| Var | Obligatoire | Usage | Où l'obtenir |
|---|---|---|---|
| `DATABASE_URL` | ✅ requis | Neon Postgres connection string (partagée entre tenants) | [Neon console](https://console.neon.tech) → Connection Details |
| `OPENAI_API_KEY` | ⚠️ requis pour embeddings | OpenAI API | [platform.openai.com](https://platform.openai.com/api-keys) |
| `ANTHROPIC_API_KEY` | ⚠️ requis pour RAG + extraction | Anthropic Claude Sonnet/Haiku | [console.anthropic.com](https://console.anthropic.com) |
| `PODCAST_ID` | ✅ requis par projet Vercel | Identifie le tenant. Ex. `lamartingale`, `gdiy`, `hub` | Valeur = clé `id` de `instances/<id>.config.ts` |
| `PORT` | optionnel | Port local (défaut `3001`) | — |

**Ne pas committer `.env`** — il est dans `.gitignore`. Seul `.env.example` (template sans valeurs) est versionné.

## Procédure de déploiement standard

La seule voie de deploy supportée est le CLI Factory. Il re-linke `.vercel/project.json` sur le bon projet avant chaque deploy (cf. `cli/index.ts:deploy`), ce qui empêche tout deploy accidentel sur le mauvais projet.

```bash
# 0. Sanity
npm run build              # tsc strict
npx vitest run             # 48 tests multi-tenant

# 1. Commit
git add -A
git commit -m "feat: ..."
git push origin master

# 2. Deploy — préférer les alias npm (passent tous par le CLI Factory)
npm run deploy:lm         # La Martingale
npm run deploy:gdiy       # GDIY
npm run deploy:lp         # Le Panier
npm run deploy:finscale   # Finscale
npm run deploy:pp         # Passion Patrimoine
npm run deploy:ccg        # Combien ça gagne
npm run deploy:hub        # Hub Univers MS

# Équivalent direct
npx tsx cli/index.ts deploy --podcast <id>

# `npm run deploy` (sans suffix) fail volontairement pour éviter le deploy "au petit bonheur".
```

### Sous le capot (cli/index.ts:cmdDeploy)

```ts
const project = podcastCfg?.deploy?.vercelProject || `${id}-v2`;

// 1. rm -rf .vercel  (reset du link)
// 2. vercel link --project <project> --scope jeremyh974s-projects
// 3. vercel --yes --prod --scope jeremyh974s-projects --local-config vercel-configs/vercel-<id>.json
```

**Première mise en prod d'un nouveau tenant** : il faut que les env vars (`DATABASE_URL`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `PODCAST_ID`) soient définies sur le projet Vercel cible (sinon 503). Le `cli init` crée la config + le fichier Vercel, mais les env vars se pushent manuellement :

```bash
# Pour chaque nouveau tenant, sur le projet Vercel correspondant
source .env
printf '%s' "$DATABASE_URL"     | vercel env add DATABASE_URL production --force
printf '%s' "$OPENAI_API_KEY"   | vercel env add OPENAI_API_KEY production --force
printf '%s' "$ANTHROPIC_API_KEY"| vercel env add ANTHROPIC_API_KEY production --force
printf '%s' "<tenant-id>"       | vercel env add PODCAST_ID production --force
```

## Vérifier le déploiement

```bash
curl -I https://lamartingale-v2.vercel.app       # HTTP 200
curl https://lamartingale-v2.vercel.app/api/stats # {"total_episodes":309,...}
curl https://lamartingale-v2.vercel.app/api/config # {tenantId:"lamartingale",...}
```

Dashboard Vercel :
```bash
vercel ls lamartingale-v2 --scope jeremyh974s-projects
vercel ls gdiy-v2 --scope jeremyh974s-projects
# etc. (7 projets)
```

## Troubleshooting — problèmes déjà rencontrés

### 1. Bug Drizzle schema cache (commit `54a2169`)

**Symptôme** : après ajout d'une colonne, l'endpoint `/api/episodes/:id` renvoie les données **sans** la nouvelle colonne sur Vercel, alors que ça marche en local.

**Cause** : Drizzle inline le schéma au build time. Quand Vercel rebuild lit le schéma d'un moment T, il ne voit pas la colonne ajoutée à T+1 via une migration SQL.

**Fix** : utiliser du **raw SQL tagged template** (`@neondatabase/serverless`) pour les queries qui retournent les colonnes enrichies. Voir `engine/db/queries.ts#getEpisodeById`.

### 2. `DATABASE_URL` constant parsé au module load (commit `fb89d17`)

**Symptôme** : l'endpoint tournait en mode fallback sur Vercel alors que `DATABASE_URL` était défini.

**Cause** : l'ancien code avait `const USE_DB = process.env.USE_DB === 'true'` en tête de module. Vercel parse les env vars au runtime, pas au module load.

**Fix** : chaque endpoint vérifie `process.env.DATABASE_URL` au runtime (dans le handler, pas au module load).

### 3. Vercel "preview" vs "production"

Le message "Promote to production" dans la sortie JSON de `vercel --prod` est un help générique, pas un bug. Vérifier `target: "production"` dans la sortie + `/api/stats` live.

### 4. Piège `.vercel/project.json` mal linké (commit du 24 avril 2026)

**Symptôme** : `npm run deploy` déployait parfois sur un projet Vercel obsolète (ex. ancien `lamartingale` V1) si `.vercel/project.json` pointait dessus suite à un `vercel link` manuel.

**Fix** : tous les scripts `deploy:*` dans `package.json` passent désormais par le CLI Factory (`npx tsx cli/index.ts deploy --podcast <id>`), qui re-linke explicitement sur le bon projet avant chaque deploy. Le `npm run deploy` nu fail volontairement pour forcer à préciser le podcast.

## Rollback

Via Vercel dashboard :
1. `vercel ls <project-v2> --scope jeremyh974s-projects` → liste des deploys.
2. Dashboard Vercel → Deployments → clic sur un ancien deploy → "Promote to production".

Via CLI :
```bash
vercel alias set <ancien-deployment-url> <project-v2>.vercel.app --scope jeremyh974s-projects
```

## Scale et limites connues

- **Neon free tier** : 500 MB storage, scale-to-zero. Marge large pour les 2 400+ épisodes actuels.
- **OpenAI** : embeddings `3-large` = 1M tokens / $0.13, full re-embed ~$0.04 par tenant.
- **Vercel free** : 100 GB bandwidth / mois, fonctions serverless ≤ 10 s timeout, ≤ 1024 MB mémoire.

## Prochaines améliorations infra prévues

- **Vercel KV cache** pour `/api/search/hybrid` et `/api/chat` (cold start 2 s → <100 ms). Code déjà prêt dans `engine/cache.ts`, manque les env vars KV sur chaque projet.
- **CDN image** pour `thumbnail_350` (actuellement servi par le site tenant directement).
