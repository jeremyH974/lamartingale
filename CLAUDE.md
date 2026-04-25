# Podcast Engine — Multi-tenant

Plateforme data-driven générique (Couches 0-3 + deep content + multi-tenant).
Instances actives :
- **La Martingale** (tenant `lamartingale`, 313 eps, Matthieu Stefani / Orso Media, bleu #004cff)
- **Génération Do It Yourself** (tenant `gdiy`, 959 eps, Matthieu Stefani / Cosa Vostra, noir + vert néon)
- **Hub Univers MS** (tenant `hub`, agregateur cross-podcast LM + GDIY)

DB Neon unique, isolation par `tenant_id`. Un podcast = une config + un projet Vercel.
Nouveau podcast en 3 commandes via `cli/index.ts` : `init` → `ingest` → `deploy`.
Onboarding détaillé : voir [`docs/NEW_PODCAST.md`](docs/NEW_PODCAST.md).

## Structure (post-M5 restructuration)

```
engine/       moteur générique (api, cache, ai, db, cross, scraping, config, __tests__)
instances/    un fichier config par podcast + _template.config.ts
frontend/     HTML statiques config-driven (v2, episode, hub, dashboard)
cli/          CLI Factory (init, ingest, deploy, refresh, status)
vercel-configs/ vercel-{id}.json par instance
scripts/      outils one-shot (audits, debug, migrations ponctuelles)
api/          entry Vercel (wrap engine/api.ts)
src/          5 fichiers legacy (enrichment, scraper, scrape-media/bios, enrich-local)
```

Aliases TypeScript : `@engine/*` → `engine/*`, `@instances/*` → `instances/*`.

## Commandes

Toutes les commandes d'un tenant donné doivent être préfixées par `PODCAST_ID=<id>`.
Défaut = `lamartingale`.

```bash
# CLI factory (workflow principal)
npx tsx cli/index.ts status                           # état de tous les podcasts
npx tsx cli/index.ts init --name "X" --rss "..." ...  # nouveau podcast
npx tsx cli/index.ts ingest --podcast <id>            # pipeline ingestion
npx tsx cli/index.ts deploy --podcast <id>            # deploy Vercel (re-link + prod)
npx tsx cli/index.ts refresh --podcast <id>           # nouveaux eps uniquement

# API locale (port 3001=LM, 3002=GDIY — voir .claude/launch.json)
PODCAST_ID=gdiy PORT=3002 npx tsx engine/api.ts

# Ingestion (nouveau podcast / refresh)
PODCAST_ID=<id> npx tsx engine/scraping/ingest-rss.ts                     # --dry, --limit N, --feed-file <path>
PODCAST_ID=<id> npx tsx engine/ai/embeddings.ts                  # --force pour re-embed
PODCAST_ID=<id> npx tsx engine/ai/similarity.ts                  # ~10×N paires intra-tenant
PODCAST_ID=<id> npx tsx engine/ai/classify-predefined.ts --prune # mode='predefined'
PODCAST_ID=<id> npx tsx engine/ai/auto-taxonomy.ts               # mode='auto'

# Migrations (one-shot, idempotent)
npx tsx engine/db/migrate-multi-tenant.ts          # M1 : ajoute tenant_id partout
npx tsx engine/db/migrate-rss-exhaustive.ts        # M3 : 13 colonnes + podcast_metadata

# Scraping (LM uniquement — hasArticles=true)
PODCAST_ID=lamartingale npx tsx engine/scraping/scrape-media.ts
PODCAST_ID=lamartingale npx tsx engine/scraping/scrape-bios.ts
PODCAST_ID=lamartingale npx tsx engine/scraping/scrape-deep.ts
PODCAST_ID=lamartingale npx tsx engine/scraping/scrape-rss.ts

# Tests + build
npx vitest run                     # 48 tests multi-tenant (tenant-isolation + rss-extractors)
npm run build                      # tsc strict

# Deploy Vercel (projet distinct par tenant, .vercel/project.json à re-linker)
# Prefere la CLI : npx tsx cli/index.ts deploy --podcast <id>
npm run deploy:lm                  # LM -> vercel-configs/vercel-lamartingale.json
npm run deploy:gdiy                # GDIY
npm run deploy:hub                 # Hub
```

## Architecture

Arborescence détaillée : voir [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## God Nodes (ne pas casser)

- `engine/api.ts` — 30+ endpoints, charge DB via process.env.DATABASE_URL, expose `/api/config` (public tenant)
- `engine/db/schema.ts` — 10 tables scopées `tenant_id` + `podcast_metadata` (1 ligne / tenant)
- `engine/db/queries.ts` — Raw SQL pour Vercel, **toutes les queries filtrent `tenant()`**
- `engine/ai/search.ts` — hybridSearch() filtrée par tenant_id, support `{depth:'chapter'}`
- `engine/ai/dashboard.ts` — getDashboard() agrège 14 queries parallèles pour `/api/analytics/dashboard`
- `engine/cache.ts` — `getCached(key, ttl, fn)` + `clearCache(prefix?)`, tenant-namespaced, Vercel KV + LRU
- `engine/config/podcast.config.ts` — interface PodcastConfig (identité, branding, taxonomy, platforms, socials)
- `engine/config/index.ts` — REGISTRY + `getConfig()` résout depuis `PODCAST_ID`
- `frontend/v2.html` — frontend unique config-driven (`/api/config` → DOM)
- `frontend/v2-dashboard.html` — dashboard créateur (KPIs, insights, charts, D3 graph)

## Endpoints deep content (ajoutés)
- `GET /api/episodes/:id/chapters` — chapitres + extraits article
- `GET /api/episodes/:id` — enrichi (chapters, links groupés, guest_detail, similar_episodes)
- `GET /api/links/stats` — par type + top_domains + top_tools + cross_references
- `GET /api/guests/:name` — profil invité (bio, linkedin, épisodes)
- `GET /api/graph/episodes` — nodes + edges (références inter-épisodes)
- `GET /api/analytics/dashboard` — données dashboard créateur
- `GET /api/search/hybrid?q=...&depth=chapter` — search avec snippet chapitre
- `GET /api/cache/stats` · `POST /api/cache/clear?prefix=X` (protection via `ADMIN_TOKEN` header `x-admin-token`)

## LLM — provider centralisé

- **RAG / chat** : Anthropic Claude Sonnet 4.6 (`claude-sonnet-4-6`) via `@ai-sdk/anthropic`
- **Extraction / batch** : Anthropic Claude Haiku 4.5 (`claude-haiku-4-5-20251001`)
- **Embeddings** : OpenAI `text-embedding-3-large` (pas d'alternative Anthropic — inchangé)
- **Fallback auto** : `gpt-4o-mini` si `ANTHROPIC_API_KEY` absent
- **Provider unique** : `engine/ai/llm.ts` → `getLLM()` / `getLLMFast()` / `getModelId()`. **Ne jamais importer `@ai-sdk/anthropic` ou `@ai-sdk/openai` directement ailleurs** pour la génération texte.

## Décisions techniques clés

1. **process.env.DATABASE_URL** au lieu de constante USE_DB — Vercel injecte env vars au runtime
2. **Raw SQL** (neon tagged template) pour getEpisodeById — Drizzle cache le schema au build time
3. **Embeddings enrichis** : title + abstract + article(2000c) + chapters + rss_description + takeaways + tags = ~4x plus de signal vs abstract seul
4. **Deep scraping** : 312/313 épisodes ont article complet (avg 5000c), 290/313 chapitrage, 9901 liens classifiés (tool/company/linkedin/episode_ref/resource)
5. **Multi-tenant** : 1 DB Neon partagée, isolation via `tenant_id` sur 10 tables + contraintes uniques composites `(tenant_id, X)`. 0 paire cross-tenant dans `episode_similarities`.
6. **Frontend config-driven** : un seul `frontend/v2.html`, pilote tout (branding, tagline, platforms, socials, logo, CTA accent) via `/api/config`. Luminance WCAG pour choisir le texte hero/CTA.
7. **Vercel = 1 projet par tenant** : pas de subpath, pas de rewrites cross-project. `lamartingale-v2`, `gdiy-v2`, `lepanier-v2`, `finscale-v2`, `passionpatrimoine-v2`, `combiencagagne-v2`, `ms-hub` partagent la même DB Neon.

## Frontend — règle unique version

Seuls les fichiers suivants sont actifs et modifiables :
- `frontend/v2.html` (page d'accueil config-driven)
- `frontend/episode.html` (page détail épisode)
- `frontend/hub.html` (agrégateur cross-podcast)
- `frontend/v2-dashboard.html` (dashboard créateur)

V1 (dark mode, accent orange `#f59e0b`) a été supprimée le 24 avril 2026.
Ne pas recréer, ne pas référencer, ne pas restaurer depuis l'historique git.
Le domaine `https://lamartingale.vercel.app` (ancien V1) n'est plus servi publiquement.

## Historique V1

V1 supprimée du repo le 24 avril 2026 (commit de clôture + refonte package.json).
Derniers deploys fonctionnels V1 avant figeage (consultables via Vercel Dashboard sur `lamartingale-v1-archived`, SSO protégé) :
- `lamartingale-bi06fvue2` (5d avant la suppression, Ready)
- `lamartingale-lq5xu0f1c` (5d avant la suppression, Ready)

Ne pas réactiver. Le projet Vercel est figé, aucun auto-deploy, aucun trafic public.

## Sandbox policy (scripts DB & LLM)

Règles explicites pour toute exécution de `npx tsx scripts/*` ou `npx tsx engine/**` :

- **Read-only** (SELECT, reporting, diagnostics) : **exécution directe autorisée**. Ex. `scripts/check-*.ts`, reports, audits sans mutation.
- **Write** (INSERT / UPDATE / DELETE, migrations, backfills, sync JSONB→tables) : **dry-run obligatoire** — log du SQL généré + volume impacté + sample 5-10 rows avant/après. **STOP validation humaine** dans le chat, puis GO exécution.
- **LLM avec coût** (embeddings, quiz generation, auto-taxonomy, regenerate-quality-quiz) : **estimation coût obligatoire** avant exécution (nb appels × input/output tokens × prix modèle). **STOP humain si > $5**, GO si < $5.

Convention : tout nouveau script write doit accepter un flag `--dry` (default true) et `--write` (opt-in explicite). Un script qui écrit par défaut est un bug.

## Dette technique ouverte (à investiguer)
- **16 épisodes LM avec slug="" en BDD** (post-Rail 2 backfill 24/04/26) → dette irrécupérable via listing actuel `lamartingale.io/listes-des-episodes/?category=tous` (331 eps listés, 16 absents). Eps concernés : #126, #173, #178, #192, #208, #209, #213, #218, #219, #224, #225, #228, #229, #230, #231, #232. Probablement archivés/refondus sur le site. Script `scripts/backfill-slugs-lm.ts` a matché 1/17 (#227 → `investir-dans-lart-contemporain...`). Remaining = validation humaine (numéro ep ↔ URL par date de pub).
- **Divergence `episodes.guest_bio` (88/310) vs `guests.bio` (potentiellement ~288/310)** — probable duplication/dénormalisation obsolète. Audit à faire avant d'en supprimer une des deux colonnes.
- **4 épisodes sans match RSS** (#307, #295, #291, #174) — désynchronisation titre site/RSS. Voir `docs/feedback-orso-media.md`.
- **Feedback Orso Media** prêt dans `docs/feedback-orso-media.md` à envoyer à Matthieu Stefani quand l'occasion se présente.
- **Yvan Boutier sur PP — guest récurrent légitime** (5.8% des eps, ~4 épisodes). Audité Q1bis Phase 1 : ce n'est PAS un parasite, c'est un invité officiel et récurrent. Aujourd'hui, les épisodes où il intervient avec Carine Dany peuvent voir son LinkedIn correctement attribué via `pickGuestLinkedin`, mais il n'a pas de statut spécial. Fix structurel post-démo : ajouter un champ `recurringGuests: { name: string; linkedin: string }[]` dans `PodcastConfig` qui force la création d'un guest entity dédié quel que soit le titre de l'épisode (whitelist multi-eps), géré dans `engine/cross/match-guests.ts`. Décision D2 (Phase 1.5) : status quo Option A maintenant, fix structurel après démo Orso Media.

## LinkedIn pollution résiduelle post-Phase 2 (à résoudre post-démo)

Phase 2 LinkedIn (dry-run B-affiné) a identifié **255 UPDATE applied** (B1=168 label-match + B2=86 slug-match + B3=1 host-as-guest Stefani) et 4 catégories de pollution résiduelle qui restent à régler post-démo :

1. **CONFLICT à arbitrer humainement : 139 guests** (GDIY 77 + LP 62) — tous en `rule=order-fallback`. Source : `docs/_linkedin-changes-affined.csv` catégorie `CONFLICT-B4`. Workflow proposé : review humain ligne par ligne, soit UPDATE manuel via SQL, soit NULLIFY si aucun match clair, soit re-scraping ciblé.

2. **LP pollution résiduelle laurentkretz : ~62 guests** (sur 73 victimes initiales, 2 corrigés via UPDATE-B2, 9 restent NULLIFY préservés, 62 en CONFLICT-B4) gardent `/in/laurentkretz/` faute d'alternative confiante dans `episode_links`. Solution : re-scraping LP avec extracteur amélioré qui priorise label-match au scrape (avant denorm), ou nullification massive et acceptation perte temporaire.

3. **GDIY pollution résiduelle morganprudhomme : ~20 guests** (sur 47 victimes initiales, 27 corrigés via UPDATE-B1/B2, 20 restent en CONFLICT-B4 avec un order-fallback douteux). Idem que LP — re-scraping ou nullification.

4. **Gap structurel `guest_episodes` LM : 195/222 guests LM** ont `linkedin_url` non-null mais ZÉRO entrée dans `guest_episodes`. Confirmé par query stat (88% des guests LM avec linkedin sont orphelins). Source probable : pipeline historique scrape-deep ou un seed initial qui écrivait `guests.linkedin_url` directement sans passer par `populate-guests` (qui est le seul à insérer `guest_episodes`). Ces guests sont aussi invisibles côté matching cross-tenant, dashboard et search. À investiguer post-démo : (a) origine exacte (script `migrate-json` / `migrate-enriched` / autre ?), (b) re-population `guest_episodes` LM via re-run `populate-guests` après vérif que l'INSERT respecte les FK composites (Phase 1.5), (c) garantir que toute prochaine ré-ingestion ne wipe pas ces 195 linkedin_url valides.

## URLs prod

- La Martingale : https://lamartingale-v2.vercel.app (unique version)
- GDIY : https://gdiy-v2.vercel.app
- Le Panier : https://lepanier-v2.vercel.app
- Finscale : https://finscale-v2.vercel.app
- Passion Patrimoine : https://passionpatrimoine-v2.vercel.app
- Combien ça gagne : https://combiencagagne-v2.vercel.app
- Hub Univers MS : https://ms-hub.vercel.app
- GitHub : https://github.com/jeremyH974/lamartingale

## Chartes graphiques

- **La Martingale** : primary #004cff · Poppins · "Prenez le contrôle de votre argent"
- **GDIY** : primary #000000 · secondary #00F5A0 (accent vert néon) · Inter · "Les histoires de celles et ceux qui se sont construits par eux-mêmes" · logo Symbol_Full_Black

## Model routing (80/15/5)

Avant chaque tâche, auto-classifie dans HAIKU, SONNET ou OPUS.

- **HAIKU (~5%)** — renommages, ajout console.log, fix lint/typo trivial, lookup d'un nom d'endpoint
- **SONNET (~80%) — défaut** — nouvel endpoint, query SQL, composant HTML/D3, scraper, test de régression, enrichissement
- **OPUS (~15%)** — modif `engine/db/schema.ts` (god node), refactor cross-fichiers `api.ts ↔ queries.ts ↔ schema.ts`, debug divergence Vercel runtime vs local, décision archi dual-mode DB/JSON ou pgvector

### Overrides projet
- Toute modif d'un god node → OPUS minimum
- Raw SQL vs Drizzle sur un endpoint existant → SONNET mais lire `queries.ts` d'abord
- Migration schema (ajout colonne) → OPUS (impact migrate-json + migrate-enriched + regression)
- Front (`frontend/v2.html`, `frontend/v2-dashboard.html`) → SONNET
- Ajout script Python `scripts/` isolé → SONNET

### Protocole
1. Affiche `[Classification: X] — [justification 10 mots]` au début de chaque tâche
2. Si mismatch avec modèle actif : propose switch, ATTENDS validation
3. Escalation si >3 fichiers modifiés, décision archi, ou boucle d'erreurs Vercel

## Compact instructions

When compacting, preserve: file paths modified, SQL queries added/changed, endpoint signatures, migration decisions, test results, Vercel deploy errors, god-node impacts.
Discard: exploratory reasoning, intermediate attempts, verbose tool outputs, raw JSON dumps.
