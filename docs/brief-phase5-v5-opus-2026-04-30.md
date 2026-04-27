# Brief Claude Code — Phase 5 V5 : intégration Opus 4.7 sur rewrites L4/L5 + fix F-V4-1

> Mission : V5 Phase 5 livrables Pack 2 sur GDIY #266 Plais  
> Précédent : V4 FAIL/PARTIEL (1/3 livrables au cap, validateur Sonnet honnête mais rewrite Sonnet stagne à 6/10)  
> Diagnostic : Sonnet 4.6 limite structurelle sur imitation persona Stefani long-format  
> Solution : intégration Opus 4.7 sur le rewrite quand validateur Sonnet score < 7.5

## CONTEXTE DE LA SESSION V5

V4 a livré 3 changes architecturaux propres (loadStyleCorpus, lensSectionGate, qualityValidator). Architecture saine. Ce n'est PAS l'architecture qu'on remet en cause en V5.

**La preuve que Opus 4.7 lève la limite Sonnet** : test manuel claude.ai effectué par Jérémy avec un prompt complet (6 newsletters Stefani few-shot + transcript Plais + livrable V4 actuel + diagnostic erreurs). Verdict Jérémy : 5/5 critères PASS, score 8.5/10. Voir l'output Opus dans la conversation.

**Les 5 critères qualité Stefani** validés sur la sortie Opus :
1. Style (phrases courtes, mots isolés, rythme) ✅
2. Ouverture (constat brutal vs descriptive) ✅
3. Diagnostic systémique vs résumé ✅
4. Cross-refs naturelles vs forcées ✅
5. Conclusion qui transcende vs question rhétorique ✅

**La sortie Opus de référence** (à conserver dans le repo comme baseline) :

```
Le vrai luxe : choisir un camp

140 millions levés. Équipe distribuée mondialement. Zéro bureau central.

Frédéric Plais, fondateur de Platform.sh. C'est mon invité GDIY cette semaine.

Et dès les premières minutes, il pose une phrase qui m'a calmé sec :

« Entre le remote et le présentiel, il n'y a pas de milieu. »

Touché.

Parce que c'est exactement là que la majorité des boîtes françaises se plantent en 2026. Le retour-au-bureau-mais-pas-trop. Le full-remote-sauf-le-mardi. Les chartes hybrides à 14 paragraphes qui essaient de ménager tout le monde, et qui ne ménagent personne.

Ce n'est pas une stratégie. C'est un compromis défensif.

Plais, lui, a choisi son camp dès le premier jour. Distributed by design. Pas une réaction au Covid, pas un avantage RH déguisé : un choix structurant. Et ce choix lui a ouvert un vivier de talents que Paris seule ne lui aurait jamais donné.

Sortir de l'aquarium, comme il dit. Confronter sa boîte à San Francisco, à Berlin, à n'importe où.

Côté financement, même logique. Pierre-Eric Leibovici, qu'on avait reçu sur Finscale pour parler Daphni, défendait déjà l'idée : le VC ne se résume plus à signer un chèque, c'est devenu une plateforme de services. Plus tu es distribué, plus tu as besoin de cette infra. Tout se tient.

Et ça nous ramène à une question plus large, qui traverse tout l'écosystème Orso : faut-il forcément viser la licorne pour avoir réussi en France ?

Plais a levé 140 millions sans jamais entrer dans le théâtre médiatique des valos. Frédéric Mazzella (BlaBlaCar, Dift), qu'on avait reçu en GDIY, dirait probablement la même chose : la visibilité et le succès sont deux disciplines différentes.

On confond les deux en permanence.

Ce que je retiens de cet épisode — et ce qu'on essaie de creuser avec la team GDIY et Orso Media — c'est ça : choisir un camp coûte sur le moment, paie sur la durée. L'hybride mou n'est pas un compromis intelligent, c'est une décision repoussée.

Une dernière chose m'a marqué chez Plais. La souveraineté des données. CLOUD Act, hébergement US, juridictions extra-européennes : ce ne sont pas des sujets de tribune. Ce sont des sujets de fondateur.

Qui contrôle tes données contrôle un bout de ta boîte.

À méditer en équipe lundi matin.
```

Cette sortie sera **stockée dans le repo comme oracle de calibration** (voir Étape 5).

## CAPS QUALITÉ NON-NÉGOCIABLES V5

1. **Cap qualité différencié** :
   - L1, L2 : 7+/10 (non touchés)
   - L3, L4, L5 : 7.5+/10 obligatoire (cap pivot)

2. **Cap discipline anti-régression** : 548/548 tests verts maintenus.

3. **Cap budget V5 total** : $2.50 maximum
   - Sonnet : ~$0.30 (génération + validation)
   - Opus rewrite : ~$1.50 (3 livrables × 0.5 max)
   - Tests + dev : ~$0.70 marge

4. **Cap honnêteté du verdict** : aucun polissage cosmétique. Si V5 ne PASS pas franchement, signale-le clairement avec hypothèses.

5. **Cap fail-safe** : si Opus rewrite échoue 2 fois consécutives sur le même livrable, **bascule automatique en Option B-dégradée pour ce livrable** (voir section "Option B-dégradée fail-safe" plus bas).

## PRÉ-REQUIS — FIX F-V4-1 BLOCKING

**Avant tout autre travail V5**, fixer F-V4-1 (prompt-leak front-matter).

### Diagnostic du finding

V4 a montré que Sonnet a recopié dans la newsletter Plais V4 :

```
> Date : 21/10/2023  
> Auteur : Matthieu Stefani  
> URL : https://matt.kessel.media/posts/pst_140m-teletravail  
> Pattern tags : anecdote-personnelle, diagnostic-systemique
```

URL inventée, date inventée, faux attribué Stefani — désastre potentiel si livré.

### Cause racine

Les 6 newsletters Stefani dans `data/style-corpus/stefani/` ont chacune un front-matter Markdown :

```
> Date : ...
> Auteur : Matthieu Stefani  
> URL : ...
> Pattern tags : ...
```

Quand `loadStyleCorpus.ts` injecte ces fichiers en few-shot dans le prompt, Sonnet voit le pattern et le reproduit, mais en hallucine les valeurs.

### Fix à appliquer

**Modifier `engine/agents/loadStyleCorpus.ts`** : ajouter une fonction `stripFrontMatter` qui retire les lignes commençant par `> ` AU DÉBUT du fichier, jusqu'à la première ligne non-`>`.

```typescript
function stripFrontMatter(content: string): string {
  const lines = content.split('\n');
  let firstContentLine = 0;
  
  // Skip leading H1 if present (titre)
  if (lines[0]?.startsWith('# ')) {
    firstContentLine = 1;
  }
  
  // Skip blank lines
  while (firstContentLine < lines.length && lines[firstContentLine].trim() === '') {
    firstContentLine++;
  }
  
  // Skip front-matter block (lines starting with '> ')
  while (firstContentLine < lines.length && lines[firstContentLine].startsWith('> ')) {
    firstContentLine++;
  }
  
  // Skip blank lines after front-matter
  while (firstContentLine < lines.length && lines[firstContentLine].trim() === '') {
    firstContentLine++;
  }
  
  return lines.slice(firstContentLine).join('\n');
}
```

Appliquer `stripFrontMatter` sur chaque newsletter avant injection.

### Tests fix F-V4-1

- Test mock : fichier avec front-matter → output sans front-matter
- Test mock : fichier sans front-matter → output identique (pas de régression)
- Test mock : fichier avec H1 + front-matter → output commence après le bloc `>`
- Test : tous les 6 fichiers Stefani actuels → strip propre, contenu Stefani préservé

Cap durée fix : 15-20 min.

## CHANGE V5 — INTÉGRATION OPUS 4.7 SUR REWRITE

### Architecture cible

```
[Génération initiale] Sonnet 4.6 → livrable v1
[Validation] Sonnet 4.6 → score s1, issues
  └─ Si s1 ≥ 7.5 → livrable accepté ✅
  └─ Si s1 < 7.5 → [Rewrite] Opus 4.7 (avec issues + corpus Stefani) → livrable v2
       [Validation] Sonnet 4.6 → score s2
         └─ Si s2 ≥ 7.5 → livrable accepté ✅
         └─ Si s2 < 7.5 → [Rewrite #2] Opus 4.7 (1 chance supplémentaire) → livrable v3
              [Validation] Sonnet 4.6 → score s3
                └─ Si s3 ≥ 7.5 → livrable accepté ✅
                └─ Si s3 < 7.5 → BASCULE Option B-dégradée pour ce livrable
```

**Maximum 2 rewrites Opus par livrable**. Au-delà, le livrable bascule en B-dégradée.

### Implémentation

**Modifier `engine/agents/qualityValidator.ts`** pour :
- Conserver génération initiale Sonnet 4.6
- Conserver validation Sonnet 4.6 (oracle qualité)
- **Remplacer** le rewrite Sonnet 4.6 actuel **par rewrite Opus 4.7**

**Modèle exact à utiliser** : `claude-opus-4-7` via API Anthropic standard.

**Prompt Opus rewrite** : doit être structuré exactement comme le prompt manuel testé. Voir section "Prompt Opus rewrite — template" plus bas.

### Prompt Opus rewrite — template

Le prompt Opus utilisé pour rewrite doit contenir, dans cet ordre :

```
1. Contexte stratégique court (3-5 lignes)
2. 6 newsletters Stefani complètes (corpus few-shot, sans front-matter grâce au fix F-V4-1)
3. Patterns Stefani à intérioriser (8 points consolidés)
4. Contraintes non-négociables (a-e)
5. Données épisode :
   - Transcript points clés (synthèse moments saillants)
   - Lens activés
   - Cross-refs sélectionnées
6. Livrable Sonnet à réécrire (le v1)
7. Diagnostic des erreurs identifiées par le validateur Sonnet
8. Mission de réécriture explicite
```

**Fichier de référence à créer** : `engine/agents/prompts/opus-rewrite-prompt-template.md`

Ce fichier contient le template paramétrable. Voir contenu complet en annexe à la fin de ce brief.

### Configuration Opus

Dans `engine/config/models.ts` (créer si n'existe pas) :

```typescript
export const MODELS = {
  generation: 'claude-sonnet-4-6',  // ou modèle actuel utilisé
  validation: 'claude-sonnet-4-6',  // oracle, doit rester stable
  rewrite_premium: 'claude-opus-4-7',
};

export const MODEL_LIMITS = {
  rewrite_premium_max_calls_per_livrable: 2,
  rewrite_premium_cap_per_livrable_usd: 0.50,
};
```

### Logique de bascule fail-safe

**Si après 2 rewrites Opus, validateur Sonnet score toujours < 7.5** :

Option B-dégradée s'applique automatiquement pour CE livrable uniquement (pas pour les autres) :

- **Si livrable = L4 (newsletter)** :
  - Format dégradé : 3 bullets de cross-refs commentées (2-3 lignes par cross-ref) + intro 2 lignes + outro 2 lignes
  - Cap qualité dégradé : 7+/10
  - Marquer le livrable avec un tag `[degraded-format-fallback]`

- **Si livrable = L5 (brief annexe)** :
  - Format dégradé : compilation directe de L3 (les cross-refs validées par lens) + intro 2 lignes + outro 2 lignes
  - Pas de tentative d'imitation Stefani long-format
  - Cap qualité dégradé : 7+/10

- **Si livrable = L3 (cross-refs)** :
  - Pas de dégradation prévue (L3 a déjà PASSé en V4 sur la section ovni-vc)
  - Si fail Opus 2x sur L3 : signaler dans STOP comme finding bloquant (devrait pas arriver)

### Tests Change V5

- Test mock : génération Sonnet → validation < 7.5 → trigger Opus rewrite
- Test mock : Opus rewrite → validation ≥ 7.5 → livrable accepté
- Test mock : Opus rewrite #1 < 7.5 → Opus rewrite #2 → validation
- Test mock : 2 rewrites Opus < 7.5 → bascule format dégradé
- Test mock : cap budget Opus respecté
- Test : prompt Opus contient les 6 newsletters Stefani sans front-matter (vérification fix F-V4-1)

## ORDRE D'EXÉCUTION V5

### Étape 1 — Vérifications préalables (5 min)

```bash
pwd
git branch --show-current  # master
git status  # clean ou commits V4 prêts
git log -1 --oneline  # doit être à dddba2a ou descendant
npm test  # 548/548 attendus

# Vérifier corpus Stefani
ls data/style-corpus/stefani/  # 6 fichiers .md

# Vérifier transcript Plais
ls experiments/autonomy-session-2026-04-28/transcripts/

# Vérifier code V4 disponible
ls engine/agents/loadStyleCorpus.ts
ls engine/agents/lensSectionGate.ts
ls engine/agents/qualityValidator.ts
```

### Étape 2 — Fix F-V4-1 prompt-leak (20 min)

1. Implémenter `stripFrontMatter` dans `engine/agents/loadStyleCorpus.ts`
2. Tests fix F-V4-1 (4 tests minimum)
3. Vérifier que les 6 newsletters Stefani strippées préservent bien le contenu (test manuel)
4. `npm test` → tous verts

Cap durée : 20 min.

### Étape 3 — Configuration Opus 4.7 (15 min)

1. Créer/modifier `engine/config/models.ts` avec les 3 modèles + limites
2. Vérifier que la clé API Anthropic actuelle a accès à Claude Opus 4.7 (le modèle s'appelle exactement `claude-opus-4-7`)
3. Test minimal : 1 appel Opus avec prompt court → vérifier la connexion + parsing réponse
4. Loguer le coût réel d'1 appel Opus (référence pour suite)

Cap budget : $0.05 max pour ce test minimal.
Cap durée : 15 min.

### Étape 4 — Création du template prompt Opus rewrite (30 min)

1. Créer `engine/agents/prompts/opus-rewrite-prompt-template.md` (voir annexe)
2. Implémenter une fonction `buildOpusRewritePrompt(livrable, validationIssues, episodeContext)` qui :
   - Charge les 6 newsletters Stefani (avec strip front-matter)
   - Compose le prompt selon le template
   - Retourne la string finale
3. Tests : prompt généré contient les 6 newsletters, contient les issues, contient le livrable

Cap durée : 30 min.

### Étape 5 — Stocker l'oracle de calibration (10 min)

Sauvegarder la sortie Opus de référence (validée par Jérémy) dans :

`experiments/autonomy-session-2026-04-28/opus-oracle-newsletter-plais.md`

Cette sortie sert de **baseline qualité**. À la fin de V5, comparer la sortie Opus produite par le pipeline avec cet oracle. Si l'écart est important (style très différent), c'est un signal que le prompt template ou les paramètres Opus ne sont pas calibrés.

Cap durée : 10 min.

### Étape 6 — Intégration Opus dans qualityValidator (45 min)

1. Modifier `engine/agents/qualityValidator.ts` :
   - Ajouter une fonction `rewriteWithOpus(livrable, issues, context)`
   - Modifier la logique de validation pour suivre le flow décrit (génération → validation → rewrite Opus si < 7.5 → max 2 rewrites)
   - Ajouter le cap budget Opus par livrable
2. Implémenter la bascule fail-safe pour formats dégradés (L4 et L5)
3. Tests :
   - Mock Sonnet retourne v1 score < 7.5
   - Mock Opus retourne v2 score ≥ 7.5 → livrable accepté
   - Mock Opus échoue 2x → bascule fail-safe
4. `npm test` → tous verts (donc 548 + nouveaux tests V5)

Cap durée : 45 min.

### Étape 7 — Re-run Phase 5 V5 sur Plais (30 min)

1. Lancer le script `experiments/autonomy-session-2026-04-28/phase5-plais-v5.ts` (créer en réutilisant la base v4)
2. Régénérer L3, L4, L5 sur Plais avec le pipeline complet :
   - Génération Sonnet
   - Validation Sonnet
   - Rewrite Opus si < 7.5
   - Bascule fail-safe si nécessaire
3. Stocker outputs dans `experiments/autonomy-session-2026-04-28/phase5-plais-v5/`
4. Logger pour chaque livrable :
   - Score validateur initial (Sonnet v1)
   - Si rewrite triggered : score validateur post-Opus
   - Modèle final utilisé (Sonnet, Opus 1, Opus 2, ou format dégradé)
   - Coût cumulé par livrable

Cap budget Étape 7 : $2.00 max.
Cap durée : 30 min.

### Étape 8 — Comparaison oracle (10 min)

Pour le livrable L4 newsletter Plais V5 :
1. Charger la sortie Opus produite par le pipeline (`phase5-plais-v5/plais-platform-sh-newsletter.md`)
2. Charger l'oracle (`opus-oracle-newsletter-plais.md`)
3. Comparer les 5 critères qualité Stefani :
   - Style (phrases courtes, mots isolés)
   - Ouverture (constat brutal)
   - Diagnostic systémique
   - Cross-refs naturelles
   - Conclusion qui transcende
4. Logger : N/5 critères correspondent à l'oracle

Note : la newsletter V5 ne sera pas IDENTIQUE à l'oracle (Opus génère différemment chaque fois). L'objectif est de vérifier que les **patterns structurels** sont préservés, pas le contenu exact.

Cap durée : 10 min.

### Étape 9 — STOP V5 (15 min)

Format STOP V5 :

```markdown
# STOP Phase 5 V5 — verdict : PASS / PARTIEL / FAIL

## Verdict global
N/3 livrables ≥ cap qualité (différencié 7.5+ pivot ou 7+ dégradé)

## Implémentation V5
- Fix F-V4-1 (prompt-leak front-matter) : ✅ ou ❌
  - Tests strip front-matter : N/4 verts
  - Régression sur corpus Stefani : aucune ou liste
- Intégration Opus 4.7 : ✅ ou ❌
  - Premier appel Opus opérationnel : oui/non
  - Coût réel par appel Opus : $X.XX
- Logique fail-safe : ✅ ou ❌
  - Bascules dégradées déclenchées sur Plais : 0 / 1 / 2 / 3

## Matrice 3 livrables V4 → V5

| Livrable | V4 | V5 | Modèle final | Cap | Verdict |
|---|---|---|---|---|---|
| L3 Cross-refs | 7.5/10 | N/10 | Sonnet/Opus/dégradé | 7.5+ | ↑↓→ |
| L4 Newsletter | 6/10 | N/10 | Sonnet/Opus/dégradé | 7.5+ | ↑↓→ |
| L5 Brief annexe | 6/10 | N/10 | Sonnet/Opus/dégradé | 7.5+ | ↑↓→ |

## Comparaison oracle (livrable L4 newsletter)
- Critères structurels Stefani correspondants : N/5
- Notable similitude / divergence : ...

## Détail des appels par livrable

### L3 Cross-refs
- Sonnet génération : score validateur N
- Rewrite Opus #1 : score validateur N (si applicable)
- Rewrite Opus #2 : score validateur N (si applicable)
- Modèle final : ...
- Coût cumulé : $X.XX

### L4 Newsletter
[idem]

### L5 Brief annexe
[idem]

## Findings nouveaux V5 (si applicable)
[liste avec sévérité]

## Cumul session
- Sonnet V5 : $X.XX
- Opus V5 : $X.XX
- Total V5 : $X.XX / $2.50
- Total session : $X.XX / $17.50

## État repo
- Tests : N/M verts (delta : +X)
- Régression : aucune ou liste
- Working tree : clean
- Master : [SHA]

## Recommandation pour Jérémy

Selon verdict :

- **Si V5 PASS 3/3 ≥ cap** : "V5 PASS, prêt pour Phase 6 sur 4 épisodes (attendre GO Jérémy)"
- **Si V5 PARTIEL** : "lesquels passent, lesquels résistent, hypothèses, options pour V6 ou bascule scope"
- **Si V5 FAIL** : "Opus n'a pas reproduit le test manuel. Hypothèses : prompt template insuffisant / paramètres modèle / autre. Options pour discussion."

Pas d'auto-continue Phase 6.
```

## DISCIPLINE TRANSVERSALE V5

- Pas de touch lensClassificationAgent (validé V4 jalon)
- Pas de touch lens parameters (validé V4 jalon)
- Pas de touch L1 (Key moments) ni L2 (Quotes)
- Pas de touch loadStyleCorpus SAUF pour fix F-V4-1
- Pas de touch lensSectionGate (Change 2 V4 marche bien)
- Le validateur Sonnet RESTE Sonnet (oracle stable)
- Pas d'auto-continue Phase 6 même si V5 PASS

## ANNEXE — TEMPLATE PROMPT OPUS REWRITE

À sauvegarder dans `engine/agents/prompts/opus-rewrite-prompt-template.md` :

```
Tu vas réécrire un livrable éditorial pour le podcast "Génération Do It Yourself" (GDIY) hosté par Matthieu Stefani.

# CONTEXTE STRATÉGIQUE

GDIY est un podcast français d'entrepreneuriat avec ~500 épisodes. Stefani écrit chaque semaine une newsletter qui présente l'épisode du moment et le situe dans l'écosystème Orso Media (qui regroupe 6 podcasts dont GDIY, La Martingale, Le Panier, Finscale, Combien ça gagne, Passion Patrimoine).

Le livrable à produire est un livrable du projet "Sillon" qui automatise la production éditoriale cross-corpus pour les podcasts Orso. Il doit être indistinguable d'un livrable écrit par Stefani lui-même.

L'épisode à traiter : ${episodeTitle}, avec ${guestName}.

# 6 NEWSLETTERS RÉELLES STEFANI POUR T'IMPRÉGNER DU TON

${newsletter1Content}

---

${newsletter2Content}

---

${newsletter3Content}

---

${newsletter4Content}

---

${newsletter5Content}

---

${newsletter6Content}

# PATTERNS STEFANI À INTÉRIORISER

Observe les exemples ci-dessus et note :

1. **Phrases courtes** : 3-7 mots fréquentes. Mots isolés ("Génie." / "Boom." / "Sale.") en ligne propre.

2. **Ouverture** : anecdote personnelle concrète OU constat brutal en 1 ligne. JAMAIS "Dans l'épisode X, Y aborde Z".

3. **Tension personnelle avouée** : "j'ai essayé", "je cale", "j'avais jamais pensé". Stefani ne se met pas en posture surplombante.

4. **Diagnostic systémique** plutôt que résumé : Stefani prend l'épisode comme prétexte pour analyser une mécanique plus large.

5. **Rythme par paragraphes courts** séparés. Chaque idée respire.

6. **Conclusion qui transcende** : ne ferme pas, ouvre vers une réflexion plus large. Pas de question rhétorique creuse type "Et vous, qu'en pensez-vous ?".

7. **Tutoiement implicite** : "vous" mais avec proximité ("croyez-moi", "vous allez voir").

8. **Vocabulaire** : familier-précis. "Le feu", "à l'arrache", anglicismes assumés ("DCA", "single source of truth", "defocus").

# CONTRAINTES NON-NÉGOCIABLES

a) NE JAMAIS attribuer ces phrases-fétiches Stefani à un invité (l'invité est ${guestName}, pas Stefani) :
- "Nous sommes la moyenne des personnes que nous fréquentons"
- "Casquette Verte"
- "DOIT" (signature codes promo Stefani)

b) NE PAS générer de front-matter type "> Date :" "> URL :" "> Auteur :" "> Pattern tags :" en haut du livrable. C'est METADATA INTERNE, pas du contenu pour le lecteur.

c) Mentionner naturellement "écosystème Orso" ou "team GDIY et Orso Media" puisque les cross-refs viennent du catalogue Orso.

d) Pas de questions rhétoriques creuses en conclusion ("Quelles sont vos réflexions ?", "Et vous, qu'en pensez-vous ?").

e) Les chiffres mentionnés doivent venir du transcript (chiffres listés ci-dessous), pas d'inventions.

# DONNÉES ÉPISODE

## Transcript — points clés

${transcriptKeyPoints}

## Lens éditoriaux activés sur cet épisode

${activeLensSummary}

## Cross-références sélectionnées (du catalogue Orso)

${selectedCrossRefs}

# LIVRABLE ACTUEL À RÉÉCRIRE

Voici le livrable produit par Sonnet 4.6 avec score validateur ${currentScore}/10. Sonnet n'a pas réussi à imiter Stefani malgré ${iterationCount} itération(s).

```
${currentLivrable}
```

# DIAGNOSTIC DU LIVRABLE ACTUEL

Issues identifiées par le validateur :

${validationIssuesList}

# TA MISSION

Réécris ce livrable dans le ton et le style Stefani (vu dans les 6 exemples).

Type de livrable : ${livrableType}
Longueur cible : ${targetLength}
Contraintes spécifiques : ${specificConstraints}

Commence directement par le contenu (titre + corps si newsletter, structure native si cross-refs ou brief annexe). Pas de préambule, pas de métadonnées, pas de "voici le livrable réécrit :".
```

## NOTE FINALE — POSTURE V5

V5 est l'aboutissement d'un cycle de 5 itérations Phase 5 (V1, V2, V3, V4, V5). 

Si V5 PASS 3/3, on aura :
- Validé que l'architecture moteur Sillon (engine V4) tient
- Validé que les 3 changes V4 (loadStyleCorpus, lensSectionGate, qualityValidator) sont solides
- Validé que la limite Sonnet 4.6 sur imitation persona est résolue par Opus 4.7
- Décalage envoi pilote 13/05 → 20/05 confirmé tenable

Si V5 ne PASS pas franchement, signaler clairement et lister les hypothèses pour discussion Jérémy. Pas d'itération aveugle V6.

GO Étape 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9.
