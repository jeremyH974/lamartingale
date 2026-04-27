# Phase 3 — L'agent pivot lensClassificationAgent V1

*Livré le 2026-04-28, durée ~1h, coût Sonnet $0.02 (run préliminaire
réel sur GDIY #266 + le reste en mocks)*

## Ce qui a été construit (en 3 phrases pour non-tech)

L'**agent pivot** de tout le projet : il prend un épisode de podcast et
classe ses segments selon les 5 lens éditoriales du client (Ovni VC,
investissements alternatifs, DTC, insurtech B2B, fallback générique).
Pour chaque segment, il demande à Sonnet 4.6 lesquelles des lens
correspondent au contenu, avec un score de pertinence et une
justification ; les matches en dessous d'un seuil minimum sont jetés.
Le résultat est sauvegardé dans la table `editorial_events` créée en
Phase 2, prêt à être consommé par tous les livrables Pack 2 (cross-refs
par lens, brief annexe, newsletter).

## Ce que ça permet de faire

1. **Comprendre quelles lens éditoriales décrivent un épisode**.
   Exemple sur Platform.sh (GDIY #266) : la lens "Ovni VC deeptech"
   matche 4 segments sur 5, les 4 autres lens ne matchent jamais —
   confirmation que cet épisode est un cas-type Ovni Capital.

2. **Filtrer le bruit** : les matches faibles (score < 0.3) sont
   ignorés silencieusement, pas de pollution dans la table.

3. **Justifier chaque classification**. Chaque event persiste un
   `rationale` de 20 à 500 caractères qui explique pourquoi ce
   segment matche cette lens. C'est la transparence éditoriale qu'on
   peut montrer à Stefani (et qui passe le filtre Esther : "schema
   documenté + scaling prouvé").

4. **Composer les livrables Pack 2** par-dessus. Une fois les events
   classifiés, les cross-refs sont organisées par lens (Angle 3 du
   brief), la newsletter peut piocher les lens dominantes, le brief
   annexe peut séparer "épisodes Ovni-VC" des "épisodes alternative
   investments". Le pivot du pivot.

## Comment c'est testé

- 17 nouveaux tests unitaires (mocks Sonnet) couvrent le découpage en
  segments, le format du prompt, le seuil de filtrage, la gestion des
  lens_id inconnus, la résistance aux JSON malformés, l'agrégation
  cross-segments.
- **Test préliminaire E2E sur l'épisode GDIY #266 Plais avec un vrai
  appel Sonnet 4.6**, en utilisant un transcript "proxy" construit
  depuis l'abstract + chapters de la BDD (le vrai transcript Whisper
  arrive en Phase 6 avant l'envoi pilote). Résultat :
  - 5 segments analysés,
  - 4 events créés sur la lens "ovni-vc-deeptech",
  - 0 erreur de format JSON ou de validation schema,
  - Coût mesuré : 1.79 centimes pour l'épisode entier.
- 513/513 tests verts, aucune régression.

## Limites actuelles connues

1. **Le transcript utilisé en Phase 3 est un proxy** (abstract +
   chapters + key_takeaways de la BDD), pas un transcript Whisper
   réel. C'est intentionnel pour le test préliminaire — le V1 valide
   que Sonnet répond cohérent. Le vrai pipeline Whisper sera lancé
   en Phase 6 sur les 4 épisodes pilote pour l'envoi.

2. **Le seuil `lens_score >= 0.3` est arbitraire en V1**. C'est en
   Phase 4 (jalon calibration sur 9 combinaisons lens-épisode) qu'on
   pourra le calibrer si besoin (par exemple si on observe trop de
   bruit ou trop de silence).

3. **La fonction `concept-match-v1` (Phase 2) n'est PAS appelée par
   cet agent V1**. Le scoring est délégué à Sonnet en V1. La fonction
   déterministe servira de baseline en V2 et de filet de secours si
   Sonnet est indisponible. Pas un bug — choix V1 explicite.

4. **Chaque segment est analysé séquentiellement**. Sur un épisode
   long (vrai Whisper de 2h ≈ ~30 segments de 4 min), cela ferait
   ~30 appels Sonnet en série = ~90s. Phase 6 pourra paralléliser
   (mais cap Sonnet : 4 requêtes/sec en parallèle). À considérer si
   latence devient un problème.

## Pour les développeurs (annexe technique)

- **Nouveaux fichiers** :
  - `engine/agents/lensClassificationAgent.ts` (agent + helpers
    `chunkTranscriptIntoAnalyticSegments`, `buildSegmentPrompt`,
    `buildLensPromptBlock`).
  - `engine/__tests__/lens-classification-agent.test.ts` (17 tests).
  - `experiments/autonomy-session-2026-04-28/preliminary-run-phase3.ts`
    (script run préliminaire E2E).

- **Coût Sonnet réel** : $0.0179 sur GDIY #266 (5 segments,
  ~13k tokens input, ~1k output). Logué dans
  `experiments/autonomy-session-2026-04-28/costs.log`.

- **Commit** : `c84390d`.

- **Anti-régression** : 513/513 tests verts.

- **Auto-continue Phase 4** : critère "Sonnet répond cohérent sur 1
  test préliminaire" satisfait. Phase 4 = jalon calibration sur 9
  combinaisons (lens × épisode) avec décision stratégique GO/NO-GO
  Phase 5.
