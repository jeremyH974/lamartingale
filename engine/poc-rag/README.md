# engine/poc-rag/ — POC weekend 2026-04-25

**Statut : POC isolé, non productisé.** À supprimer ou industrialiser plus tard.

Mini-spike Chantier 6 du brief weekend : exposer un endpoint dédié `/api/knowledge/query` qui réutilise `engine/ai/rag.ts` (pipeline complet déjà en place) et reformatte la réponse selon contrat spec :

```
POST /api/knowledge/query
Body : { "question": "string" }
Out  : {
  "answer": "...",
  "sources": [
    { "episode_id": X, "episode_number": Y, "title": "...", "url": "...", "excerpt": "..." }
  ]
}
```

## Limites POC
- LM uniquement (tenant figé via `PODCAST_ID=lamartingale`).
- Pas de cache, pas d'auth, pas de rate limit, pas de log persisté.
- Pas de schéma DB modifié, réutilise embeddings + chapters + episodes existants.
- Pas de UI, test via `scripts/test-rag-poc.sh`.

## Code
- `handler.ts` : wrapper de `ragQuery()` + enrichissement DB (episode_id, url, excerpt) + format adapter.
- Route : `engine/api.ts` ligne ~555 (entrée minimale 5 lignes pointant ici).

## Pour lancer
```bash
PODCAST_ID=lamartingale PORT=3001 npx tsx engine/api.ts
# autre terminal :
bash scripts/test-rag-poc.sh
```
