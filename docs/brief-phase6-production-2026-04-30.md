# Brief Claude Code — Phase 6 : production E2E sur 4 épisodes pilote

> Mission : produire les livrables Pack 2 (L1+L2+L3+L4+L5) sur les 4 épisodes pilote Stefani-Orso
> Précédent : V5 PASS 3/3 confirmé en lecture critique Jérémy + vérification anti-hallucination clean
> Pré-requis : 3 micro-fixes opportunistes avant le run

## CONTEXTE PHASE 6

V5 a livré une architecture saine (Sonnet génération + Sonnet validation + Opus 4.7 rewrite si < 7.5 + fail-safe dégradé). Tests V5 confirmés sur Plais avec 3/3 livrables ≥ cap 7.5/10. Vérification anti-hallucination V5 = clean (0 épisode/client halluciné).

Phase 6 = scale-out du pipeline V5 sur les 3 autres épisodes pilote, avec 3 micro-fixes opportunistes pour éviter de propager des problèmes mineurs identifiés.

## LES 4 ÉPISODES PILOTE

| # | Podcast | Episode | Invité | Lens cible |
|---|---|---|---|---|
| 1 | GDIY | #266 | Frédéric Plais (Platform.sh) | ovni-vc-deeptech |
| 2 | La Martingale | #174 | Alexandre Boissenot (cartes Pokémon) | alternative-investments |
| 3 | Le Panier | #128 | Nooz Optics (lunettes DTC) | dtc-acquisition-tactical |
| 4 | Finscale | #107 | Jules Veyrat (Stoïk, cyber-insurance) | b2b-insurance-tech |

**Plais V5 livrables existent déjà** dans `experiments/autonomy-session-2026-04-28/phase5-plais-v5/` — à conserver comme référence.

**Phase 6 produit les 3 autres épisodes** : Boissenot, Nooz Optics, Veyrat.

## CAPS NON-NÉGOCIABLES PHASE 6

1. **Cap qualité par livrable** :
   - L1, L2 : 7+/10 (commodities)
   - L3, L4, L5 : 7.5+/10 (pivots)

2. **Cap discipline anti-régression** : 568/568 tests verts maintenus (+ tests micro-fixes).

3. **Cap budget Phase 6 total** : $7.00 maximum
   - Sonnet : ~$1.20
   - Opus rewrite : ~$5.20
   - Marge : ~$0.60

4. **Cap honnêteté du verdict** : aucun polissage cosmétique. Si certains livrables sur certains épisodes ne PASS pas, signale-le clairement avec hypothèses.

5. **Cap fail-safe** : architecture V5 conservée. Si Opus rewrite échoue 2x sur un livrable, bascule format dégradé.

## 3 MICRO-FIXES PRÉ-RUN PHASE 6

### Micro-fix 1 — F-V5-2 (cross-refs non nommées dans L4)

**Problème** : V5 newsletter Plais généralisait les cross-refs ("D'autres fondateurs passés sur GDIY et dans le catalogue Orso ont mené le même combat") au lieu de nommer Mazzella/Leibovici comme dans l'oracle Jérémy.

**Solution** : ajouter dans le prompt Opus rewrite L4 (newsletter) une consigne explicite :

```
CONTRAINTE NAMING CROSS-REFS (impérative) :
Quand tu intègres les cross-références du catalogue Orso dans la newsletter, 
tu DOIS nommer chaque cross-ref par son invité + sa boîte dans le flux du 
texte. Format type : "Pierre-Eric Leibovici (Daphni)", "Frédéric Mazzella 
(BlaBlaCar)", "Firmin Zocchetto (PayFit)".

Tu NE DOIS PAS généraliser avec des formules comme "d'autres fondateurs", 
"des invités précédents", ou "le catalogue Orso a creusé". Si la cross-ref 
mérite d'être citée, elle est nommée. Sinon elle ne figure pas.

Exception : tu peux mentionner "l'écosystème Orso" ou "la team GDIY et Orso 
Media" comme référence générale en plus du naming explicite des cross-refs.
```

**Fichier modifié** : `engine/agents/prompts/opus-rewrite-prompt-template.md`
**Cap durée** : 5 min

### Micro-fix 2 — F-V5-3 (parse-error Sonnet validateur 15%)

**Problème** : Sonnet validateur retourne parfois du JSON malformé (15% des appels). Opus rattrape, mais gaspille un budget.

**Solution** : robustifier le parser avec retry-on-fail.

```typescript
async function validateLivrableQualityRobust(
  livrable: string,
  livrableType: 'newsletter' | 'brief-annexe' | 'cross-refs',
  context: ValidationContext,
  maxRetries: number = 1
): Promise<QualityValidationResult> {
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      const result = await validateLivrableQuality(livrable, livrableType, context);
      return result;
    } catch (parseError) {
      if (attempt === maxRetries) throw parseError;
      
      // Retry avec consigne JSON renforcée
      console.warn(`[Validator] Parse error attempt ${attempt + 1}, retrying with strict JSON prompt`);
      attempt++;
      
      // Le 2e appel utilise un prompt plus strict
      // (déjà géré côté qualityValidator si on passe un flag strictJsonMode)
    }
  }
  throw new Error('Unreachable');
}
```

**Important** : le retry doit injecter dans le prompt validateur une consigne renforcée :
```
RÉPONSE OBLIGATOIRE : JSON strict valide, sans markdown, sans backticks, 
sans préambule. Aucune ligne avant l'accolade ouvrante. Aucune ligne après 
l'accolade fermante. Le résultat doit pouvoir passer JSON.parse() sans 
erreur.
```

**Fichier modifié** : `engine/agents/qualityValidator.ts`
**Tests à ajouter** : 2 (succès au 1er essai, succès au 2e essai après retry)
**Cap durée** : 10 min

### Micro-fix 3 — Déduplication L3 (doublons Zocchetto/Huguet)

**Problème** : V5 L3 cross-refs Plais avait 2 sections (lens A + lens B), et certains invités (Zocchetto, Huguet) apparaissaient dans LES 2 sections avec rationales différents. Stefani-pas-Stefani, c'est de la duplication qui dégrade l'expérience lecteur.

**Solution** : déduplication par `episode_id` au niveau composition L3.

Logique :
- Boucler sur les sections lens dans l'ordre (lens spécifique > editorial-base)
- Pour chaque section, lister les cross-refs candidates (top 5 par lens)
- Maintenir un Set `alreadySelected` des `episode_id` déjà retenus
- Si une cross-ref candidate est dans `alreadySelected` → skip (passer à la suivante de la liste)
- Si la section a moins de 3 cross-refs après dédup → afficher seulement ce qu'il y a (ne pas re-piocher dans les autres lens)

**Fichier modifié** : composition L3 dans le pipeline (probablement `engine/agents/lensSectionGate.ts` ou equivalent)
**Tests à ajouter** : 2 (cas avec doublon → dédup, cas sans doublon → préservé)
**Cap durée** : 10 min

### Tests cumulés post-micro-fixes

```bash
npm test
# Attendu : 568 + 4 nouveaux tests = 572/572 verts
# Aucune régression
```

## ORDRE D'EXÉCUTION PHASE 6

### Étape 1 — Vérifications préalables (5 min)

```bash
pwd
git branch --show-current  # master
git status  # peut être non-clean si V5 commit pas encore fait

# Si V5 working tree non commité, commit d'abord (voir séquence commit V5 plus bas)

git log -1 --oneline
npm test  # 568/568 attendus

# Vérifier transcripts disponibles
ls experiments/autonomy-session-2026-04-28/transcripts/
# 4 fichiers attendus : Plais (déjà fait), Boissenot, Nooz, Veyrat
```

### Étape 1bis — Commit V5 si nécessaire (10 min)

Si working tree V5 non commité, commit d'abord :

```bash
git add engine/config/models.ts \
        engine/agents/loadStyleCorpus.ts \
        engine/agents/qualityValidator.ts \
        engine/agents/opusRewrite.ts \
        engine/agents/prompts/opus-rewrite-prompt-template.md \
        engine/agents/__tests__/

git commit -m "feat(phase5-v5): integrate Opus 4.7 on rewrites + fix F-V4-1

V5 verdict: PASS 3/3 livrables ≥ 7.5/10 on Plais
- L3 cross-refs: 8.2/10 (Opus rewrite #1 or #2)
- L4 newsletter: 8.1/10 (Opus rewrite #1)
- L5 brief annexe: 8.2/10 (Opus rewrite #1)

Architecture:
- Generation: Sonnet 4.6
- Validation: Sonnet 4.6 (oracle stable)
- Rewrite (if score < 7.5): Opus 4.7 (max 2 attempts per livrable)
- Fallback: Option B-degraded format (not triggered on Plais)

Fix F-V4-1: stripFrontMatter on Stefani corpus before injection
prevents prompt-leak of metadata > Date :, > URL :, etc.

Tests: 568/568 verts (+20 V5)
Budget V5: \$1.72 / \$2.50 (69%)
0 fail-safe degradation triggered.

Anti-hallucination check passed: 4 cross-ref episodes verified in DB,
3 clients (L'Oreal, Danone, Commission europeenne) verified in 
transcript Plais.

Findings open (mineurs):
- F-V5-1: detectEcosystemMention too strict (alternatives to widen)
- F-V5-2: L4 newsletter generalizes cross-refs (will fix in Phase 6)
- F-V5-3: Sonnet validator parse-error ~15% (will add retry in Phase 6)
- F-V5-4: temperature deprecated for Opus 4.7 (already fixed)"

git push origin master
```

### Étape 2 — Application des 3 micro-fixes (30 min)

Ordre :
1. Micro-fix 2 (parse-error retry) — 10 min
2. Micro-fix 3 (déduplication L3) — 10 min
3. Micro-fix 1 (naming cross-refs L4) — 5 min
4. Tests cumulés `npm test` — 5 min (572/572 verts attendus)

Commit après les 3 micro-fixes :

```bash
git add engine/agents/qualityValidator.ts \
        engine/agents/lensSectionGate.ts \
        engine/agents/prompts/opus-rewrite-prompt-template.md \
        engine/agents/__tests__/

git commit -m "fix(phase6): 3 micro-fixes for cleanup before E2E run

Phase 6 prep: address V5 minor findings before producing 4 episodes.

- Micro-fix 1 (F-V5-2): L4 newsletter prompt now requires explicit 
  naming of cross-refs (guest + company), no more 'd'autres fondateurs'.

- Micro-fix 2 (F-V5-3): Sonnet validator now retries 1x with strict 
  JSON prompt on parse error. Reduces budget waste (~15% of calls).

- Micro-fix 3 (composition L3): deduplicate cross-refs by episode_id 
  across lens sections to avoid same guest appearing in multiple 
  sections of L3.

Tests: 572/572 verts (+4 new)"

git push origin master
```

### Étape 3 — Run E2E sur Boissenot (LM #174) (30 min)

Créer le script `experiments/autonomy-session-2026-04-28/phase6-boissenot.ts` (réutiliser la base phase5-plais-v5.ts en changeant l'épisode source).

Run pipeline complet :
1. Charger transcript Boissenot
2. lensClassificationAgent (V4 PASS, déjà validé) → matches sur lens alternative-investments
3. crossReferenceEpisode → top 5 candidates par lens
4. lensSectionGate → vérifie 3 mentions + 5 candidates par lens
5. Génération L1 + L2 (Sonnet, pas de validateur sur commodities)
6. Génération L3 (Sonnet → validation → Opus rewrite si < 7.5)
7. Génération L4 (Sonnet → validation → Opus rewrite si < 7.5)
8. Génération L5 (Sonnet → validation → Opus rewrite si < 7.5)
9. Stocker outputs dans `experiments/autonomy-session-2026-04-28/phase6-boissenot/`
10. Logger pour chaque livrable : modèle final, score, coût

Cap budget Boissenot : $1.50 max.

### Étape 4 — Run E2E sur Nooz Optics (LP #128) (30 min)

Identique Étape 3, sur Nooz Optics. Lens cible dtc-acquisition-tactical.

**Attention** : Nooz Optics avait une dette data identifiée (transcript Whisper attendu mais à confirmer disponible dans `experiments/autonomy-session-2026-04-28/transcripts/`).

Si transcript Nooz NON DISPONIBLE → STOP et signaler à Jérémy avant de continuer.

Cap budget Nooz : $1.50 max.

### Étape 5 — Run E2E sur Veyrat (Finscale #107) (30 min)

Identique Étape 3, sur Veyrat. Lens cible b2b-insurance-tech.

**Rappel V4** : threshold b2b-insurance-tech à 0.5 (recalibration V4). Veyrat doit retourner 5+ matches concentrés sur ce lens.

Cap budget Veyrat : $1.50 max.

### Étape 6 — Compilation pack pilote complet (15 min)

Créer le dossier final consolidé :

```
experiments/autonomy-session-2026-04-28/pack-pilote-stefani-orso/
├── README.md  # vue d'ensemble du pack
├── plais-platform-sh/
│   ├── 01-key-moments.md
│   ├── 02-quotes.md
│   ├── 03-cross-refs-by-lens.md
│   ├── 04-newsletter.md
│   └── 05-brief-annexe.md
├── boissenot-pokemon/
│   ├── 01-key-moments.md
│   ├── ...
├── nooz-optics/
│   └── ...
└── veyrat-stoik/
    └── ...
```

**README.md** doit contenir :
- Vue d'ensemble (4 épisodes, 5 livrables chacun = 20 livrables)
- Tableau matrice scores par épisode × livrable
- Modèle utilisé par livrable (Sonnet vs Opus rewrite vs dégradé)
- Coût total Phase 6
- Notes sur anti-hallucination check (cf. V5)

### Étape 7 — STOP Phase 6 (15 min)

Format STOP Phase 6 :

```markdown
# STOP Phase 6 — verdict : PASS / PARTIEL / FAIL

## Verdict global
N/12 livrables pivot (L3+L4+L5 × 4 épisodes) ≥ cap 7.5/10
N/8 livrables commodity (L1+L2 × 4 épisodes) ≥ cap 7/10

## Matrice complète

| Épisode | L1 KM | L2 Q | L3 CR | L4 NL | L5 BA |
|---|---|---|---|---|---|
| Plais (référence V5) | 5 | 4 | 8.2 | 8.1 | 8.2 |
| Boissenot (LM #174) | N | N | N | N | N |
| Nooz Optics (LP #128) | N | N | N | N | N |
| Veyrat (Finscale #107) | N | N | N | N | N |

## Modèle final utilisé par livrable

| Épisode | L3 | L4 | L5 |
|---|---|---|---|
| Boissenot | Sonnet/Opus#1/Opus#2/dégradé | ... | ... |
| Nooz | ... | ... | ... |
| Veyrat | ... | ... | ... |

## Bascules fail-safe déclenchées
- Liste des bascules dégradées par épisode + livrable + raison

## Findings nouveaux Phase 6 (si applicable)

## Vérification anti-hallucination par épisode (à reproduire pattern V5)
- Cross-refs nommés dans L3/L4/L5 : tous existent en BDD ? oui/non par épisode
- Chiffres mentionnés : tous dans le transcript source ? oui/non par épisode

## Cumul session
- Sonnet Phase 6 : $X.XX
- Opus Phase 6 : $X.XX
- Total Phase 6 : $X.XX / $7.00
- Total session cumulé : $X.XX / $17.50

## État repo
- Tests : N/M verts
- Régression : aucune ou liste
- Working tree : clean ou détail
- Master : [SHA]

## Pack pilote stocké
- experiments/autonomy-session-2026-04-28/pack-pilote-stefani-orso/
- Contenu : 4 épisodes × 5 livrables = 20 fichiers .md + README.md

## Recommandation pour Jérémy

Selon verdict :

- **Si Phase 6 PASS franchement (≥10/12 pivots + ≥6/8 commodities)** : 
  "Pack pilote prêt pour passe de polish finale + envoi 20/05."

- **Si Phase 6 PARTIEL** : 
  "Lesquels passent, lesquels non, hypothèses (épisode-spécifique ? 
  livrable-spécifique ? généralisable ?). Options : itérer V6 sur les 
  livrables qui résistent, ou accepter dégradation pour ces livrables."

- **Si Phase 6 FAIL** : 
  "Un effet d'échelle non anticipé (V5 PASS sur Plais, ne PASS pas sur 
  les autres). Hypothèses à diagnostiquer."

Pas d'auto-continue après Phase 6. Décision Jérémy attendue.
```

## DISCIPLINE TRANSVERSALE PHASE 6

- Pas de touch lensClassificationAgent (validé V4 jalon)
- Pas de touch lens parameters (validé V4 jalon)  
- Pas de touch loadStyleCorpus (V5 fix F-V4-1 valide)
- Le validateur Sonnet RESTE Sonnet (oracle stable)
- L1 et L2 NON améliorés en Phase 6 (passe de polish post-Phase 6 dédiée)
- Vérification anti-hallucination intégrée AU FIL des runs (pas en post-process)
- Pas d'auto-continue après Phase 6

## NOTE FINALE — POSTURE PHASE 6

Phase 6 est le test à l'échelle du pipeline V5. Si l'architecture tient sur 4 épisodes variés (tech B2B / collectibles / DTC / insurtech), c'est validé production.

Si certains livrables ne PASSent pas sur certains épisodes, signaler clairement avec hypothèses :
- Épisode-spécifique : transcript de qualité variable, lens parameters mal calibrés sur ce sujet
- Livrable-spécifique : type de contenu qui résiste à l'imitation Stefani
- Modèle-spécifique : limite Opus 4.7 sur certains domaines

Pas d'itération aveugle. STOP attente Jérémy après Phase 6 quel que soit le verdict.

GO Étape 1 → 1bis (commit V5) → 2 (3 micro-fixes) → 3 (Boissenot) → 4 (Nooz) → 5 (Veyrat) → 6 (compilation pack) → 7 (STOP).
