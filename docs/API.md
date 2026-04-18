# API Reference — La Martingale

Référence exhaustive des **27 endpoints** Express (`src/api.ts`). Base URL prod : `https://lamartingale.vercel.app` (V1) ou `https://lamartingale-v2.vercel.app` (V2) — les deux pointent sur la même API.

## Comportement dual-mode

Chaque endpoint vérifie `process.env.DATABASE_URL` au runtime :
- **Si défini** → lit depuis **Neon Postgres** via `src/db/queries.ts` (ou raw SQL tagged template pour les queries critiques).
- **Sinon** → fallback sur fichiers **JSON** dans `data/` (pratique pour dev local).

Trois endpoints requièrent strictement la BDD (renvoient `503` en JSON-only) : `/api/analytics`, `/api/similar/:id`, `/api/search/hybrid`, `/api/chat`, `/api/quiz/next`, `/api/quiz/answer`.

## Identifiants

Partout où `:id` apparaît pour un épisode, il s'agit de `episode_number` (le numéro public #1..#313), **pas** de la clé primaire interne.

---

## Episodes

### `GET /api/episodes`

Liste paginée des épisodes, avec filtres.

**Query params** :

| Param | Type | Défaut | Description |
|---|---|---|---|
| `pillar` | string | — | `IMMOBILIER`, `BOURSE`, `CRYPTO`, `ALTERNATIFS`, `PE_STARTUP`, `PATRIMOINE_FISCALITE`, `FINANCES_PERSO`, `IMPACT_ESG`, `CROWDFUNDING`, `ENTREPRENEURIAT` |
| `difficulty` | string | — | `DEBUTANT`, `INTERMEDIAIRE`, `AVANCE` |
| `search` | string | — | Match `title`, `guest`, `search_text` (ilike) |
| `page` | number | 1 | Pagination |
| `limit` | number | 20 | Taille page |

**Réponse 200** :
```json
{
  "total": 313,
  "page": 1,
  "limit": 20,
  "pages": 16,
  "episodes": [
    { "id": 313, "title": "...", "guest_name": "...", "pillar": "PATRIMOINE_FISCALITE",
      "difficulty": "INTERMEDIAIRE", "url": "...", "thumbnail": "..." }
  ]
}
```

**Exemple** :
```bash
curl "https://lamartingale.vercel.app/api/episodes?pillar=IMMOBILIER&limit=5"
```

### `GET /api/episodes/:id`

Détail d'un épisode par `episode_number`.

**Path params** : `id` (number) — `episode_number`.

**Réponse 200** : `{ episode, related, expert, audio_player }`. L'`episode` retourne `title`, `guest_name`, `guest_bio`, `pillar`, `difficulty`, `abstract`, `key_takeaways[]`, `publication_date`, `thumbnail`, `thumbnail_full`. `related` : 5 épisodes même pilier. `expert` : premier invité joint via `guest_episodes`.

**Réponse 404** : `{ "error": "Episode not found" }`.

**Exemple** :
```bash
curl https://lamartingale.vercel.app/api/episodes/312
```

### `GET /api/enriched/:id`

Données d'enrichissement (tags, sub_themes, search_text).

**Réponse 200** : `{ id, tags[], sub_themes[], search_text }`
**Réponse 404** : `{ "error": "Enriched data not found" }`

---

## Experts (invités)

### `GET /api/experts`

Liste triée par `authority_score` décroissant.

**Query params** : `specialty` (string, optionnel) — match partiel dans le tableau `specialty`.

**Réponse 200** : `{ total, experts: [{ id, name, company, specialty[], episodes[], authority_score, bio }] }`.

### `GET /api/experts/:id`

Détail d'un expert par slug (`name` en kebab-case).

**Réponse 404** : `{ "error": "Expert not found" }`.

```bash
curl https://lamartingale.vercel.app/api/experts/matthieu-stefani
```

---

## Learning Paths

### `GET /api/paths`

Les 6 parcours pédagogiques.

**Réponse 200** : `{ total, paths: [{ id, name, description, difficulty, estimated_hours, episode_count, target_audience, outcomes[] }] }`.

### `GET /api/paths/:id`

Détail d'un parcours, avec épisodes résolus.

**Réponse 200** : `{ path: { ..., steps: [{ order, episode_id, why, episode: {...} }] } }`.

---

## Taxonomy

### `GET /api/taxonomy`

Retourne `{ pillars: [{ id, name, color, icon, episode_count, sub_themes[] }] }`.

### `GET /api/taxonomy/pillars`

Version aplatie sans `sub_themes` enrichis : `{ pillars: [{ id, name, icon, color, episode_count, sub_theme_count }] }`.

### `GET /api/taxonomy/pillars/:id`

Détail d'un pilier avec ses sub_themes et les épisodes résolus. **JSON-only** (cette query reste sur les fichiers JSON, non migrée vers BDD).

---

## Search

### `GET /api/search`

Recherche lexicale (ilike) dans `title`, `guest`, `search_text`, tags (JSON) / company (experts) / name (paths).

**Query params** : `q` (string, min 2 chars).

**Réponse 200** : `{ query, episodes[], experts[], paths[] }`.

**Erreur 400** si query < 2 chars : `{ "error": "Query must be at least 2 characters" }`.

### `GET /api/search/hybrid`

Recherche hybride **sémantique (pgvector cosine) + lexicale (pg_trgm)** fusionnée via RRF (k=60, poids 0.7/0.3).

**Requiert** : `DATABASE_URL` + `OPENAI_API_KEY` — sinon `503`.

**Query params** : `q` (min 2 chars), `limit` (défaut 10).

**Réponse 200** :
```json
{
  "query": "investir en SCPI",
  "results": [
    { "episode_number": 232, "title": "Crise des SCPI...", "guest": "...",
      "pillar": "IMMOBILIER", "abstract": "...", "thumbnail": "...",
      "score": 0.87, "match_type": "hybrid", "semantic_rank": 1, "lexical_rank": 2 }
  ],
  "timing_ms": 412
}
```

**Coût par requête** : ~$0.00001 (un embedding OpenAI supplémentaire).

---

## Similarité (pgvector)

### `GET /api/similar/:id`

Top épisodes sémantiquement proches via `episode_similarities` (précalculée).

**Requiert** : `DATABASE_URL` — sinon `503`.
**Query params** : `limit` (défaut 10).

**Réponse 200** : `{ episode_number, count, similar: [{ id, title, guest, pillar, difficulty, similarity, thumbnail }] }` — `similarity` est une string avec 4 décimales.

---

## Graph

### `GET /api/graph`

Noeuds (épisodes) et arêtes (`same_guest`, `same_expert`, `learning_path`).

**Réponse 200** :
```json
{
  "nodes": [{ "id": 312, "title": "...", "guest": "...", "pillar": "...",
              "difficulty": "...", "tags": [], "degree": 4 }],
  "edges": [{ "source": 312, "target": 311, "type": "same_guest", "weight": 2 }],
  "metadata": { "node_count": 313, "edge_count": 178 }
}
```

Le type d'arête est décoré selon le contexte en mode JSON (expert + path). En mode BDD, seul `same_guest` est généré actuellement.

---

## Quiz

### `GET /api/quiz`

Quiz aléatoire filtré par pilier/difficulté.

**Query params** : `pillar`, `difficulty`, `limit` (défaut 10).
**Réponse 200** : `{ total_available, count, questions: [{ question, options[], correct_answer, explanation, difficulty, pillar }] }`.

### `GET /api/quiz/episode/:id`

Questions pour un épisode donné.

**Réponse 200** : `{ episode_id, count, questions: [{ question, options[], correct_answer, explanation }] }`.

### `POST /api/quiz/next`

Prochaine question pour un quiz **adaptatif** (IRT simplifié). **Requiert BDD** (`503` sinon).

**Body** :
```json
{ "profile": { "scores": {}, "counts": {}, "theta": {}, "history": [] } }
```
(ou `profile` omis → init par défaut via `initProfile()`)

**Réponse 200** : une question avec son `strategy: "exploration" | "exploitation"` et son `target_pillar`.
**Réponse 200 `{done: true}`** si toutes les questions répondues.

### `POST /api/quiz/answer`

Enregistrer une réponse et mettre à jour le profil.

**Body** :
```json
{
  "question_id": 42,
  "answer": 2,
  "profile": { "scores": {}, "counts": {}, "theta": {}, "history": [] }
}
```

**Réponse 200** : `{ correct, updated_profile, recommended_episode, explanation }`.
**Erreur 400** : `{ "error": "Missing question_id, answer, or profile" }`.

---

## RAG Chat

### `POST /api/chat`

Chat conversationnel (retrieve top-5 via hybrid search, augment, generate via gpt-4o-mini). Prompt système en français, pédagogique, cite les épisodes par numéro.

**Requiert** : `DATABASE_URL` + `OPENAI_API_KEY` — sinon `503`.

**Body** : `{ "message": "Comment débuter en immobilier locatif ?" }`.
**Erreur 400** : `{ "error": "Missing message" }`.

**Réponse 200** :
```json
{
  "response": "Pour débuter en immobilier locatif, je vous recommande...",
  "sources": [
    { "episode_number": 311, "title": "...", "guest": "...",
      "pillar": "IMMOBILIER", "relevance_score": 0.87 }
  ],
  "model": "gpt-4o-mini",
  "timing_ms": 2840
}
```

---

## Analytics / Stats

### `GET /api/stats`

Compteurs globaux + distributions + top experts.

**Réponse 200** : `{ total_episodes, total_experts, total_paths, total_pillars, total_quiz, episodes_by_pillar, episodes_by_difficulty, top_experts }`.

### `GET /api/analytics`

Métriques data science : densité par pilier/mois, top guests, diversité, évolution difficulté, co-occurrences de tags, stats similarités, couverture embeddings.

**Requiert BDD** (`503` sinon).

### `GET /api/clustering`

Retourne `data/clustering.json` si présent. Fichier généré par `python scripts/clustering.py` (UMAP + HDBSCAN). `404` si absent.

---

## Media

### `GET /api/media`

Tous les médias indexés par `episode_number` : `{ "312": { thumbnail_350, thumbnail_full, audio_player }, ... }`.

### `GET /api/media/:id`

Médias d'un épisode : `{ thumbnail_350, thumbnail_full, audio_player }`.
**Réponse 404** : `{ "error": "No media for this episode" }`.

---

## Tags

### `GET /api/tags`

Tags dédupliqués, triés par fréquence descendante.

**Réponse 200** : `{ total_tags, tags: [{ tag, count }] }`.

---

## Recommendations

### `POST /api/recommend`

Moteur de recommandation basé sur profil utilisateur (scoring : pilier match +30, difficulté +20, goals +25, learning_path +10, récence +5).

**Query params** : `limit` (défaut 10).

**Body** :
```json
{
  "age_range": "25-35",
  "patrimony_level": "STARTER",
  "investment_experience": "DEBUTANT",
  "interests": ["IMMOBILIER", "BOURSE"],
  "goals": ["BUILD_SAVINGS", "INVEST_REAL_ESTATE"],
  "completed_episodes": [],
  "completed_paths": []
}
```

**Erreur 400** : `{ "error": "Missing interests or investment_experience" }`.

**Réponse 200** : `{ total, recommendations: [{ episode, score, reasons[] }] }`.

---

## Divers

### `GET /v2`

Redirige vers `public/v2.html` (brand-aligned). Utile en local (sur Vercel V2, le rewrite se fait côté config).

---

## Codes d'erreur standardisés

| Code | Signification | Exemple |
|---|---|---|
| `400` | Paramètres manquants / invalides | `GET /api/search` sans `q`, `POST /api/chat` sans `message` |
| `404` | Ressource introuvable | Episode / Expert / Path absent |
| `500` | Erreur serveur (BDD down, OpenAI timeout) | `{ "error": "<message raw>" }` |
| `503` | Dépendance manquante (BDD ou clé API) | RAG sans `OPENAI_API_KEY` |

## Authentification

**Aucune** pour l'instant — tous les endpoints sont publics. Auth prévue (Vercel Auth ou Clerk) pour la roadmap profil persistant.

## CORS

`cors()` activé par défaut (toutes origines). À durcir si l'API devient publique à grande échelle.
