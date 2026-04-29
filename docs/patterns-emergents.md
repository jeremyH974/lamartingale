# Patterns émergents — liste de courses Sprint Modularisation S5

> Document créé en Phase Alpha S2 T2.2 (29/04/2026) suite aux décisions
> stratégiques D1 (Sillon = plateforme cross-corpus, V2 cinéma + V3 talent
> visés en 12 mois) et D2 (Sprint Modularisation 2 semaines validé entre
> S4 et S5). Chaque pattern listé ici est un candidat à factorisation
> pour préserver l'option cross-corpus sans payer le coût de la
> modularisation maintenant.
>
> Format par entrée :
> 1. Nom du pattern
> 2. Contexte podcast actuel
> 3. Hypothèse réutilisation cinéma / talent
> 4. Décision : factorisé maintenant OU différé Sprint Modularisation S5

---

## P1 — Generic step-based pipeline orchestrator

**Contexte podcast actuel** (Phase Alpha S2 T2.2) :

`engine/pipelines/runPack.ts` orchestre les 5 livrables Sillon (L1
key-moments → L2 quotes → L3 cross-refs → L4 newsletter → L5
brief-annexe) pour le pilote Stefani-Orso. Chaque livrable est un
agent (Sonnet ou Opus) appelé séquentiellement, avec validation
qualité par étape (qualityValidator), fallback opus rewrite si
score <7,5, et cap budget par épisode ($1,5).

L'orchestration historique vit dans
`experiments/autonomy-session-2026-04-28/phase6-runner.ts` (1244 lignes,
hardcodé sur 4 épisodes pilote). T2.2 a extrait l'orchestration dans
`runPack(packDef, sourceId, clientConfig, registry, options)` qui :

- Lit une `PackDefinition` déclarative (`steps[]`, `output_format`,
  `beneficiary_type`).
- Exécute les steps dans l'ordre via un `AgentRegistry` (Map
  `agent_id → AgentFn`).
- Propage la sortie de chaque agent aux suivants via `prior[step_id]`.
- Capture les exceptions, gère les agents required vs non-required.
- Cape le budget cumulé en cents-USD ; skip les steps restantes
  une fois le cap dépassé.
- Retourne un `PackOutput` avec `StepResult[]` et metadata.

**Hypothèse réutilisation cross-corpus** :

L'orchestrateur ne mentionne nulle part "podcast", "épisode",
"transcript", "guest". Le `payload` opaque entre étapes est l'élément
clé qui permet à des agents cinéma (extractScenesCles, analyzeAesthetic,
crossReferenceFilms) ou talent (extractInterviewMoments,
analyzePersonaConsistency, suggestCasting) de reprendre le même
orchestrateur sans modification.

Pour chaque verticale future, le caller construit son propre
`AgentRegistry` avec ses propres agents. Le `runPack` reste identique.

**Décision** : ✅ **factorisé maintenant** (Phase Alpha S2 T2.2).
Pas de coût marginal de factorisation : c'est l'implémentation initiale
du squelette préexistant `runPack.ts` qui throw `not implemented`. Le
choix d'un payload opaque (`unknown`) plutôt qu'un type rigide
(ex: `transcript: TranscriptResult`) coûte ~0 ligne de code mais évite
un refacto Sprint Modularisation S5.

**Validation par les tests** : 21 tests vitest dans
`engine/__tests__/run-pack.test.ts`, dont 2 packs déclaratifs (smoke
1-step et integration 5-step) qui prouvent que l'orchestrateur ne
contient aucune référence sémantique au domaine podcast.

**Note Sprint Modularisation S5** : ne PAS toucher cet orchestrateur en
S5. Il est déjà cross-corpus-ready. Le travail S5 sur ce pattern se
limitera à : (a) brancher les agents réels (wrappers autour des
primitives Sonnet/Opus existantes) au registry, (b) éventuellement
ajouter des features non-MVP (parallel steps, retry/backoff) si demande
client validée.

---

## (à compléter au fil des sessions S2-S3-S4)

Tout pattern futur identifié pendant S2-S3-S4 doit être ajouté ici
avant le démarrage du Sprint Modularisation S5. Format identique aux
4 sections ci-dessus.
