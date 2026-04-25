# engine/agents

Agents purs MEDIUM (cf contrat dans `docs/AGENTS.md`).

> **Règles d'or** : un agent = `run(input, config) => output`. Pas de DB, pas
> d'env, pas de side-effects. Le LLM est injecté via `config.llmFn`. Les
> wrappers (DB + persistence + orchestration) vivent dans `wrappers/`.

## guestBriefAgent

Génère un kit invité cross-univers (positions tranchées, citations, questions
originales jamais posées, synthèse markdown) à partir d'un set d'épisodes
préparé par un wrapper.

- **Input** : `{ guestName, guestLinkedin?, episodes: [{ episode_id, podcast_id, title, date_created, source_content, source_type, source_quality? }] }`
- **Config** : `{ llmFn, llmModel: 'sonnet' | 'haiku', maxKeyPositions?, maxQuotes?, maxOriginalQuestions? }`
- **Output** : `{ briefMd, keyPositions, quotes, originalQuestions, metadata: { sourcesUsed, sourceQualityAvg, llmModel, generationTimeMs } }`

Source content fourni par `wrappers/sourceSelector.ts` (cascade
`article_content` > `chapters_takeaways` > `rss_description`).

### Exemples

#### 1 — Cas vitrine : brief Larchevêque cross-podcast

```ts
import { guestBriefAgent } from '@engine/agents/guestBriefAgent';
import { generateText } from 'ai';
import { getLLM } from '@engine/ai/llm';

// Le wrapper a déjà extrait les sources via sourceSelector.
const result = await guestBriefAgent.run(
  {
    guestName: 'Eric Larchevêque',
    guestLinkedin: 'https://www.linkedin.com/in/ericlarch/',
    episodes: [
      { episode_id: 2206, podcast_id: 'gdiy', title: '#243 Ledger...', date_created: '2022-02-20', source_content: '...3238c article...', source_type: 'article_content', source_quality: 0.8 },
      { episode_id: 925, podcast_id: 'lamartingale', title: 'Bitcoin, arnaque ou opportunités ?', date_created: '2019-04-16', source_content: '...2986c article...', source_type: 'article_content', source_quality: 0.8 },
      { episode_id: 3136, podcast_id: 'passionpatrimoine', title: '#26 L\u2019anti CGP !', date_created: '2023-04-25', source_content: '...2735c rss...', source_type: 'rss_description', source_quality: 0.1 },
    ],
  },
  {
    llmFn: async (prompt) => (await generateText({ model: getLLM(), prompt })).text,
    llmModel: 'sonnet',
  },
);
// → Brief avec ~8 positions cross-podcast, 6 citations, 5 questions, métadonnées sourceQualityAvg ≈ 0.57
```

#### 2 — Variante Haiku, autre invité, max custom

```ts
// Brief Yoann Lopez avec Haiku — démontre que llmModel et caps sont
// effectivement externalisés via config.
const result = await guestBriefAgent.run(
  {
    guestName: 'Yoann Lopez',
    episodes: [/* 4 episodes LM préparés par wrapper */],
  },
  {
    llmFn: async (prompt) => (await generateText({ model: getLLMFast(), prompt })).text,
    llmModel: 'haiku',
    maxKeyPositions: 5,
    maxQuotes: 4,
    maxOriginalQuestions: 3,
  },
);
// → Brief plus court, ~5x moins cher, qualité acceptable pour invités
//   à matière modérée.
```

#### 3 — Composition future avec themeAnalysisAgent (MEDIUM-2)

```ts
// Pipeline composé : un brief sert de contexte à l'analyse thématique d'un
// thème transverse. Démontre la réutilisabilité cross-agents.
const guestBrief = await guestBriefAgent.run(input, sonnetConfig);

const themeAnalysis = await themeAnalysisAgent.run(
  {
    theme: 'entrepreneuriat tech',
    guestContext: guestBrief.keyPositions, // réinjecté en input d'un autre agent
    episodeIds: input.episodes.map((e) => e.episode_id),
  },
  haikuConfig,
);
// → MEDIUM-2 : claims thématiques enrichis du contexte invité.
//   Aujourd'hui placeholder — pattern à respecter quand themeAnalysisAgent atterrit.
```

### Tests

`engine/__tests__/guest-brief-agent.test.ts` — 8 cas (happy path, alternative
path, robustesse parsing, throw fixtures). Aucun appel LLM réel : `config.llmFn`
est mocké via une fonction qui renvoie un JSON fixé.
