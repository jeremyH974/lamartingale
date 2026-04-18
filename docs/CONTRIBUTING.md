# Contributing — La Martingale

Audience : futur collaborateur, ou Jeremy qui reprend après un break.

## Prérequis

- **Node.js** ≥ 20 (testé sur 24)
- **npm** ≥ 10
- **Python** ≥ 3.11 (uniquement pour `scripts/clustering.py`)
- Un compte [Neon](https://neon.tech) (BDD) et une clé [OpenAI](https://platform.openai.com)
- Git

## Setup local

```bash
# 1. Cloner
git clone https://github.com/jeremyH974/lamartingale.git
cd lamartingale

# 2. Installer
npm install

# 3. Configurer l'environnement
cp .env.example .env
# → Éditer .env avec DATABASE_URL + OPENAI_API_KEY

# 4. Initialiser la BDD (première fois uniquement)
npx tsx src/db/migrate-json.ts              # migration base depuis JSON
npx tsx src/db/migrate-enriched.ts          # enrichissement
npx tsx src/db/migrate-deep-scraping.ts     # schema deep content

# 5. Alimenter la BDD (première fois)
npm run scrape:deep          # ~12 min
npm run scrape:rss           # ~30 s
npm run embeddings           # ~1 min, ~$0.01 (incrémental)
npm run similarity           # ~10 min

# 6. Lancer l'API
npx tsx src/api.ts           # http://localhost:3001
```

Si `DATABASE_URL` n'est pas défini : l'app tourne quand même en **mode JSON** (lecture seule des fichiers `data/*.json`). C'est pratique pour une première exploration sans BDD.

## Arborescence rapide

Voir [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) pour le détail.

```
api/                 # Entry Vercel (wrap Express)
src/
  api.ts             # 27 endpoints Express
  types.ts           # Types + recommandation engine
  db/                # Schema Drizzle + queries + migrations + audits
  ai/                # Embeddings, search, RAG, quiz adaptatif, analytics
  scrape-*.ts        # 5 scrapers
public/              # Front-ends statiques (V1 + V2)
scripts/             # Python (clustering) + build livrables
data/                # JSON (fallback + légers de référence)
docs/                # Cette documentation
```

## Conventions de code

### TypeScript
- `strict: true` dans `tsconfig.json` — pas de `any` implicite.
- Imports absolus relatifs (`./db/queries`), pas d'alias.
- Commentaires de code en **français** quand ils expliquent du métier ; anglais quand c'est technique pur.
- Les fichiers utilitaires one-shot (`src/db/fix-*.ts`, `audit-*.ts`) ont un header `/** ... */` expliquant leur but et leur durée de vie.

### Git
- Commits en **anglais** : `feat: ...`, `fix: ...`, `refactor: ...`, `docs: ...`, `chore: ...`.
- Un commit par unité logique (une feature ou un fix, pas « wip »).
- Commits longs : le `<title>` court + body détaillé (« pourquoi », pas « quoi »).
- Pas de commit `.env`, `node_modules/`, `dist/`, fichiers compilés.

### BDD
- Toute nouvelle colonne est **nullable** (rétrocompatibilité).
- Migrations toujours **idempotentes** (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`).
- Index sur les colonnes fréquemment filtrées (`pillar`, `difficulty`, `guest`, `date_created`).
- Ne pas modifier `episode_number` post-publication.

### Frontend
- HTML/CSS/JS vanille — pas de React, pas de build step.
- Un seul fichier `.html` par vue (V1 = `public/index.html`, V2 = `public/v2.html`).
- Charte V2 stricte : couleur `#004cff`, font `Poppins`.

## Workflow de développement

### Routine standard

```
1. Lire CLAUDE.md (contexte rapide, God nodes, décisions techniques)
2. Si modif structurelle : lire memory/reference_graph_insights.md
3. Implémenter (auto-classifier HAIKU/SONNET/OPUS selon CLAUDE.md)
4. Typecheck : npx tsc --noEmit
5. Tests : npm run test:regression (requiert API locale up)
6. Commit (anglais, titre court, body « pourquoi »)
7. Push origin master (déclenche auto-deploy V1 + V2)
8. Vérifier live : curl /api/stats sur les 2 URLs
9. Si changement majeur : mettre à jour CLAUDE.md + memory/project_lamartingale.md
```

### Ajouter un endpoint

1. Ajouter la route dans `src/api.ts` — respecter le pattern dual-mode (branche `if (process.env.DATABASE_URL) { ... }`).
2. Si requête SQL non triviale : ajouter une fonction dans `src/db/queries.ts`.
3. Ajouter l'endpoint dans `docs/API.md` (paramètres, réponse type, exemple curl).
4. Ajouter un test dans `src/db/test-regression.ts`.

### Ajouter une colonne à `episodes`

1. Modifier `src/db/schema.ts` (Drizzle) — colonne **nullable**.
2. Créer `src/db/migrate-NNN.ts` avec `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
3. Lancer `npx tsx src/db/migrate-NNN.ts` contre Neon.
4. Si la colonne est retournée par `/api/episodes/:id` → ajouter au **raw SQL** de `getEpisodeById` (pas Drizzle — cf. ADR-4 dans ARCHITECTURE.md).
5. Mettre à jour `docs/DATA.md` (ligne dans la table `episodes`).
6. Mettre à jour `src/db/audit-deep-scraping.ts` si le champ participe au fill rate.

### Ajouter un scraper

1. Créer `src/scrape-<nom>.ts`. Réutiliser les helpers de `scrape-media.ts` (fetch + cheerio + sleep 2 s).
2. Rate limiting 2 s entre requêtes, User-Agent `LaMartingale-DataBot/1.0`.
3. Idempotence : skip si déjà rempli (sauf flag `--force`).
4. Ajouter un script npm dans `package.json`.
5. Documenter dans `docs/PIPELINE.md`.

## Conventions de données

- **Slug** : toujours un string non-vide ou `NULL`. Jamais `""`.
- **Pillars** : un des 10 enum de `src/types.ts` (`IMMOBILIER`, `BOURSE`, …). Si un épisode arrive avec un pillar hors liste → défaut `Placements`.
- **Difficulty** : `DEBUTANT`, `INTERMEDIAIRE`, `AVANCE` — en majuscules sans accents.
- **Numéros d'épisode** : `integer` dans [1..N], partagés entre site et RSS. Ne jamais renumèroter.
- **Durées** : stockées en **secondes** (pas minutes).

## Générer les screenshots du README

URLs à capturer (fenêtre 1440×900, fond clair) :

| Capture | URL | Ce qu'il faut voir |
|---|---|---|
| `docs/screenshots/v2-home.png` | <https://lamartingale-v2.vercel.app/> | Page d'accueil V2 avec stats et piliers |
| `docs/screenshots/v2-search.png` | <https://lamartingale-v2.vercel.app/> (onglet Recherche) | Résultats hybrides pour « SCPI » |
| `docs/screenshots/v2-quiz.png` | <https://lamartingale-v2.vercel.app/> (onglet Quiz) | Question adaptative en cours |

Procédure :
1. Ouvrir l'URL dans Chrome en navigation privée (pour éviter cache/persist).
2. `Ctrl+Shift+P` → « Capture full size screenshot » (DevTools Command Menu).
3. Sauver dans `docs/screenshots/` avec le nom exact.
4. Crop si nécessaire à 1400×900 max.
5. Optimiser : `pngquant` ou équivalent (cible < 300 KB par image).

## Mémoire Claude (optionnel)

Si vous utilisez Claude Code : la mémoire projet est dans `~/.claude/projects/C--Users-jerem-lamartingale/memory/`.

Fichiers à maintenir :
- `project_lamartingale.md` — état projet, BDD, URLs, prochaines étapes
- `reference_graph_insights.md` — god nodes et ADR en condensé
- `MEMORY.md` — index

Mettre à jour après chaque milestone (commit important ou feature terminée). Le profil `user_jeremy.md` et `feedback_workflow.md` sont stables, pas besoin de les toucher.

## Support

- Issues GitHub : <https://github.com/jeremyH974/lamartingale/issues>
- Contact : <jeremyhenry974@gmail.com>
