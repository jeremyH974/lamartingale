# engine/agents/wrappers

Wrappers d'orchestration entre la base de données, les agents (purs, cf
`docs/AGENTS.md`) et la persistence. **Les wrappers ont des side-effects
assumés** ; les agents n'en ont pas.

## Pattern

Un wrapper standardise le pipeline suivant :

1. **Fetch DB** — récupère les inputs depuis Postgres (filtre tenant si
   applicable).
2. **Sélection de source** — appelle `sourceSelector.selectBestSource()` pour
   choisir le champ de contenu le plus riche disponible par épisode.
3. **Préparation input agent** — assemble la structure `Input` documentée
   dans le contrat de l'agent.
4. **Invocation agent** — `agent.run(input, { llmFn, llmModel, ... })`. Le
   `llmFn` est injecté ici (provider centralisé `engine/ai/llm.ts`).
5. **Persistence** — UPDATE/INSERT idempotent en DB.
6. **Logging / metrics** — durée, sources utilisées, modèle, coût estimé.

L'agent reste pur (pas de DB, pas de fetch, juste `input → llmFn → output`).
Le wrapper est testable séparément avec un agent mocké, et l'agent est
testable séparément avec un `llmFn` mocké.

## sourceSelector.ts

Cascade extensible de stratégies d'extraction de contenu pour un épisode :

| Type                  | Priority | Min length | Source DB                     |
| --------------------- | -------- | ---------- | ----------------------------- |
| `transcript`          | 100      | 5000       | _(pas encore en BDD)_         |
| `article_content`     | 80       | 500        | `episodes.article_content`    |
| `chapters_takeaways`  | 50       | 200        | `chapters[].title` + `key_takeaways[]` |
| `rss_description`     | 10       | 100        | `episodes.rss_description`    |

`selectBestSource(episode)` parcourt la cascade et retourne la première
source qui dépasse son `minLength`. Score qualité = `priority / 100` (0..1),
remonté à l'agent pour traçabilité.

**Fallback ultime** : si rien ne dépasse son minLength, on retombe sur
`rss_description` (potentiellement vide) avec score `0.1`. C'est au
wrapper d'invocation de filtrer ce cas si besoin (ex. skip l'épisode
plutôt que d'envoyer du vide au LLM). Le sourceSelector reste pur.

### Ouverture future : transcript audio

La constante `SOURCE_PRIORITIES` contient une ligne `transcript` commentée.
Activation post-démo en 2 lignes :

1. Décommenter l'entrée `{ type: 'transcript', priority: 100, minLength: 5000 }`.
2. Ajouter le champ `transcript` à `SourceEpisode` et l'extraire dans
   `extractContent`.

Aucune modification nécessaire dans les agents ou les wrappers existants —
c'est l'objet du score de priorité.

> **Dette** : le pipeline d'extraction transcript audio est hors scope
> MEDIUM-3. Voir le chantier MEDIUM-2 pour la roadmap.

## Wrappers actuels

- `persistGuestBrief` — orchestre `guestBriefAgent` pour générer et persister
  un kit invité dans `cross_podcast_guests.brief_*` (cf MEDIUM-3).
