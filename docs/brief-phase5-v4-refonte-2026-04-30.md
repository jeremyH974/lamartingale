# Brief Claude Code — Refonte Phase 5 V4 : few-shot Stefani + pool intelligent + validateur sémantique

> Mission : refonte Phase 5 livrables Pack 2 sur GDIY #266 Plais
> Précédent : V3 fail (3/5 livrables sous cap qualité)
> Diagnostic : Sonnet écrit comme un stagiaire prudent, pas comme Stefani
> Solution : 3 changements stratégiques validés par Jérémy

## CONTEXTE GÉNÉRAL

Le projet Sillon (podcast-engine) a livré Phase 1-4 avec succès. lensClassificationAgent V4 PASS 11/12. Whisper réel sur 4 épisodes. Master à `26c91a4`.

Phase 5 V1, V2, V3 ont échoué successivement à atteindre le cap qualité 7+/10 (commodities) et 7.5+/10 (pivots). Diagnostic confirmé en lecture critique Jérémy : Sonnet 4.6 produit du contenu business générique sans persona précis, malgré tone_profile abstrait dans V3.

**3 changements stratégiques décidés** :
- Change 1 : injection de **6 newsletters Stefani réelles** comme few-shot examples dans les prompts L4 (newsletter), L5 (brief annexe), L3 (cross-refs rationales)
- Change 2 : **pool cross-refs intelligent** — si lens a moins de 3 mentions OU pool < 5 candidats pertinents, NE PAS générer la section
- Change 3 : **validateur sémantique post-Sonnet** (2e appel Sonnet) qui vérifie chaque livrable contre une liste de critères qualité

**Décalage envoi pilote acté** : 13/05 → 20/05.

## CAPS QUALITÉ NON-NÉGOCIABLES

1. **Cap qualité différencié** :
   - Cap commodities (L1, L2) : 7+/10 (non touchés en V4)
   - Cap pivots (L3, L4, L5) : 7.5+/10 (objet de la refonte V4)

2. **Cap discipline anti-régression** : tests 509/509 verts maintenus. Aucune dégradation.

3. **Cap budget Sonnet V4** :
   - Cap re-run Phase 5 V4 : $1.50 maximum
   - Inclut les appels validateur sémantique (2e appel par livrable)

4. **Cap honnêteté du verdict** : si V4 ne passe pas franchement, signale clairement. Pas de polissage cosmétique pour faire passer.

5. **Cap satisfaction Stefani** : tu juges en imaginant Stefani lisant. Si tu te dis "Stefani trouverait ça générique/poli/scolaire", c'est sous-cap.

## CHANGE 1 — INJECTION FEW-SHOT STEFANI

### Pourquoi c'est nécessaire

V3 utilisait un tone_profile abstrait (forbidden_patterns, style_constraints, persona_guidance). Insuffisant. Sonnet a contourné par recombinaison ("préparation d'interviews et de due diligence devient alors un enjeu stratégique" malgré "préparation d'interviews et de due diligence" en forbidden).

Solution : remplacer les abstractions par des **exemples concrets de texte Stefani**. Sonnet imitera le pattern, pas une liste de règles à contourner.

### Source few-shot — 6 newsletters Stefani analysées

**Source 1** — "Les meilleurs usages de l'IA" (21/04/2026)

Pattern : anecdote personnelle (cave à vin → ChatGPT) → liste de questions ouvertes → diagnostic systémique → reco actionnable.

Citations à intégrer comme exemples :
- "Aujourd'hui j'ai envie de vous partager une anecdote..."
- "Génie." (mot isolé)
- "J'ai essayé. En quelques heures, ma cave est passée d'un entrepôt un peu vague à un inventaire vivant."
- "Cette anecdote m'a fait réaliser quelque chose qui me travaille depuis : les usages les plus pratiques de l'IA ne se trouvent pas seuls."
- Recos GDIY format : "Tout le monde a grandi avec Maya l'Abeille. Mais personne ne sait ce qui se passe vraiment derrière. [Sixte] a racheté ces franchises. Construit sa propre IA pour les produire. Et atteint 22 milliards de vues par an en faisant l'exact inverse de ce qu'Hollywood fait depuis toujours."

**Source 2** — "Acheter juste, ou acheter possible ?" (03/11/2025)

Pattern : opening en 1 ligne → tension personnelle avouée → liste de tensions concrètes → diagnostic systémique → pistes numérotées → conclusion qui transcende.

Citations à intégrer :
- "En 2025, il "faut" passer à l'électrique."
- "Sur le papier, j'y vais. 100%."
- "Dans la vraie vie, je cale. J'ai essayé la Model Y..."
- "Le consommateur devient l'ultime régulateur, sommé de résoudre seul ce que l'industrie et la politique ont laissé filer."
- "Acheter devient un référendum permanent. Et chacun vote avec sa carte bleue… le nez pincé."
- "L'injonction morale, sans infrastructure cohérente, devient un impôt psychologique."

**Source 3** — "Ce que je vous souhaite en 2026" (11/01/2026)

Pattern : titre provocateur → réponse en 1 mot ("Rien.") → puis revirement ("Ou plutôt si.") → 6 points numérotés concrets → conclusion forte.

Citations à intégrer :
- "Les choses ne tombent pas du ciel. Elles se provoquent."
- "Vouloir ne suffit pas. Vouloir, c'est un mirage."
- "Capacité à traiter en premier ce qui ne vous plaît pas."
- "1. Avoir toujours un dossard d'avance."
- "Le dossard d'avance, c'est ça. Avoir déjà décidé ce que vous ferez quand vous n'aurez plus envie."
- "C'est là que tout se joue : Commencez toujours par le plus dur."
- "Faire d'abord ce qui est pénible a un effet immédiat : la charge mentale s'effondre."

**Source 4** — "L'idée n'est plus de savoir si mais quand" (22/09/2025)

Pattern : analyse politique/économique → constat → questions cadrantes → prise de position assumée.

Citations à intégrer :
- "Terminé le débat sur cette taxe."
- "Le débat n'est plus."
- "Il n'est plus question de savoir si elle va être mise en place, mais quand elle va être mise en place."
- "Cette taxe va donc arriver, et c'est probablement une bonne chose."

**Source 5** — "Sommes-nous la moyenne de nos efforts ?" (15/09/2025)

Pattern : phrase-fétiche en exergue → dialogue rapporté → tension morale → conclusion engagée.

Citations à intégrer :
- "**Nous sommes la moyenne des personnes que nous fréquentons.**" (À BLACKLISTER absolument — phrase-fétiche)
- "Essaye donc de courir un marathon sans entraînement."
- "Mais une chose reste non négociable : l'effort, le travail, l'engagement."
- "70, 80 heures par semaine. Pendant des années. Souvent en gagnant un gros SMIC."
- "Pour que la moyenne générale remonte enfin."

**Source 6** — "Faut-il tout vendre maintenant ?" (21/04/2025)

Pattern : titre-question → réponse claire en intro → analyse → conclusion rassurante mais lucide.

Citations à intégrer :
- "Ces trois derniers mois et plus généralement ces 5 dernières années nous montrent à quel point il faut éviter de se *defocus* et bien rester concentré."
- "Et pourtant si vous ne gardez pas la tête froide en ce moment, que vous changez de direction telle une girouette avec le sens du vent, vous allez rapidement vous perdre."
- "Alors la stratégie est claire : pensez long terme et respectez votre mission."
- "Tout va bien se passer."

### Implémentation Change 1

**Fichier** : `clients/stefani-orso.config.ts`

Remplacer le bloc `tone_profile` par un nouveau bloc `style_corpus` contenant les 6 sources avec leur métadonnées :

```typescript
style_corpus: {
  // Newsletters Stefani de référence pour few-shot
  newsletters: [
    {
      id: 'usages-ia-2026-04',
      title: "Les meilleurs usages de l'IA",
      date: "2026-04-21",
      url: "https://matt.kessel.media/posts/pst_6cacd87ea485417d913df6d2712b2d2f/les-meilleurs-usages-de-lia",
      pattern_tags: ['anecdote-personnelle', 'questions-ouvertes', 'diagnostic-systemique'],
      excerpts: [
        "Aujourd'hui j'ai envie de vous partager une anecdote...",
        "Génie.",
        "Cette anecdote m'a fait réaliser quelque chose qui me travaille depuis...",
      ],
      reco_format_example: `Tout le monde a grandi avec Maya l'Abeille. Mais personne ne sait ce qui se passe vraiment derrière. Sixte de Vauplane a racheté ces franchises. Construit sa propre IA pour les produire. Et atteint 22 milliards de vues par an en faisant l'exact inverse de ce qu'Hollywood fait depuis toujours.

Sa thèse : refuser l'IA aujourd'hui, c'est refuser l'arrivée du son en 1927.

Un épisode qui va changer votre regard sur l'animation, l'IA, et ce que "créer" veut encore dire.`
    },
    {
      id: 'acheter-juste-2025-11',
      title: "Acheter juste, ou acheter possible ?",
      date: "2025-11-03",
      pattern_tags: ['opening-court', 'tension-personnelle', 'pistes-numerotees', 'conclusion-transcendante'],
      excerpts: [
        "En 2025, il \"faut\" passer à l'électrique.",
        "Sur le papier, j'y vais. 100%.",
        "Dans la vraie vie, je cale.",
        "Le consommateur devient l'ultime régulateur, sommé de résoudre seul ce que l'industrie et la politique ont laissé filer.",
        "L'injonction morale, sans infrastructure cohérente, devient un impôt psychologique.",
      ]
    },
    {
      id: 'souhaits-2026-01',
      title: "Ce que je vous souhaite en 2026",
      date: "2026-01-11",
      pattern_tags: ['titre-provocateur', 'mot-isole', 'liste-numerotee-actionnable'],
      excerpts: [
        "Rien.",
        "Ou plutôt si.",
        "Les choses ne tombent pas du ciel. Elles se provoquent.",
        "Vouloir ne suffit pas. Vouloir, c'est un mirage.",
        "Faire d'abord ce qui est pénible a un effet immédiat : la charge mentale s'effondre.",
      ]
    },
    {
      id: 'taxe-zucman-2025-09',
      title: "L'idée n'est plus de savoir si mais quand",
      date: "2025-09-22",
      pattern_tags: ['constat-brutal', 'prise-de-position', 'questions-cadrantes'],
      excerpts: [
        "Terminé le débat sur cette taxe.",
        "Le débat n'est plus.",
        "Cette taxe va donc arriver, et c'est probablement une bonne chose.",
      ]
    },
    {
      id: 'moyenne-efforts-2025-09',
      title: "Sommes-nous la moyenne de nos efforts ?",
      date: "2025-09-15",
      pattern_tags: ['phrase-fetiche-exergue', 'dialogue-rapporte', 'conclusion-engagee'],
      excerpts: [
        "Essaye donc de courir un marathon sans entraînement.",
        "Mais une chose reste non négociable : l'effort, le travail, l'engagement.",
        "Pour que la moyenne générale remonte enfin.",
      ]
    },
    {
      id: 'tout-vendre-2025-04',
      title: "Faut-il tout vendre maintenant ?",
      date: "2025-04-21",
      pattern_tags: ['titre-question', 'analyse-strategique', 'conclusion-rassurante-lucide'],
      excerpts: [
        "Et pourtant si vous ne gardez pas la tête froide en ce moment, que vous changez de direction telle une girouette avec le sens du vent, vous allez rapidement vous perdre.",
        "Alors la stratégie est claire : pensez long terme et respectez votre mission.",
        "Tout va bien se passer.",
      ]
    },
  ],
  
  // Phrases-fétiches Stefani à NE JAMAIS attribuer à un invité
  host_blacklist_phrases: [
    "Nous sommes la moyenne des personnes que nous fréquentons",
    "Nous sommes la moyenne des personnes",
    "On est la moyenne des personnes",
    "Casquette Verte",
    "DOIT",  // signature de codes promo Stefani
    "Bisous,",
    "Matt/",
  ],
  
  // Vocabulaire/expressions emblématiques de Stefani (pour reconnaissance, pas pour imitation forcée)
  signature_expressions: [
    "Boom.",
    "Sale.",
    "Génie.",
    "Fou.",
    "Le feu",
    "à l'arrache",
    "tout bien réfléchi",
    "Au fond",
    "DCA",
    "single source of truth",
  ],
  
  // Mention écosystème — confirmé par usage réel Stefani
  ecosystem_reference: {
    canonical_phrase: "écosystème Orso",
    alternatives: ["la team GDIY et Orso Media", "l'équipe d'Orso", "nos amis du catalogue Orso"],
    must_appear_in: ['newsletter', 'brief-annexe'],
    appearance_style: "naturelle, pas forcée",
  }
}
```

### Injection des newsletters dans les prompts

**Prompt newsletter L4** : avant de demander à Sonnet de générer, **injecter 2-3 newsletters Stefani complètes** comme exemples (sélectionnées par pertinence du sujet via les `pattern_tags`).

Pour Plais (sujet : tech B2B, scaleup, télétravail), sélectionner :
- "Les meilleurs usages de l'IA" (anecdote personnelle, sujet tech)
- "Acheter juste" (analyse systémique, conclusion transcendante)
- "Faut-il tout vendre maintenant ?" (stratégie, garder le cap)

Format prompt :
```
Tu vas rédiger une newsletter pour le podcast GDIY hosté par Matthieu Stefani.

VOICI 3 NEWSLETTERS RÉELLES DE STEFANI POUR QUE TU IMITES SON STYLE :

[NEWSLETTER 1 EXEMPLE]
[texte complet de "Les meilleurs usages de l'IA"]

[NEWSLETTER 2 EXEMPLE]
[texte complet de "Acheter juste, ou acheter possible ?"]

[NEWSLETTER 3 EXEMPLE]
[texte complet de "Faut-il tout vendre maintenant ?"]

OBSERVE en particulier :
- Phrases courtes, parfois 3-7 mots
- Mots isolés sur une ligne ("Boom.", "Sale.", "Génie.")
- Anecdote personnelle ou tension avouée en ouverture
- Pas de "Dans l'épisode X, Y aborde Z" en intro descriptive
- Diagnostic systémique plutôt que résumé
- Listes numérotées pour structurer
- Phrase finale qui transcende
- Tutoiement implicite ("croyez-moi", "ça vous parle")

CONTRAINTES NON-NÉGOCIABLES :
- Ne JAMAIS attribuer une citation à l'invité si elle pourrait venir de Stefani
- Liste noire des phrases-fétiches Stefani à NE PAS utiliser comme citation invité :
  ["Nous sommes la moyenne des personnes que nous fréquentons", "Casquette Verte", ...]
- Mentionner "écosystème Orso" naturellement quand on cite des cross-refs
- Pas de questions rhétoriques creuses en conclusion

MAINTENANT, RÉDIGE UNE NEWSLETTER POUR L'ÉPISODE SUIVANT :
[transcript Plais]
[lens classifications]
[cross-refs sélectionnées]
```

**Prompt brief annexe L5** : injecter 1-2 exemples plus courts (extraits) avec focus sur les patterns de recos GDIY (qui sont l'équivalent format court).

**Prompt cross-refs L3** : injecter le format de reco Stefani comme template pour les rationales `why_relevant`. Pas la newsletter complète, juste le pattern de reco.

**Prompt key_moments L1 et quotes L2** : non touchés en V4 (cap commodities 7+/10 acceptable).

### Tests Change 1

- Test : prompt newsletter contient bien les 3 newsletters Stefani complètes
- Test : `host_blacklist_phrases` filtré post-Sonnet (rejet si match)
- Test : `ecosystem_reference` mentionné dans newsletter et brief annexe

## CHANGE 2 — POOL CROSS-REFS INTELLIGENT

### Pourquoi c'est nécessaire

V3 a confirmé : sur Plais, le lens `dtc-acquisition-tactical` n'a qu'**1 mention faible**. Forcer 2-5 cross-refs sur ce lens = forçage permanent (Mazzella sur DTC, Viglietti sur DTC = sont sortis de leur contexte).

Solution : si un lens n'a pas assez de matière, NE PAS générer la section.

### Implémentation Change 2

**Fichier** : `engine/agents/lensClassificationAgent.ts` ou primitive `crossReferenceEpisode.ts`

Ajouter une logique de filtrage intelligent :

```typescript
function shouldGenerateLensSection(
  lens: Lens,
  matchesOnEpisode: LensMatch[],
  pgvectorCandidates: CrossRefCandidate[]
): { shouldGenerate: boolean; reason?: string } {
  
  // Critère 1 : au moins 3 mentions du lens sur l'épisode source
  if (matchesOnEpisode.length < 3) {
    return {
      shouldGenerate: false,
      reason: `Lens '${lens.id}' a seulement ${matchesOnEpisode.length} mention(s) sur l'épisode source. Minimum requis : 3.`
    };
  }
  
  // Critère 2 : au moins 5 candidats pgvector pertinents (distance < 0.7)
  const relevantCandidates = pgvectorCandidates.filter(c => c.distance < 0.7);
  if (relevantCandidates.length < 5) {
    return {
      shouldGenerate: false,
      reason: `Pool pgvector trop restreint pour lens '${lens.id}' : ${relevantCandidates.length} candidats pertinents (< 5).`
    };
  }
  
  return { shouldGenerate: true };
}
```

**Application dans les livrables** :

Pour L3 (cross-refs by lens) et L5 (brief annexe) :
- Boucler sur les lens activés sur l'épisode
- Pour chaque lens, appeler `shouldGenerateLensSection`
- Si `shouldGenerate: false` : ne PAS inclure la section dans le livrable, mais logger le `reason`
- Si `shouldGenerate: true` : générer normalement

**Conséquence pratique sur Plais** :

D'après le verdict V4 (Plais distribution {ed-base: 11, ovni: 10, b2b-IT: 10, dtc: 1}) :
- ovni-vc-deeptech : 10 mentions → GO génération
- editorial-base : 11 mentions → GO génération (mais filtre top-5 reste)
- dtc-acquisition-tactical : 1 mention → SKIP section
- b2b-insurance-tech : 10 mentions mais après fix threshold 0.5 attendu < 3 → probablement SKIP
- alternative-investments : 0 mentions → SKIP

Résultat attendu : Plais aura **2 sections lens** dans son brief annexe (ovni-vc + editorial-base) au lieu de 4. Beaucoup plus propre.

**Documentation pour l'utilisateur** :

Dans le livrable L3 et L5, ajouter une note discrète en bas si certains lens ont été skippés :

```markdown
*Note : lens `dtc-acquisition-tactical` n'a pas généré de section (mention trop faible sur l'épisode source).*
```

### Tests Change 2

- Test mock : lens avec 2 mentions → shouldGenerate false
- Test mock : lens avec 5 mentions mais < 5 candidats pgvector → shouldGenerate false
- Test mock : lens avec 5 mentions et 10 candidats → shouldGenerate true
- Test : livrable L3 généré sur cas mixte → contient seulement les sections pour lens passants

## CHANGE 3 — VALIDATEUR SÉMANTIQUE POST-SONNET

### Pourquoi c'est nécessaire

Filtre `forbidden_patterns` actuel = grep texte. Trop fragile. V3 a montré que Sonnet recombine les expressions interdites.

Solution : 2e appel Sonnet "validateur" qui lit le livrable produit et vérifie sémantiquement.

### Implémentation Change 3

**Nouvelle fonction** : `engine/agents/qualityValidator.ts`

```typescript
interface QualityValidationResult {
  passed: boolean;
  score: number;  // 1-10
  issues: ValidationIssue[];
  rewriteSuggestions?: string;
}

interface ValidationIssue {
  category: 'forbidden-phrase' | 'tone-mismatch' | 'host-attribution-error' | 'generic-content' | 'off-topic';
  severity: 'critical' | 'major' | 'minor';
  description: string;
  excerpt?: string;
}

async function validateLivrableQuality(
  livrable: string,
  livrableType: 'newsletter' | 'brief-annexe' | 'cross-refs',
  context: {
    guestName: string;
    hostName: string;
    styleCorpus: StyleCorpus;
  }
): Promise<QualityValidationResult>
```

**Prompt validateur** :

```
Tu es un éditeur exigeant qui doit valider la qualité d'un livrable produit pour le podcast GDIY hosté par Matthieu Stefani.

CRITÈRES DE VALIDATION :

1. PHRASES INTERDITES — Vérifier qu'aucune phrase-fétiche de Stefani n'est attribuée à l'invité :
[liste host_blacklist_phrases]

2. TON — Le livrable doit ressembler au ton Stefani :
- Phrases courtes, parfois mots isolés
- Anecdote personnelle ou tension avouée si applicable
- Pas de "Dans l'épisode X, Y aborde Z" en intro descriptive
- Diagnostic systémique plutôt que résumé
- Pas de questions rhétoriques creuses en conclusion

3. ATTRIBUTION — Aucune citation ne doit être attribuée à l'invité si elle pourrait venir de l'hôte (Stefani).

4. CONTENU GÉNÉRIQUE — Pas de phrases business génériques type :
- "des perspectives variées sur les défis"
- "résonance avec"
- "ouvre des pistes intéressantes"
- "préparation d'interviews et de due diligence" (variantes incluses)

5. HORS-SUJET — Le contenu doit rester centré sur l'épisode et l'invité, pas digresser sur des sujets annexes.

VOICI LE LIVRABLE À VALIDER :
[livrable produit]

RÉPONDS EN JSON STRICT :
{
  "passed": boolean,
  "score": 1-10,
  "issues": [
    {
      "category": "...",
      "severity": "critical | major | minor",
      "description": "...",
      "excerpt": "..." // si applicable
    }
  ],
  "rewriteSuggestions": "..." // si score < 7.5, suggestion de réécriture des passages problématiques
}
```

**Logique d'application** :

Pour chaque livrable L3, L4, L5 (pas L1, L2) :

1. Premier appel Sonnet → génération du livrable
2. Deuxième appel Sonnet (validateur) → score qualité
3. Si `passed: true ET score >= 7.5` → livrable validé
4. Si `passed: false OU score < 7.5` :
   - Logger les issues
   - **Tentative de réécriture** : 3e appel Sonnet avec les `rewriteSuggestions` injectées dans le prompt
   - Re-validation → si encore < 7.5, accepter le résultat avec warning

Cap : maximum 3 itérations Sonnet par livrable (génération + validation + rewrite). Pas plus.

### Coût marginal Change 3

Sans validateur (V3) : 1 appel Sonnet par livrable.
Avec validateur (V4) : 2-3 appels Sonnet par livrable (×2 ou ×3).

Estimation Phase 5 V4 (3 livrables L3, L4, L5) :
- V3 baseline : ~$0.15 par épisode pour ces 3 livrables
- V4 avec validateur : ~$0.45 par épisode

Sur 1 épisode (Plais) : ~$0.45.
Cap budget Phase 5 V4 : $1.50 → marge confortable.

### Tests Change 3

- Test mock : livrable avec phrase blacklist → validateur détecte
- Test mock : livrable générique → validateur score < 7
- Test mock : livrable bon → validateur score >= 7.5
- Test : 3 itérations max respectées
- Test : score final reporté dans le STOP

## ORDRE D'EXÉCUTION V4

### Étape 1 — Vérifications préalables (5 min)

1. État repo :
   ```
   pwd  # C:\Users\jerem\lamartingale
   git branch --show-current  # master
   git status  # clean
   git log -1 --oneline  # 26c91a4 ou descendant
   ```

2. Vérifier transcript Plais disponible :
   ```
   ls experiments/autonomy-session-2026-04-28/transcripts/
   # doit contenir le fichier transcript Plais
   ```

3. Vérifier tests baseline :
   ```
   npm test
   # 509/509 verts attendus
   ```

### Étape 2 — Implémentation Change 1 (45 min)

1. Créer/modifier `clients/stefani-orso.config.ts` avec le bloc `style_corpus`
2. Stocker les 6 newsletters complètes en assets locaux :
   ```
   mkdir -p data/style-corpus/stefani/
   ```
   Créer 6 fichiers `.md` :
   - `usages-ia-2026-04.md`
   - `acheter-juste-2025-11.md`
   - `souhaits-2026-01.md`
   - `taxe-zucman-2025-09.md`
   - `moyenne-efforts-2025-09.md`
   - `tout-vendre-2025-04.md`
   
   Le contenu de ces 6 fichiers sera fourni par Jérémy. Si Jérémy n'a pas fourni le contenu en tant que fichiers : laisser des fichiers placeholder avec `# TODO: insérer contenu newsletter [titre]` et signaler dans le STOP.

3. Modifier les prompts L4 (newsletter), L5 (brief annexe), L3 (cross-refs) pour injecter 2-3 newsletters complètes en few-shot
4. Ajouter le filtre `host_blacklist_phrases` post-Sonnet (en plus du tone_profile existant qui peut être conservé)
5. Tests Change 1 verts

### Étape 3 — Implémentation Change 2 (30 min)

1. Implémenter `shouldGenerateLensSection` dans `engine/agents/lensClassificationAgent.ts`
2. Modifier la composition L3 et L5 pour appeler cette fonction par lens
3. Ajouter la note discrète "Note : lens X n'a pas généré..." en cas de skip
4. Tests Change 2 verts

### Étape 4 — Implémentation Change 3 (45 min)

1. Créer `engine/agents/qualityValidator.ts`
2. Implémenter `validateLivrableQuality` avec prompt validateur
3. Intégrer le validateur dans la pipeline génération L3, L4, L5
4. Logique 3 itérations max (générer → valider → rewrite si < 7.5 → re-valider)
5. Tests Change 3 verts

### Étape 5 — Tests cumulés (5 min)

```
npm test
# Doit afficher : tests précédents + N nouveaux tests Change 1+2+3
# Régression : aucune
```

### Étape 6 — Re-run Phase 5 V4 sur Plais (30 min)

1. Régénérer L3, L4, L5 sur Plais avec les 3 changes activés
2. Stocker dans :
   ```
   experiments/autonomy-session-2026-04-28/phase5-plais-v4/
   ├── plais-platform-sh-cross-refs-by-lens.md
   ├── plais-platform-sh-newsletter.md
   └── plais-platform-sh-brief-annexe.md
   ```
3. Logger les scores validateur pour chaque livrable
4. Logger les sections lens skippées par Change 2 et raisons

### Étape 7 — STOP V4 (10 min)

Format STOP :

```markdown
# STOP Phase 5 V4 — verdict : PASS / PARTIEL / FAIL

## Verdict global
N/3 livrables ≥ cap qualité 7.5/10

## Implémentation des 3 changes
- Change 1 (few-shot Stefani) : ✅ ou ❌ + détails
  - 6 newsletters Stefani injectées : oui/non
  - host_blacklist_phrases filtré : oui/non
- Change 2 (pool intelligent) : ✅ ou ❌
  - Lens skippés sur Plais : [liste avec raisons]
  - Sections générées sur Plais : [liste]
- Change 3 (validateur sémantique) : ✅ ou ❌
  - Itérations moyennes par livrable : N
  - Score validateur moyen : N/10

## Matrice 3 livrables V3 → V4

| Livrable | V3 | V4 | Cap | Verdict |
|---|---|---|---|---|
| L3 Cross-refs | 6.5/10 | N/10 | 7.5+ | ↑ ou ↓ |
| L4 Newsletter | 5.5/10 | N/10 | 7.5+ | ↑ ou ↓ |
| L5 Brief annexe | 6/10 | N/10 | 7.5+ | ↑ ou ↓ |

## Améliorations qualitatives observées
- Phrases-fétiches Stefani évitées : oui/non
- Mention écosystème Orso naturelle : oui/non
- Mazzella forcé sur lens non-pertinents : non (Change 2 a skippé)
- Phrases courtes type Stefani : oui/non
- Diagnostic vs résumé : oui/non

## Findings nouveaux V4 (si applicable)

## Cumul session
- Sonnet V4 : $X.XX / $1.50
- Sonnet total session : $X.XX / $15
- Whisper total session : $2.19 / $2.50
- Total session : $X.XX / $17.50

## État repo
- Tests : N/M verts (delta : +X)
- Régression : aucune
- Working tree : clean
- Master : [SHA]

## Recommandation pour Jérémy
- Si V4 PASS (3/3 ≥ 7.5) : "Prêt pour Phase 6 sur 4 épisodes (mais attendre GO Jérémy)"
- Si V4 PARTIEL : "lesquels passent, lesquels résistent, hypothèses"
- Si V4 FAIL : "diagnostic des problèmes structurels résiduels, options pour V5 ou pivot scope"

Pas d'auto-continue Phase 6.
```

## DISCIPLINE TRANSVERSALE V4

- Pas de touch lensClassificationAgent core (validé V4 jalon)
- Pas de modification lens parameters (validé V4 jalon)
- Pas de touch L1 (Key moments) ni L2 (Quotes)
- Pas d'auto-continue Phase 6 même si V4 PASS — STOP attente Jérémy
- Si tu identifies un finding pendant V4 : signale dans STOP, ne l'applique pas

## NOTE FINALE — POSTURE V4

Cette refonte V4 est le test ultime du pipeline livrables Stefani. Si V4 ne passe pas :
- Soit on a sous-estimé la complexité du ton Stefani (probable)
- Soit Sonnet 4.6 n'est pas suffisant pour ce niveau d'imitation (à explorer)

Dans les 2 cas, V4 fail = retour stratégique avec Jérémy, pas itération aveugle V5.

GO Étape 1 → 2 → 3 → 4 → 5 → 6 → 7.
