# Data Dictionary — La Martingale

Référence du schéma Neon Postgres, extensions activées, et fill rates actuels.

> **Source de vérité** : `src/db/schema.ts` (Drizzle). Les counts ci-dessous sont issus d'un audit live exécuté le 18/04/2026 via `src/db/doc-stats.ts`.

## Schéma relationnel

```
┌────────────────┐
│    episodes    │─┐  PK = id (serial)
│   313 rows     │ │  unique(episode_number)
│   20 colonnes  │ │
└────┬───────────┘ │
     │             │
     │      ┌──────┴──────────────────────────────────────┐
     │      │                                             │
     ▼      ▼                                             ▼
┌─────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│ episodes_media  │  │ episodes_enrichment  │  │ episode_similarities │
│   287 rows      │  │   313 rows (1:1)     │  │   6 260 rows         │
│   thumb+audio   │  │   tags, embedding    │  │   top-20 voisins     │
└─────────────────┘  └──────────────────────┘  └──────────────────────┘
     │      │
     │      ├──────────────────┐
     │      │                  │
     ▼      ▼                  ▼
┌────────────────┐  ┌──────────────────┐
│ quiz_questions │  │  episode_links   │
│   614 rows     │  │   9 906 rows     │
│                │  │   5 link_types   │
└────────────────┘  └──────────────────┘

┌─────────┐     ┌─────────────────┐     ┌──────────┐
│  guests │────>│ guest_episodes  │<────│ episodes │
│ 28 rows │     │   75 rows (M:N) │     │          │
└─────────┘     └─────────────────┘     └──────────┘

┌──────────────┐       ┌──────────────┐
│  taxonomy    │       │ learning_paths│
│  10 piliers  │       │   6 parcours  │
│  (via pillar)│       │  episodes_    │
│              │       │  ordered jsonb│
└──────────────┘       └──────────────┘
```

## Tables

### `episodes`
> Table principale. **313 records.**

| Colonne | Type | Nullable | Description |
|---|---|---|---|
| `id` | serial | PK | Clé primaire interne |
| `episode_number` | integer | unique | Numéro public #1..#313 |
| `title` | text | not null | Titre canonique (RSS ou site) |
| `slug` | text | nullable | Slug URL lamartingale.io — `NULL` pour 17 ép RSS-only |
| `guest` | text | nullable | Nom invité (peut inclure `Prénom Nom`) |
| `guest_company` | text | nullable | Société (non rempli à ce jour — 0/313) |
| `guest_bio` | text | nullable | Bio libre (88/313 remplie — dette tech vs `guests.bio`) |
| `pillar` | text | not null | Un des 10 piliers de `taxonomy` |
| `difficulty` | text | nullable | `DEBUTANT` / `INTERMEDIAIRE` / `AVANCE` |
| `date_created` | timestamp | nullable | Date publication (RSS pubDate ou JSON-LD) |
| `abstract` | text | nullable | Résumé court (312/313) |
| `article_content` | text | nullable | Article complet nettoyé — 296/313 (94,6 %), avg 5300 c |
| `article_html` | text | nullable | HTML brut pour re-parsing — 296/313 |
| `chapters` | jsonb | default `[]` | `[{title, order}]` — 296/313 ont ≥1 chapitre |
| `duration_seconds` | integer | nullable | Durée RSS — 309/313 (avg 65 min) |
| `rss_description` | text | nullable | Description RSS riche — 309/313 |
| `key_takeaways` | jsonb | nullable | `string[]` points clés — 310/313 |
| `related_episodes` | jsonb | nullable | `number[]` legacy |
| `external_references` | jsonb | nullable | `[{title, url}]` legacy |
| `community_rating` | real | nullable | 257/313 |
| `sponsor` | text | nullable | 288/313 |
| `article_url` | text | nullable | URL article complet (si slug) |
| `url` | text | nullable | URL canonique |
| `created_at` | timestamp | default now | |

**Indexes** : `pillar`, `difficulty`, `guest`, `date_created`.

### `episodes_media`
> Thumbnails + audio player. **287 records.**

| Colonne | Type | Nullable | Description |
|---|---|---|---|
| `id` | serial | PK | |
| `episode_id` | integer | FK → episodes | |
| `thumbnail_350` | text | nullable | 350×350 webp |
| `thumbnail_full` | text | nullable | og:image |
| `audio_player_url` | text | nullable | Iframe Audiomeans (202/287 remplie) |

### `episodes_enrichment`
> Tags, sub_themes, embedding. **313 records (1:1 avec episodes).**

| Colonne | Type | Nullable | Description |
|---|---|---|---|
| `id` | serial | PK | |
| `episode_id` | integer | FK | |
| `tags` | text[] | — | Tags générés par LLM (313/313) |
| `sub_themes` | text[] | — | Sous-thèmes (313/313) |
| `search_text` | text | nullable | Concaténation indexée pour ilike |
| `embedding` | vector(3072) | — | OpenAI text-embedding-3-large (313/313) |

Type `vector` est un customType Drizzle mappé sur l'extension pgvector. Dimension = 3072.

### `episode_similarities`
> Top-20 voisins pgvector cosine. **6 260 rows** (313 × ~20).

| Colonne | Type | Nullable | Description |
|---|---|---|---|
| `id` | serial | PK | |
| `episode_id` | integer | FK | |
| `similar_episode_id` | integer | FK | |
| `similarity_score` | real | — | Cosine similarity [0,1] |

Contraintes : `unique(episode_id, similar_episode_id)` + index sur `episode_id`.
**Stats actuelles** : min 0.577 · avg 0.700 · max 0.936.

### `episode_links` (nouveau — deep scraping)
> Liens extraits des articles, classifiés. **9 906 rows.**

| Colonne | Type | Nullable | Description |
|---|---|---|---|
| `id` | serial | PK | |
| `episode_id` | integer | FK (cascade delete) | |
| `url` | text | not null | URL absolue |
| `label` | text | nullable | Texte du `<a>` |
| `link_type` | text | not null | Voir ci-dessous |
| `created_at` | timestamp | default now | |

Contraintes : `unique(episode_id, url)` + index sur `episode_id` et `link_type`.

**Distribution** :

| link_type | Count | Règle de classification |
|---|---|---|
| `episode_ref` | 3 763 | URL `lamartingale.io/tous/*` |
| `company` | 2 786 | Domaine en 2 labels non-social |
| `resource` | 2 550 | Fallback (articles, pages quelconques) |
| `linkedin` | 560 | `linkedin.com/in/*` |
| `tool` | 247 | Whitelist outils finance (Boursorama, Trade Republic, etc.) |

### `guests`
> Annuaire invités. **28 records** (duplication à auditer vs `episodes.guest`).

| Colonne | Type | Nullable | Description |
|---|---|---|---|
| `id` | serial | PK | |
| `name` | text | unique, not null | |
| `company` | text | nullable | |
| `bio` | text | nullable | Biographie (28/28) |
| `specialty` | text[] | nullable | Domaines d'expertise |
| `authority_score` | integer | nullable | 1–5 |
| `episodes_count` | integer | nullable | Nombre d'apparitions |
| `linkedin_url` | text | nullable | 26/28 |

### `guest_episodes`
> Junction M:N entre guests et episodes. **75 rows.**

Contraintes : `unique(guest_id, episode_id)`.

### `quiz_questions`
> Questions de quiz. **614 records.**

| Colonne | Type | Nullable | Description |
|---|---|---|---|
| `id` | serial | PK | |
| `episode_id` | integer | FK | |
| `question` | text | not null | |
| `options` | jsonb | not null | `string[]` (4 options) |
| `correct_answer` | integer | not null | Index dans `options` (0..3) |
| `explanation` | text | nullable | |
| `difficulty` | text | nullable | Même vocabulaire que `episodes.difficulty` |
| `pillar` | text | nullable | |

**Indexes** : `episode_id`, `pillar`.

### `taxonomy`
> Les 10 piliers. **10 records.**

| Colonne | Type | Description |
|---|---|---|
| `pillar` | text, unique | `IMMOBILIER`, `BOURSE`, etc. |
| `name` | text | Nom affiché |
| `color` | text | Hex (e.g. `#004cff`) |
| `icon` | text | Émoji ou slug SVG |
| `episode_count` | integer | Cache (recalculé via migration) |
| `sub_themes` | text[] | Tableau de sous-thèmes |

### `learning_paths`
> Parcours pédagogiques. **6 records.**

| Colonne | Type | Description |
|---|---|---|
| `path_id` | text, unique | Slug parcours |
| `name` | text | |
| `description` | text | |
| `difficulty` | text | |
| `estimated_hours` | real | |
| `target_audience` | text | |
| `prerequisites` | text[] | |
| `outcomes` | text[] | |
| `episodes_ordered` | jsonb | `[{order, episode_id, why}]` |

## Extensions Postgres activées

| Extension | Usage |
|---|---|
| `vector` (pgvector) | Embeddings 3072d sur `episodes_enrichment.embedding` + recherche cosine |
| `pg_trgm` | Recherche lexicale (trigram similarity) pour hybrid search |
| `plpgsql` | Par défaut (procédures PL/pgSQL) |

## Fill rates — synthèse

| Champ | Rempli | % | Commentaire |
|---|---|---|---|
| `title` | 313/313 | 100 % | |
| `abstract` | 313/313 | 100 % | |
| `episode_number` | 313/313 | 100 % | Unique, continu [1..313] sans trou |
| `date_created` | 313/313 | 100 % | |
| `key_takeaways` | 310/313 | 99 % | |
| `difficulty` | 310/313 | 99 % | |
| `duration_seconds` | 309/313 | 98,7 % | 4 ép sans match RSS |
| `rss_description` | 309/313 | 98,7 % | idem |
| `article_content` | 296/313 | 94,6 % | 17 RSS-only sans article site |
| `chapters` (≥1) | 296/313 | 94,6 % | 100 % des articles présents ont un H2 |
| `slug` | 296/313 | 94,6 % | 17 RSS-only ont `NULL` |
| `sponsor` | 288/313 | 92 % | |
| `community_rating` | 257/313 | 82 % | |
| `guest_bio` (sur episodes) | 88/313 | 28 % | **divergence à auditer** avec `guests.bio` |
| `guest_company` | 0/313 | 0 % | Jamais rempli — info dans `guests.company` |

## Fichiers JSON legacy (`data/`)

Utilisés uniquement en fallback (si `DATABASE_URL` absent). Aussi référencés par le frontend V1 pour certaines vues.

| Fichier | Statut | Rôle |
|---|---|---|
| `episodes-complete-index.json` | actif (fallback JSON) | Index simplifié des 310+ épisodes |
| `episodes-enriched.json` | actif (fallback JSON) | Avec tags, sub_themes, search_text, URLs |
| `episodes-ai-enriched.json` | actif (fallback JSON) | Avec takeaways, learning_paths, rating |
| `episodes-media.json` | actif (fallback JSON) | Thumbnails + audio par episode_number |
| `quiz-bank.json` | actif (fallback JSON) | 614 questions |
| `experts.json` | actif (fallback JSON) | Invités principaux avec specialty/bio |
| `learning-paths.json` | actif (fallback JSON) | Parcours |
| `taxonomy.json` | actif (fallback JSON) | Piliers et sub_themes |
| `guests-bios.json` | legacy | Remplacé par `guests.bio` |
| `clustering.json` | actif | Généré par `scripts/clustering.py`, servi par `/api/clustering` |

Les JSON volumineux (`*.json` > 500 KB) sont exclus du contexte Claude via `.claudeignore`.

## Identifiants externes

| Type | Pattern | Exemple |
|---|---|---|
| Slug site | `https://lamartingale.io/tous/{slug}/` | `/tous/fonds-verts-greenwashing/` |
| RSS Audiomeans | `https://feed.audiomeans.fr/feed/{podcast-slug}.xml` | `la-martingale-010afa69a4c1` (principal) / `allo-la-martingale-5d56dcf7` (ALM) |
| Audio player | `https://player.audiomeans.fr/player-v2/{podcast-slug}/episodes/{uuid}` | — |

## Convention d'évolution du schéma

- Toute nouvelle colonne est **nullable** (zéro casse pour les anciens inserts).
- Toute migration est **idempotente** (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`).
- Ajout d'une colonne critique → mettre à jour `src/db/queries.ts` (raw SQL de `getEpisodeById` si retourné au front).
- Ne pas modifier `episode_number` post-publication — c'est un identifiant stable externe.
