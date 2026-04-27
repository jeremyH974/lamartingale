# Phase 1 — La couche primitives

*Livré le 2026-04-28, durée ~3h, coût Sonnet $0 (toutes les validations
sont passées par des mocks injectés — les vrais appels Sonnet
arriveront en Phase 4)*

## Ce qui a été construit (en 3 phrases pour non-tech)

Cinq briques Lego réutilisables qui font chacune une seule chose
indépendamment du reste : transcrire un audio, sortir 5 moments forts
d'un épisode, sortir 5 citations verbatim, trouver 3 à 5 épisodes du
catalogue qui prolongent un épisode source, et stocker tout ça dans
une table dédiée. Aucune brique n'est liée à un client précis ; les
mêmes 5 briques serviront pour Stefani-Orso comme pour un futur client
presse ou cinéma. Elles sont conçues pour être assemblées par les
"agents" de la couche du dessus (la couche pivot, qui arrive en Phase 3
avec lensClassificationAgent).

## Ce que ça permet de faire

1. Donner à Sillon la capacité de **transcrire un podcast français**
   (avec le nom de l'invité injecté pour que Whisper ne fasse pas de
   coquille sur les noms propres).

2. **Identifier 5 moments clippables** par épisode, prêts pour réseaux
   sociaux ou newsletter, avec un score de saillance + une justification
   éditoriale.

3. **Sortir 5 citations verbatim** d'un épisode, automatiquement
   refusées si elles paraphrasent au lieu de citer mot pour mot — c'est
   non-négociable côté production éditoriale Orso.

4. **Trouver les 3 à 5 épisodes du catalogue** (cross-tenant, donc
   couvrant les 6 podcasts Orso) qui prolongent un épisode source, avec
   pour chacun une explication de pourquoi un outil mono-source comme
   NotebookLM ne pourrait pas faire cette connexion. C'est l'argument
   commercial Sillon directement encodé dans la donnée.

5. **Stocker tout ça** dans une table générique `editorial_events`
   (créée en Phase 2) qui pourra plus tard accueillir d'autres types
   d'événements éditoriaux sans changer de schéma SQL.

## Comment c'est testé

- 89 nouveaux tests unitaires automatisés couvrent les 5 primitives.
- On a vérifié que chaque primitive refuse proprement les inputs
  invalides (chiffres hallucinés, paraphrases, métadonnées
  malformées).
- On a vérifié que les batchs DB respectent la contrainte Neon (au
  plus 8 inserts en parallèle pour éviter les pannes mémoire
  observées sur des batchs plus gros).
- On a vérifié qu'il n'y a aucune régression sur les 335 tests
  préexistants — on est passé de 335/335 verts à 424/424 verts.
- Aucun appel à Sonnet ou Whisper n'a été facturé pendant cette
  phase : les tests utilisent des mocks. Les vrais appels arriveront
  en Phase 4 (jalon calibration sur 9 combinaisons lens-épisode).

## Limites actuelles connues

1. La primitive `transcribeAudio` accepte un découpage audio en
   chunks via une fonction injectée. La vraie fonction de découpage
   (qui utilisera ffmpeg) n'est pas encore écrite — elle le sera juste
   avant le premier run réel sur un épisode pilote (Phase 6).

2. La table `editorial_events` n'est pas encore créée en BDD. C'est
   l'objet de la Phase 2 (Engagement 1). Donc `persistEditorialEvents`
   ne peut pas encore insérer pour de vrai — il valide les données et
   appelle un `insertBatchFn` injecté qui sera branché à la table en
   Phase 2.

3. Seul le schéma de validation `lens_classification` est aujourd'hui
   défini. Les schémas pour `key_moment`, `quote`, `cross_reference`
   sont volontairement reportés (cap anti-overgeneralization : on ne
   les écrit que quand un consommateur réel les utilise — Phase 5
   probablement).

4. Le détecteur de citations chiffrées hallucinées émet un warning
   plutôt qu'un rejet hard. C'est volontaire pour préserver les
   données de calibration en Phase 4 (mieux comprendre quand Sonnet
   hallucine et pourquoi). On pourra durcir en rejet hard après la
   Phase 4 si besoin.

## Pour les développeurs (annexe technique)

- **Fichiers créés** :
  - `engine/primitives/transcribeAudio.ts`
  - `engine/primitives/extractKeyMoments.ts`
  - `engine/primitives/extractQuotes.ts`
  - `engine/primitives/crossReferenceEpisode.ts`
  - `engine/primitives/persistEditorialEvents.ts`
  - `engine/primitives/types.ts` (PodcastContext, LLMFn,
    parseLLMJsonResponse partagés)
  - 5 fichiers de tests dans `engine/__tests__/`

- **Tests ajoutés** : 89 nouveaux tests (424/424 verts, baseline
  335 préservée).

- **Dépendances** : aucune nouvelle (zod 4.3.6 déjà présent).

- **Commits** : `d6afe48` · `6b00411` · `03f7640` · `307fdf8` ·
  `653525f` (tous push directement sur master).

- **Pattern de testabilité** : chaque primitive accepte une `config`
  avec ses dépendances externes (LLM, embedding, vector search, DB
  insert) injectées. Aucune ne lit `process.env`, aucune n'ouvre de
  connexion réseau dans son code propre. Le pattern matche
  `engine/agents/guestBriefAgent.ts` qui sert de référence repo.
