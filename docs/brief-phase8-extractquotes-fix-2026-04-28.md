# Brief Claude Code — Phase 8 : fix extractQuotes timestamps L2

> Mission : corriger l'agent `extractQuotes` qui produit 79% de timestamps L2 erronés sur le pack pilote, débloquer l'envoi pilote 17/05
> Branche : `fix/extractquotes-timestamps` depuis master `b403961`
> Précédent : Phase 7b en pause (bug `extractQuotes` détecté en test e2e du 27/04)

## CONTEXTE PHASE 8

L'audit timestamps mené le 27/04 (script `scripts/audit-timestamps.js`) a révélé un problème structurel sur l'agent `extractQuotes` du pipeline Phase 6 :

```
| Couche      | Total | OK | KO | Taux  |
|-------------|-------|----|----|-------|
| L1 moments  | 19    | 19 | 0  | 100%  |
| L2 quotes   | 19    | 4  | 15 | 21%   |
```

Les 4 épisodes pilote sont touchés :
- Plais GDIY #266 : 1/5 quotes OK
- Boissenot LM #174 : 1/5 OK
- Doolaeghe LP #128 : 0/5 OK
- Veyrat Finscale #107 : 2/5 OK

**3 catégories d'erreurs identifiées** :
- **TS_FAUX (11 cas)** : verbatim correct, mais timestamp décalé de 7-40 min (la quote existe dans le transcript mais à un autre endroit)
- **HORS_BORNE (3 cas)** : timestamp > durée totale épisode (ex: Veyrat 38:30 alors que l'épisode fait 31:36)
- **TEXTE_INTROUVABLE (1 cas)** : verbatim non trouvable dans transcript (Boissenot quote #5 Harry Potter — possible reformulation Sonnet ou hallucination)

**Implication pilote** : le pack actuel n'est PAS envoyable à Stefani. Si Stefani vérifie 1 quote au hasard, probabilité ~80% de tomber sur un timestamp pointant vers le vide. Crédibilité produit en jeu.

L1 (key moments) est 100% OK — pipeline d'extraction directe depuis segments Whisper structurés. L2 (quotes) cassé — pipeline qui extrait verbatim du transcript brut, l'attribution timestamp est défectueuse.

## CAPS NON-NÉGOCIABLES PHASE 8

1. **Cap qualité** : objectif L2 ≥ 95% timestamps OK après fix (vs 21% actuel). Cible = 100% sur les 4 épisodes pilote.

2. **Cap budget Phase 8** :
   - Sonnet régénération 4 épisodes × 5 quotes : ~$2 max
   - Opus rewrite éventuel : ~$0.50 max
   - **Total Phase 8 : ~$3 max**
   - **Total session cumulé après Phase 8 : ~$10 / $17.50**

3. **Cap discipline anti-régression** : 638/638 tests baseline préservés + nouveaux tests Phase 8.

4. **Cap timing** : 1 jour wall max (~5-6h dev cumulés).

5. **Cap fail-safe** : branche `fix/extractquotes-timestamps`, master jamais touché tant que PASS confirmé.

6. **Cap honnêteté** : si la cause racine ne peut pas être identifiée proprement à l'Étape 8.1, signaler et stopper plutôt que de patcher au feeling.

## ARCHITECTURE DU FIX

### Principe directeur — "Source de vérité timestampée"

Le transcript Whisper est segmenté avec des timestamps précis par segment. **Ces timestamps sont la seule source fiable**. Tout timestamp produit par Sonnet (LLM) est suspect par construction.

**Avant Phase 8** (pipeline actuel défectueux) :
```
Sonnet voit transcript → produit { quote: "...", timestamp: "38:30" }
                                                  ^^^^^^^
                                          souvent halluciné
```

**Après Phase 8** (architecture cible) :
```
Sonnet voit transcript segmenté → produit { quote: "...", segmentId: "seg_125" }
                                                          ^^^^^^^^^^
                                                       indexé fiable
                                                          ↓
                                     Pipeline résout segmentId → timestamp Whisper réel
                                                          ↓
                                          Validation : verbatim trouvable dans le segment ?
                                                          ↓
                                            Si OK : quote validée
                                            Si KO : reject + chercher autre quote
```

### Décision architecturale 1 — Output extractQuotes

L'agent retourne `{verbatim, segmentId}` au lieu de `{verbatim, timestamp}`.

Le segmentId est l'identifiant du segment Whisper d'où provient la quote. Le timestamp final est dérivé du segmentId par lookup, pas généré par Sonnet.

### Décision architecturale 2 — Validation post-extraction

Pour chaque quote retournée, vérifier que le verbatim est bien présent dans la fenêtre du segment annoncé (±10 secondes pour absorber les chevauchements segments).

Si verbatim non trouvable → reject la quote, demander à Sonnet d'en proposer une autre OU passer aux quotes suivantes du pool.

### Décision architecturale 3 — Fallback < 5 quotes

Si après validation on obtient moins de 5 quotes valides, **ne PAS forcer** Sonnet à halluciner pour combler. Livrer 3 ou 4 quotes valides plutôt que 5 dont 2 sont fausses.

C'est cohérent avec la posture Polish d'avant : mieux vaut 4 quotes solides que 5 dont une foire.

### Décision architecturale 4 — Pas de cherry-pick depuis feat/video-pipeline

Phase 8 est INDÉPENDANTE de Phase 7b. Ne pas cherry-pick le code vidéo. La branche `fix/extractquotes-timestamps` part de master `b403961` direct.

Phase 7b reprendra plus tard, après merge Phase 8.

## ORDRE D'EXÉCUTION PHASE 8

### Étape 8.1 — Diagnostic agent extractQuotes (1-2h)

**Objectif** : comprendre exactement comment l'agent actuel attribue les timestamps avant de fixer.

**Actions** :

1. Vérifications préalables :
```bash
pwd
git branch --show-current  # devrait être master
git status  # clean
git log -1 --oneline  # b403961
npm test  # 638/638 attendus

git checkout -b fix/extractquotes-timestamps
git status
```

2. Lire et documenter le code actuel :
   - Localiser l'agent `extractQuotes` (probablement `engine/agents/extractQuotesAgent.ts` ou similaire)
   - Lire intégralement le code, le prompt, le format de sortie
   - Lire les tests existants de cet agent
   - Documenter le flow actuel : input transcript → format envoyé à Sonnet → format de sortie attendu → parsing

3. Analyser un cas réel de bug :
   - Prendre Veyrat L2#3 (timestamp 38:30, hors borne car épisode 31:36)
   - Lire le transcript Veyrat (sandbox)
   - Trouver où la quote existe RÉELLEMENT dans le transcript (texte verbatim)
   - Comparer : quel timestamp a été assigné vs quel timestamp aurait dû être
   - Identifier le mécanisme défectueux

4. Hypothèses à confirmer/infirmer (lister celles qui matchent ce que tu vois) :
   - **H1** : Sonnet hallucine purement les timestamps (n'utilise pas les segments Whisper)
   - **H2** : Sonnet voit des segments mais perd la traçabilité (mismatch index)
   - **H3** : Le découpage en chunks pour les longs transcripts perd les indices
   - **H4** : Le prompt demande explicitement un timestamp formaté (HH:MM:SS) que Sonnet calcule au feeling
   - **H5** : Autre hypothèse

5. Identifier le format de transcript actuel :
   - Whisper retourne quoi exactement ? (segments avec id ? timestamps start/end ?)
   - Comment ces données arrivent à Sonnet aujourd'hui ?
   - Quelles infos sont perdues entre Whisper et le prompt ?

**STOP intermédiaire 1 attendu** :

```markdown
🛑 PHASE 8 — STOP INTERMÉDIAIRE 1 (Diagnostic 8.1)

## Code actuel
- Fichier : engine/agents/[nom].ts
- Format input : [structure]
- Format prompt : [résumé]
- Format output Sonnet : [structure]

## Cause racine confirmée
[Hypothèse validée + preuves]

## Cas Veyrat L2#3 décortiqué
- Timestamp annoncé : 38:30
- Timestamp réel verbatim : XX:XX (s'il existe)
- Mécanisme défectueux : [explication]

## Architecture du fix proposé
[Schéma : nouveau format input/output, validation post-extract]

## Risques identifiés
[Régression possible, edge cases]

## Recommandation pour Étape 8.2
[Plan d'attaque détaillé]

ATTENTE Jérémy pour GO Étape 8.2.
```

### Étape 8.2 — Implémentation fix avec validation forte (2-3h)

**Objectif** : modifier extractQuotes pour produire des timestamps fiables.

**Actions** :

1. Modifier le format de sortie de l'agent :
   - Output : `{verbatim: string, segmentId: string, segmentTimestamp: number}`
   - Le segmentId est imposé par les données Whisper (pas inventé par Sonnet)

2. Modifier le prompt pour forcer Sonnet à :
   - Référencer un segmentId existant dans le transcript fourni
   - Ne PAS calculer/halluciner de timestamp
   - Retourner verbatim STRICT (pas de paraphrase)

3. Implémenter la validation post-extraction :
   ```typescript
   function validateQuote(quote, transcriptSegments) {
     const segment = transcriptSegments.find(s => s.id === quote.segmentId);
     if (!segment) return { valid: false, reason: 'segmentId not found' };
     
     // Fenêtre ±10s autour du segment annoncé
     const windowSegments = getSegmentsInWindow(transcriptSegments, segment, 10);
     const concatText = windowSegments.map(s => s.text).join(' ');
     
     // Le verbatim doit être trouvable dans cette fenêtre
     if (!normalize(concatText).includes(normalize(quote.verbatim))) {
       return { valid: false, reason: 'verbatim not found in segment window' };
     }
     
     return { valid: true, timestamp: segment.start };
   }
   ```

4. Implémenter le retry/fallback :
   - Si une quote est rejetée → demander à Sonnet d'en proposer une autre (max 2 retries)
   - Si après retries < 5 quotes valides → livrer le pool valide (3, 4 ou 5)
   - Logger un warning par quote rejetée

5. Tests unitaires (8-10 nouveaux tests) :
   - Test 1 : quote avec segmentId valide + verbatim dans fenêtre → valide
   - Test 2 : quote avec segmentId inexistant → reject
   - Test 3 : quote avec verbatim non trouvable dans fenêtre → reject
   - Test 4 : 5 quotes générées toutes valides → output 5 quotes
   - Test 5 : 5 quotes générées dont 2 rejetées → retry → output ≤ 5
   - Test 6 : Échec retry → output 3 quotes valides + warnings
   - Test 7 : Mock Sonnet qui hallucine timestamp (cas Phase 6 actuel) → reject systémique
   - Test 8 : Edge case quote en début/fin de transcript (segment border)
   - Test 9-10 : Tests d'intégration end-to-end

6. Vérifier régression : `npm test` → baseline préservée (638 + N nouveaux verts).

**STOP intermédiaire 2 attendu** :

```markdown
🛑 PHASE 8 — STOP INTERMÉDIAIRE 2 (Fix 8.2)

## Modifications code
- Fichier modifié : engine/agents/[nom].ts
- Lignes : +N -M
- Nouveaux fichiers : [liste si applicable]
- Tests ajoutés : N

## Architecture livrée
- Format output : {verbatim, segmentId, segmentTimestamp}
- Validation post-extract : ±10s window check
- Retry logic : max 2 retries par quote rejetée
- Fallback : <5 quotes acceptable si verbatim strict

## Tests
- Total : 638 + N verts
- Régression : 0
- Couverture cas critiques : oui/non + détails

## Cap budget Phase 8.2
- Sonnet : $0 (pas encore appelé en prod, juste tests)
- Opus : $0
- Cumul Phase 8 : $0 / $3

## Recommandation 8.3
[GO régénération 4 épisodes / blocker / autre]

ATTENTE Jérémy pour GO Étape 8.3.
```

### Étape 8.3 — Régénération L2 sur 4 épisodes pilote (1-2h)

**Objectif** : régénérer les quotes des 4 épisodes pilote avec le nouveau pipeline et atteindre L2 ≥ 95% OK.

**Actions** :

1. Identifier le script ou la procédure de régénération L2 ciblée :
   - Probablement un script comme `scripts/regenerate-l2.ts` ou via la CLI Sillon
   - Doit pouvoir cibler un épisode spécifique sans régénérer tout le pack

2. Régénérer L2 pour chaque épisode pilote (ordre de durée croissante) :
   - Veyrat Finscale #107 (31 min) — le plus court, premier test
   - Boissenot LM #174 (67 min)
   - Doolaeghe LP #128 (76 min)
   - Plais GDIY #266 (188 min) — le plus long, dernier

3. Logger pour chaque épisode :
   - Nombre de quotes proposées par Sonnet
   - Nombre rejetées (avec raison)
   - Nombre de retries
   - Nombre final livré
   - Coût LLM par épisode

4. Re-run `scripts/audit-timestamps.js` après chaque épisode :
   - Cap intermédiaire : ≥ 4/5 OK par épisode (80%)
   - Cap final : ≥ 19/20 OK total (95%)
   - Idéal : 20/20 (100%)

5. Si un épisode atteint < 4/5 OK :
   - STOP, ne pas continuer aux autres épisodes
   - Diagnostic du problème
   - Possibilité de retour à 8.2 pour ajustement

**Cap budget cette étape** : ~$2 Sonnet + ~$0.50 Opus si rewrite nécessaire = $2.50 max.

**STOP intermédiaire 3 attendu** :

```markdown
🛑 PHASE 8 — STOP INTERMÉDIAIRE 3 (Régénération 8.3)

## Résultats audit timestamps L2 post-fix

| Épisode | Avant | Après | Délta | Coût LLM |
|---|---|---|---|---|
| Veyrat | 2/5 (40%) | X/5 | +X | $X.XX |
| Boissenot | 1/5 (20%) | X/5 | +X | $X.XX |
| Doolaeghe | 0/5 (0%) | X/5 | +X | $X.XX |
| Plais | 1/5 (20%) | X/5 | +X | $X.XX |
| TOTAL L2 | 4/19 (21%) | X/19 | +X | $X.XX |

## Quotes rejetées (warnings)
[Liste avec raison]

## Cas non résolus (si < 100%)
[Détail + hypothèses]

## Cap budget
- Phase 8.3 : $X.XX / $2.50
- Cumul Phase 8 : $X.XX / $3.00

ATTENTE Jérémy pour validation visuelle + GO Étape 8.4.
```

### Étape 8.4 — Re-validation pack pilote V3 + décision merge (30-45 min)

**Objectif** : régénérer les xlsx L2 des 4 épisodes, valider visuellement, décider du merge.

**Actions** :

1. Régénérer les xlsx L2 des 4 épisodes pilote avec les nouvelles quotes :
   - Utiliser la pipeline Phase 7a `produceClientPack` ou un script ciblé
   - Output dans une nouvelle sandbox : `experiments/.../pack-pilote-stefani-orso-v3-l2-fix/`

2. Validation visuelle attendue de Jérémy (manuelle) :
   - Ouvrir les 4 xlsx L2 régénérés
   - Vérifier : 4-5 quotes par épisode, timestamps cohérents (< durée épisode)
   - Spot-check : pour 2 quotes au hasard sur 2 épisodes différents, vérifier que le timestamp pointe bien sur le verbatim dans le transcript

3. Mise à jour `docs/DETTE.md` :
   - Marquer la section "Phase 7b audit timestamps L2" comme RESOLVED
   - Ajouter note : "Résolu Phase 8 commit [SHA] — extractQuotes refactoré avec validation post-extract"
   - Ajouter le re-audit final (chiffres avant/après)

4. Décision merge :
   - Si validation visuelle PASS : `git checkout master && git merge fix/extractquotes-timestamps --no-ff`
   - Si validation PARTIAL : décider scope dégradé ou re-fix
   - Si FAIL : rollback, retour Étape 8.2

5. Push master + cleanup branche :
   - `git push origin master`
   - `git branch -d fix/extractquotes-timestamps`

**STOP final attendu** :

```markdown
🛑 PHASE 8 — STOP FINAL — verdict : READY / PARTIAL / FAIL

## Verdict global
L2 timestamps integrity : N/19 OK (X%)

## Résultats par épisode
[Tableau final]

## Pack pilote V3-L2-fix
- Localisation : experiments/.../pack-pilote-stefani-orso-v3-l2-fix/
- Validation visuelle Jérémy : à faire
- Spot-check 2 quotes : ✅/❌

## Mise à jour docs/DETTE.md
- Section P0 timestamps L2 marquée RESOLVED : ✅
- Détails ajoutés (avant/après, commit) : ✅

## Décision merge
- Verdict : GO / HOLD / FAIL
- Si GO : SHA merge master + push OK
- Branche cleanup : oui/non

## Cumul Phase 8
- Sonnet : $X.XX
- Opus : $X.XX
- Total Phase 8 : $X.XX / $3.00
- Cumul session : $X.XX / $17.50

## Tests finaux
- N/N verts (638 baseline + N nouveaux Phase 8)
- 0 régression

## Implications projet
- Pack pilote envoyable : OUI / NON
- Phase 7b vidéo peut reprendre : OUI / NON
- Phase 7b plan post-Phase 8 : [résumé]

## Recommandation Jérémy
[Synthèse + prochaine mission proposée]
```

## DISCIPLINE TRANSVERSALE PHASE 8

- **Branche `fix/extractquotes-timestamps` exclusivement**, master jamais touché tant que PASS confirmé
- **Pas de touch à feat/video-pipeline** (Phase 7b reste en pause)
- **Pas de touch au Polish hub UI** (chantier séparé, pas Phase 8)
- **Pas d'auto-merge** sur master sans validation Jérémy
- **STOP intermédiaires obligatoires** entre chaque étape
- **Cap honnêteté** : si l'Étape 8.1 ne révèle pas de cause racine claire, ne pas patcher au feeling — STOP avec rapport diagnostic et attendre décision

## PROCÉDURE EN CAS D'ÉCHEC

Cas typiques de blocker :

1. **Diagnostic Étape 8.1 ambigu** (cause racine pas identifiée) : STOP avec hypothèses + demander accès données complémentaires (transcripts bruts ?)

2. **Régénération L2 ne résout pas le problème** : STOP, retour Étape 8.2 pour fix architectural complémentaire

3. **Sonnet ne respecte pas le format segmentId malgré prompt strict** : option = ajout couche de validation supplémentaire OU passage à Opus pour extraction (plus cher mais plus fiable)

4. **Edge case Whisper pas de segments fins** : si certains transcripts n'ont pas de segments suffisamment granulaires, fallback timestamp = début du segment plutôt que verbatim exact

## FALLBACK EXPLICITE

Si Phase 8 échoue ou prend > 2 jours :

- Master `b403961` reste l'état stable
- Le pack pilote actuel V2 (Phase 7a, formats pro mais timestamps L2 cassés) **n'est pas envoyable en l'état**
- Option de repli : envoyer le pack avec **L2 quotes retirées** (uniquement L1 + L3 + L4 + L5)
- Cela dégrade la valeur démo mais préserve la crédibilité produit (mieux que des timestamps faux)
- Décision repli à prendre uniquement si Phase 8 vraiment impossible à terminer

## NOTE CONTEXTE — POURQUOI L1 EST OK ET L2 EST CASSÉ

Pour info technique pendant le diagnostic :

- **L1 (key moments)** : pipeline qui prend le transcript segmenté, demande à Sonnet de retourner des `{startTime, endTime, text}` avec startTime/endTime issus directement des segments Whisper. Format de prompt qui maintient la traçabilité segment → timestamp. **Sonnet ne calcule pas, il sélectionne.**

- **L2 (quotes)** : pipeline actuel qui prend le transcript brut (peut-être concatené ?), demande à Sonnet de retourner des `{quote, timestamp}` avec timestamp formaté HH:MM:SS. **Sonnet calcule un timestamp** au lieu de sélectionner un index. C'est probablement la cause racine.

Cette intuition à valider à l'Étape 8.1 par lecture du code réel.

GO Étape 8.1 → STOP 1 → Étape 8.2 → STOP 2 → Étape 8.3 → STOP 3 → Étape 8.4 → STOP final.
