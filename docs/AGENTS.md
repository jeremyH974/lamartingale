# Architecture agents — Stratégie MEDIUM et au-delà

**Date initiale** : 2026-04-25
**Pattern référence** : `engine/scraping/linkedin-filter.ts` (6/6 — voir audit `docs/_audit-prereqs-medium-2026-04-25.md`)

## Pourquoi ce document

Stratégie MEDIUM (carte cross-podcast, cas d'usage thématique, kit invités) introduit
des pipelines LLM réutilisables construits comme **agents** dès le départ pour garantir :
- duplicabilité tenant (pas de hardcode `lamartingale`),
- réutilisation cross-projet (un agent doit pouvoir être appelé via API, CLI, autre agent ou test),
- testabilité sans appel LLM réel (mocks injectables),
- séparation logique métier / persistence / transport.

Le repo contient déjà 16 pipelines existants (audit du 2026-04-25). Ce document fixe
le contrat pour les nouveaux et inventorie l'existant.

## Contrat agent (obligatoire pour `engine/agents/*`)

### Signature

```ts
export async function run(input: TIn, config: TConfig): Promise<TOut>;
```

Les types `TIn`, `TConfig`, `TOut` sont **exportés dans le même fichier** que l'agent.
L'export `run` peut être nommé en `<agentName>Run` si plusieurs agents cohabitent dans
un sous-dossier — le pattern `agent.run(...)` reste lisible côté appelant via
`import * as themeAnalysisAgent from './themeAnalysisAgent'; themeAnalysisAgent.run(...)`.

### Statelessness

- Aucune variable module-level mutée pendant un appel.
- Aucun accès direct DB depuis l'agent (responsabilité du wrapper appelant).
- Aucun cache interne (responsabilité de l'appelant via `getCached` de `engine/cache.ts`).

### LLM injecté via config

`config.llmFn` est une fonction qui accepte `(prompt, options)` et retourne soit une
string brute, soit un objet JSON déjà parsé. Cela permet :
- **Mock pour tests** : `config.llmFn = async () => ({ ... })` qui retourne un JSON fixé.
- **Override modèle** : Sonnet vs Haiku selon contexte, sans modifier l'agent.
- **Override provider** : Anthropic vs fallback OpenAI vs autre.

L'agent n'importe **jamais** `@ai-sdk/anthropic`, `@ai-sdk/openai`, ni `engine/ai/llm.ts`
directement. Le wrapper appelant injecte une fonction qui peut elle-même utiliser
`getLLM()` / `getLLMFast()`.

### Idempotence

- Même input + même config = même structure d'output (déterminisme à la sortie LLM près).
- Pas d'effets de bord observables.
- L'idempotence DB (UPSERT, ON CONFLICT) est gérée par le wrapper, pas l'agent.

### Découplage transport

Un agent ne sait pas s'il est appelé via API HTTP, CLI script, autre agent, ou test.
Logique métier seulement.

### README minimal par agent

50 lignes max à côté du fichier agent (`engine/agents/<name>/README.md` ou commentaire
JSDoc en tête de fichier si l'agent tient en un fichier) : input attendu, output produit,
1 exemple d'invocation, dépendances non triviales.

## Critères de réutilisabilité (preuve par construction)

Le contrat agent garantit la réutilisabilité par design. Les 2 critères ci-dessous
garantissent qu'elle est démontrée concrètement, pas juste prétendue.

### Critère 1 — Tests de réutilisation (obligatoire)

Pour chaque nouvel agent dans `engine/agents/`, le fichier de test
`engine/__tests__/<agentName>.test.ts` contient au minimum 2 tests d'invocation
distincts :

- **Test happy path** : invocation pour le use case principal (paramètres par défaut,
  modèle par défaut, tenant par défaut si applicable).
- **Test alternative path** : invocation avec paramètres différents (autre tenant,
  autre modèle LLM, autre option). Démontre que les paramètres sont effectivement
  externalisés et que l'agent fonctionne identiquement.

Si l'agent ne dépend pas du tenant (ex: `guestBriefAgent` global), l'alternative path
teste avec un autre input significatif (autre invité, autre scope).

Mock LLM via `config.llmFn` = fonction qui retourne un JSON fixé.

### Critère 2 — Documentation par exemple (obligatoire)

Le README de chaque agent (50 lignes max, à côté du fichier agent) contient au minimum
3 exemples d'invocation distincts dans une section `## Exemples` :

- **Exemple 1** : use case principal (le pour-quoi de l'agent).
- **Exemple 2** : use case alternatif (autre paramétrage significatif).
- **Exemple 3** : use case "extension" qui montre comment l'agent serait invoqué dans
  un scénario futur (ex: nouveau tenant, nouveau modèle, pipeline composé avec un
  autre agent).

Format pour chaque exemple :
- Code TypeScript invocable
- 2-3 lignes de commentaire expliquant le contexte de l'exemple
- Output attendu (résumé, pas le JSON complet)

### Vérification de réutilisabilité avant merge

Avant qu'un nouvel agent soit considéré "fini", checklist :
- [ ] Score 6/6 sur les critères du contrat agent
- [ ] 2+ tests d'invocation distincts qui passent
- [ ] README avec 3+ exemples
- [ ] Pas de hardcode tenant dans la logique métier
- [ ] LLM injecté via `config.llmFn` (testable avec mock)
- [ ] Aucune dépendance DB directe (responsabilité du wrapper)

## Pattern référence

`engine/scraping/linkedin-filter.ts` illustre toutes les règles ci-dessus :
- Module 100% pur (224 lignes).
- 6 fonctions exportées avec types stricts (`extractLinkedinSlug`, `normalizeName`,
  `isHostAsGuest`, `pickGuestLinkedin`, `buildExclusions`, `deriveSlugsFromName`).
- Pas d'I/O DB ni HTTP.
- Testé via `engine/__tests__/linkedin-filter.test.ts`.
- JSDoc complet en tête (logique unifiée, ordre de priorité, cas particuliers).

C'est le seul module **6/6** identifié à l'audit. À utiliser comme template.

## Wrapping persistence (responsabilité non-agent)

Les wrappers DB qui appellent un agent vivent dans `engine/agents/wrappers/`.

Exemple : `engine/agents/wrappers/persistClaims.ts` prend la sortie de
`themeAnalysisAgent.run()` et fait l'INSERT batch idempotent dans la table `claims`.

```ts
// pseudo-code
import { run as themeRun } from '../themeAnalysisAgent';
import { neon } from '@neondatabase/serverless';

export async function persistClaims(input, config) {
  const result = await themeRun(input, config);
  const sql = neon(process.env.DATABASE_URL!);
  for (const claim of result.claims) {
    await sql`INSERT INTO claims (...) VALUES (...) ON CONFLICT DO NOTHING`;
  }
  return result;
}
```

Le wrapper :
- Lit la config tenant via `getConfig()` (pas l'agent).
- Ouvre la connexion DB.
- Gère les transactions, UPSERT, idempotence DB.
- Peut être lui-même testé via mock du module agent.

## Inventaire MEDIUM (à venir)

### 1. crossPodcastGraphBuilder

- **Input** : `{ tenants: string[], nodeType: 'podcasts' | 'guests' | 'episodes', edgeType: 'cross-refs' | 'shared-guests', filters? }`
- **Output** : `{ nodes: GraphNode[], edges: GraphEdge[], metadata: { generatedAt, scope } }`
- **Wrapper** : aucun (data brute pour frontend, exposée via `/api/cross/graph`).
- **Source données** : `cross_podcast_guests`, `episode_links(link_type='cross_podcast_ref')`, `podcast_metadata`.
- **Réutilisabilité requise** : 2 tests minimum (happy + alternative), README 3 exemples.

### 2. themeAnalysisAgent

- **Input** : `{ theme: string, episodeIds: number[] }`
- **Config** : `{ llmFn, model: 'haiku' | 'sonnet', maxClaimsPerEpisode: number }`
- **Output** : `{ claims: Claim[], contradictions: Contradiction[], summary: string }`
- **Wrapper** : `engine/agents/wrappers/persistClaims.ts` (INSERT batch dans `claims`).
- **Source données** : `episodes.article_content`, `episodes.chapters`, `episodes.key_takeaways`.
- **Réutilisabilité requise** : 2 tests minimum (happy + alternative), README 3 exemples.

### 3. guestBriefAgent

- **Input** : `{ guestName: string, guestLinkedin?: string, scope: 'univers_ms' | 'global' }`
- **Config** : `{ llmFn, model: 'sonnet' }`
- **Output** : `{ brief: GuestBrief, sourceEpisodes: number[], keyPositions, quotes, originalQuestions }`
- **Wrapper** : `engine/agents/wrappers/persistGuestBrief.ts` (UPDATE colonnes brief sur `cross_podcast_guests`).
- **Source données** : `cross_podcast_guests`, `claims`, `episode_links(link_type='linkedin')`.
- **Réutilisabilité requise** : 2 tests minimum (happy + alternative), README 3 exemples.

## Pipelines existants — verdict de référence

Résultat audit 2026-04-25 — voir `docs/_audit-prereqs-medium-2026-04-25.md` Dimension 9
sous-section B (tableau scoring 6/6 par pipeline).

### Pattern référence (6/6)

- `engine/scraping/linkedin-filter.ts` — module pur, 6 helpers exportés, testé.

### Conformes partiels (3-4/6) — refacto post-démo optionnel

- `engine/ai/rag.ts` (3/6) — exporte `ragQuery`, à wrapper en `engine/agents/ragAgent.ts` pendant MEDIUM-2.
- `engine/ai/search.ts` (3/6) — `hybridSearch` (RRF + pgvector + pg_trgm).
- `engine/db/cross-queries.ts` (3/6) — queries cross-tenant lazy-init via `ensureUniverseInit()`.
- `engine/poc-rag/handler.ts` (3/6) — POC weekend Chantier 6, sera remplacé par `ragAgent`.
- `engine/cross/populate-guests.ts` helpers internes (4/6) — `extractBio`, `cleanBioChunk`,
  `normalizeGuestName`, `stripAccents` sont purs mais non exportés.

### Legacy acceptable (2/6) — pas de refacto, scripts CLI one-shot

Idempotents (ON CONFLICT, --dry / --write disciplinés) et isolés. Pas vocation à devenir agents.

- `engine/scraping/scrape-deep.ts`, `scrape-rss.ts`, `ingest-rss.ts`
- `engine/ai/embeddings.ts`, `similarity.ts`, `auto-taxonomy.ts`, `classify-predefined.ts`, `generate-quiz.ts`
- `engine/cross/match-guests.ts`, `populate-guests.ts` (script `main()`)
- `scripts/regenerate-quality-quiz.ts`

### Conflits potentiels

Aucun (audit 2026-04-25). Tous les scripts ETL existants sont isolés et idempotents.
Pas de side-effect global qui interférerait avec les nouveaux agents MEDIUM.

## Pipelines à normaliser post-démo (DETTE)

Refacto optionnel ~3 h par pipeline. Ne pas faire avant validation MEDIUM en prod.

- `engine/ai/rag.ts` → `ragAgent.run({ query, options }, { llmFn, dbFn, embedFn })`.
- `engine/ai/search.ts` → `searchAgent.run({ query, limit }, { dbFn, embedFn })`.
- `engine/db/cross-queries.ts` → décomposer en agents spécialisés selon usage MEDIUM (graphBuilder, statsAggregator).
- `engine/poc-rag/handler.ts` → absorbé par `ragAgent` (suppression du POC).

## Tests d'agents — pattern recommandé

Pas de mock LLM existant à date dans `engine/__tests__/`. Pattern à inventer dans
le premier agent MEDIUM puis rétro-documenter ici. Ébauche :

```ts
// engine/__tests__/themeAnalysisAgent.test.ts
import { run } from '../agents/themeAnalysisAgent';

const mockLLM = async (prompt: string) => ({
  claims: [{ claim_text: 'mock', claim_type: 'fact', confidence: 0.9 }],
});

it('extrait des claims structurés depuis 1 épisode', async () => {
  const out = await run(
    { theme: 'PER', episodeIds: [42] },
    { llmFn: mockLLM, model: 'haiku', maxClaimsPerEpisode: 5 },
  );
  expect(out.claims).toHaveLength(1);
});
```

L'agent doit pouvoir s'exécuter sans `ANTHROPIC_API_KEY` ni `OPENAI_API_KEY` ni
`DATABASE_URL` quand `config.llmFn` est mocké et que les données d'input sont fournies
explicitement (pas chargées depuis DB par l'agent).
