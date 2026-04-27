# Brief Claude Code — Polish pré-envoi pilote Stefani-Orso

> Mission : passe de polish finale sur le pack pilote Phase 6 avant envoi 15-17/05
> Précédent : Phase 6 PASS 12/12 pivots ≥ 7.5/10 + lecture critique Jérémy = 11 livrables solides + 1 borderline + 4 findings à fixer
> Mode : hybride — auto-fix triviaux + validation Jérémy pour fixes substantiels

## CONTEXTE POLISH

Phase 6 a livré un pack pilote complet (4 épisodes × 5 livrables = 20 documents) avec qualité Stefani-grade sur les pivots. La lecture critique Jérémy a confirmé l'architecture saine et identifié 4 findings + le polish L1/L2 nécessaire avant envoi à Stefani.

**Posture polish** : conservatrice. On corrige ce qui est défectueux. On ne cherche PAS à élever ce qui est seulement acceptable. Cap qualité maintenu (pas un V6 déguisé).

**Mode hybride** :
- **Auto-fix** : corrections triviales appliquées directement par Claude Code (anti-hallucination chiffres, mention Orso ajoutée, titres harmonisés)
- **Validation Jérémy** : corrections substantielles soumises pour validation (fix Nooz L3 polluée, polish L1/L2 hooks/quotes)

## CAPS NON-NÉGOCIABLES POLISH

1. **Cap qualité** : ne PAS dégrader les scores actuels. Si une correction proposée fait baisser la qualité, ne pas l'appliquer.

2. **Cap budget Polish** : $2.00 maximum
   - Sonnet : ~$0.50 (régénérations ciblées)
   - Opus : ~$1.00 (rewrites ciblés si nécessaire)
   - Marge : ~$0.50

3. **Cap discipline anti-régression** : 572/572 tests verts maintenus.

4. **Cap honnêteté** : si une correction ne peut pas se faire sans risque, signaler à Jérémy plutôt que d'appliquer un fix douteux.

## LES 7 CORRECTIONS À APPLIQUER

### CORRECTION 1 — Vérifications anti-hallucination chiffres (AUTO + Jérémy si problème)

**Mode** : auto-vérification, alerte Jérémy si hallucination détectée

Pour chacun des 4 chiffres suspects identifiés en lecture critique, grep dans les transcripts correspondants :

**Chiffre 1.1 — Nooz L5 brief annexe** : "étrangle 90% des e-commerçants qui scalent"

```bash
grep -i "90%\|90 %\|quatre-vingt-dix" experiments/autonomy-session-2026-04-28/transcripts/*nooz* \
                                       experiments/autonomy-session-2026-04-28/transcripts/*doolaeghe*
```

Si "90%" trouvé dans le contexte e-commerçants/cash flow → légitime
Si NON trouvé → **hallucination, à fixer**

**Chiffre 1.2 — Boissenot L4 newsletter** : "carte atteindre un million d'euros"

```bash
grep -i "million\|millions\|1 000 000\|1.000.000" \
  experiments/autonomy-session-2026-04-28/transcripts/*boissenot*
```

**Chiffre 1.3 — Boissenot L4 newsletter** : "Pokémon est la licence la plus rentable de tous les temps — devant Marvel, Star Wars et Harry Potter combinés"

```bash
grep -i "marvel\|star wars\|harry potter" \
  experiments/autonomy-session-2026-04-28/transcripts/*boissenot*
```

**Chiffre 1.4 — Veyrat L4 newsletter** : "10% des cyberattaques sont rendues publiques"

```bash
grep -i "10%\|10 %\|dix pour cent" \
  experiments/autonomy-session-2026-04-28/transcripts/*veyrat*
```

**Procédure de fix** :
- Si chiffre TROUVÉ verbatim dans transcript → OK, ne rien faire
- Si chiffre TROUVÉ avec formulation différente (ex: "moins de 10%") → AUTO-FIX : ajuster le livrable pour matcher la formulation transcript
- Si chiffre NON TROUVÉ → **STOP et signaler à Jérémy** : reformulation manuelle nécessaire

**Logger pour le STOP** : tableau récapitulatif des 4 vérifications.

### CORRECTION 2 — Fix Nooz L3 contenu pollué (VALIDATION Jérémy avant régénération)

**Mode** : génération d'une proposition de fix, validation Jérémy avant application

**Diagnostic** : dans `experiments/autonomy-session-2026-04-28/pack-pilote-stefani-orso/nooz-optics/03-cross-refs-by-lens.md`, le rationale "Pourquoi un RAG mono-source ne trouve pas ça" pour la cross-ref Brand Lab #209 contient cette phrase :

> "Sans cross-corpus, aucun moteur mono-source Finscale ne rapproche spontanément un outil de détection de fraude aval d'un produit de souscription cyber amont"

C'est un **copier-coller depuis Veyrat** (insurtech/cyber/souscription) qui n'a aucun rapport avec Nooz Optics (DTC lunettes). Pollution cross-tenant à corriger.

**Procédure de fix** :

1. Lire le livrable complet `nooz-optics/03-cross-refs-by-lens.md`
2. Identifier précisément la phrase polluée (probablement section Brand Lab #209)
3. **Proposer 2-3 reformulations alternatives** cohérentes avec Nooz/DTC. Format proposition :

```
Phrase actuelle (POLLUÉE) :
"Sans cross-corpus, aucun moteur mono-source Finscale ne rapproche..."

Proposition A (reformulation préservant l'argument anti-RAG) :
"Brand Lab vit dans Le Panier, Nooz aussi. Mais un RAG mono-épisode 
ne rapproche jamais ces deux trajectoires. Ce sont deux histoires 
de scaling DTC qui se rejoignent uniquement quand on lit l'écosystème 
Le Panier comme un corpus unique."

Proposition B (variante plus courte) :
"Un RAG mono-source ne fait pas le pont entre l'épisode Nooz et la 
série spéciale Amazon — pourtant les deux racontent les arbitrages 
DTC vs marketplace, à des étapes différentes."
```

4. Soumettre les 2-3 propositions à Jérémy pour validation
5. Appliquer la proposition validée par Jérémy

**Cap budget proposition** : $0.10 Sonnet (génération propositions sans rewrite Opus).

### CORRECTION 3 — Fix titre "[EXTRAIT]" Boissenot L3 (AUTO si BDD claire)

**Mode** : auto-fix après vérification BDD

**Diagnostic** : dans `boissenot-pokemon/03-cross-refs-by-lens.md`, une cross-ref a comme titre :
> "[EXTRAIT] #217 — F. Carbone & A. Dubois (Matis), L'art contemporain"

Le tag "[EXTRAIT]" suggère un titre interne BDD, pas un titre publié.

**Procédure de fix** :

1. Query BDD pour vérifier le titre publié de l'épisode #217 dans le podcast Finscale (si c'est bien Finscale) ou tenant correspondant :

```sql
SELECT podcast_id, episode_number, title, guest_name 
FROM episodes 
WHERE episode_number = 217 
  AND (guest_name ILIKE '%carbone%' OR guest_name ILIKE '%dubois%' 
       OR title ILIKE '%art contemporain%' OR title ILIKE '%matis%');
```

2. Croiser avec le titre référencé dans le L5 brief annexe Boissenot :
> "L'art contemporain, un investissement méconnu"

3. Si BDD retourne un titre clair :
   - **AUTO-FIX** : substituer le titre L3 par le titre BDD (sans le tag "[EXTRAIT]")
4. Si BDD ne retourne rien ou ambigu :
   - **STOP et signaler à Jérémy** avec les options trouvées

### CORRECTION 4 — Mention écosystème Orso Veyrat L5 (AUTO)

**Mode** : auto-fix avec insertion naturelle

**Diagnostic** : dans `veyrat-stoik/05-brief-annexe.md`, aucune mention "écosystème Orso" / "team GDIY et Orso Media" / "catalogue Orso" n'est présente. F-V5-1 / F-P6-2 finding.

**Procédure de fix** :

1. Lire le livrable complet
2. Identifier l'endroit le plus naturel pour insérer la mention (probablement dans l'intro ou la conclusion, là où d'autres podcasts du catalogue sont mentionnés)
3. Insertion suggérée (à adapter au flow réel) : modifier la phrase intro
   ```
   AVANT : "Trois épisodes du catalogue à garder sous le coude après l'écoute de Jules Veyrat."
   
   APRÈS : "Trois épisodes du catalogue Orso à garder sous le coude après l'écoute de Jules Veyrat."
   ```
   
   Ou insertion dans la conclusion :
   ```
   AVANT : "Trois épisodes. Un sujet. À écouter dans cet ordre."
   
   APRÈS : "Trois épisodes du catalogue Orso. Un sujet. À écouter dans cet ordre."
   ```

4. **AUTO-FIX** : appliquer le fix le plus naturel selon le flow

### CORRECTION 5 — Polish L1 (Key moments) conservateur (AUTO + Jérémy si gros écart)

**Mode** : auto-fix sur les anomalies claires, validation Jérémy pour les changements substantiels

**Périmètre limité** :
- ✅ AUTO-FIX : retirer les moments hors-sujet (paradoxe Covid sur Plais — moment 3)
- ✅ AUTO-FIX : corriger les saliency uniformes 0.85-0.95 si flagrant
- ❌ NE PAS toucher aux hooks (acceptés au cap commodity)
- ❌ NE PAS réécrire les rationales "Pourquoi c'est saillant"

**Procédure** :

1. Pour chaque livrable L1 (4 épisodes) :
   - Lister les 5 moments
   - Identifier les moments hors-sujet par rapport au sujet de l'épisode
   - Identifier les saliency aberrantes

2. **Pour Plais L1 spécifiquement** :
   - Moment 3 "Le paradoxe américain face à la pandémie" est confirmé hors-sujet (lecture critique V3-V5 Jérémy)
   - **AUTO-FIX** : retirer ce moment, le pack Plais L1 aura 4 moments au lieu de 5
   - Marquer dans le STOP : "Plais L1 réduit à 4 moments (paradoxe Covid retiré, hors-sujet)"

3. **Pour Boissenot, Nooz, Veyrat L1** :
   - Vérifier qu'aucun moment n'est hors-sujet (probablement OK, vu la lecture critique)
   - Si trouvé : signaler à Jérémy avant retrait

4. **Distribution saliency** : si tous les moments d'un livrable ont saliency 0.85-0.95 sans variation, signaler dans le STOP comme finding mineur (pas auto-fix).

### CORRECTION 6 — Polish L2 (Quotes) — atteindre 5/5 où possible (VALIDATION Jérémy)

**Mode** : génération propositions, validation Jérémy avant application

**Diagnostic** :
- Plais : 4/5 (1 rejetée)
- Boissenot : 3/5 (2 rejetées)
- Nooz : 4/5 (1 rejetée)
- Veyrat : 5/5 ✓

**Procédure de fix** (sauf Veyrat) :

1. Pour chaque livrable L2 < 5/5 :
   - Lire le transcript correspondant
   - Identifier 1-2 quotes verbatim supplémentaires (ne pas inventer, prendre des phrases littérales)
   - **Critères de sélection** :
     * Phrase contient une opinion tranchée OU un chiffre marquant OU une formule mémorable
     * Attribuée clairement à l'invité (pas Stefani)
     * Verbatim strict
     * Longueur 10-40 mots (clippable réseaux sociaux)
   - Proposer 2-3 candidates par livrable manquant
   - Soumettre à Jérémy pour validation
   - Appliquer les quotes validées

2. **Cap quotes par livrable** : 5 maximum. Si on n'arrive pas à 5 quotes verbatim de qualité, mieux vaut rester à 4 que de forcer.

3. **Pour Plais quote 1 timestamp 00:00** :
   - Quote actuelle : "Le stress va aussi avec un focus..."
   - Timestamp 00:00 invalide
   - **Procédure** : grep cette phrase dans transcript Plais, récupérer le vrai timestamp
   - **AUTO-FIX** si transcript donne un timestamp valide
   - **Sinon** signaler à Jérémy

**Cap budget Correction 6** : $0.30 Sonnet max.

### CORRECTION 7 — Cohérence globale du pack (AUTO)

**Mode** : auto-fix de cohérence

**Procédure** :

1. **README.md du pack** :
   - Vérifier que `pack-pilote-stefani-orso/README.md` existe
   - Si absent ou incomplet, générer un README synthétique :
   
   ```markdown
   # Pack pilote Sillon — Stefani-Orso
   
   Démonstration du moteur Sillon sur 4 épisodes du catalogue Orso 
   Media (~3000 épisodes indexés au total).
   
   ## Les 4 épisodes
   
   1. **GDIY #266 — Frédéric Plais (Platform.sh)**
      Lever 140 millions avec 100% de télétravail
      Lens éditorial activé : ovni-vc-deeptech
   
   2. **La Martingale #174 — Alexandre Boissenot**
      L'essor des cartes Pokémon : aubaine pour investir ?
      Lens éditorial activé : alternative-investments
   
   3. **Le Panier #128 — Alex Doolaeghe (Nooz Optics)**
      Facebook Ads et Amazon pour faire 3M€ de CA en 18 mois
      Lens éditorial activé : dtc-acquisition-tactical
   
   4. **Finscale #107 — Jules Veyrat (Stoïk)**
      L'océan bleu de l'assurance cyber
      Lens éditorial activé : b2b-insurance-tech
   
   ## Ce que vous trouverez par épisode
   
   - **01 — Key moments** : 4-5 moments clippables avec timestamps Whisper réels
   - **02 — Quotes** : 4-5 citations verbatim prêtes pour réseaux sociaux
   - **03 — Cross-refs by lens** : épisodes du catalogue Orso qui prolongent l'angle éditorial activé
   - **04 — Newsletter** : article 350-450 mots intégrant l'épisode + cross-corpus
   - **05 — Brief annexe** : récap court des cross-references
   
   ## Argument différenciant Sillon
   
   Sillon est conçu pour faire des connexions cross-corpus que les 
   RAG mono-source (NotebookLM, beta.lamartingale.io) ne peuvent pas 
   faire structurellement. Les cross-references vers d'autres podcasts 
   du catalogue Orso démontrent cette capacité.
   
   ---
   
   *Pack généré par Sillon Phase 6 + polish Phase 7. 
   Pipeline : Sonnet 4.6 + Opus 4.7 (rewrite si validation < 7.5).
   Date de production : avril 2026.*
   ```

2. **Format homogène entre les 4 dossiers épisodes** :
   - Vérifier que les 4 dossiers ont la même structure (5 fichiers chacun)
   - Vérifier que les noms de fichiers suivent le même pattern (01, 02, 03, 04, 05)
   - **AUTO-FIX** : renommer si écarts détectés

3. **Footer cohérent** :
   - Tous les livrables doivent avoir un footer indiquant : "Pack pilote Sillon — version 2026-04-30"
   - Retirer les footers techniques internes type "Final source : opus-rewrite-1 · score : 8.1/10 · degraded : false" (info interne, pas pour Stefani)

   **AUTO-FIX** : remplacer les footers internes par un footer standardisé :
   ```
   ---
   *Sillon — production éditoriale cross-corpus écosystème Orso.*
   ```

## ORDRE D'EXÉCUTION POLISH

### Étape 1 — Vérifications préalables (5 min)

```bash
pwd
git branch --show-current  # master
git status
git log -1 --oneline  # 17ed6cc ou descendant
npm test  # 572/572 attendus

# Vérifier pack pilote
ls experiments/autonomy-session-2026-04-28/pack-pilote-stefani-orso/
# Doit contenir : README.md + 4 sous-dossiers (Plais, Boissenot, Nooz, Veyrat)

# Vérifier transcripts disponibles pour anti-hallucination check
ls experiments/autonomy-session-2026-04-28/transcripts/
```

### Étape 2 — Correction 1 (anti-hallucination chiffres) [15 min]

Exécuter les 4 grep + reporter résultats. Auto-fix ou stop selon résultats.

### Étape 3 — Correction 3 (titre "[EXTRAIT]") [10 min]

Query BDD + auto-fix si clair, sinon stop pour Jérémy.

### Étape 4 — Correction 4 (mention Orso Veyrat) [5 min]

Auto-fix.

### Étape 5 — Correction 5 (polish L1 — retrait Plais moment 3) [10 min]

Auto-fix retrait moment Covid Plais L1. Vérification autres épisodes.

### Étape 6 — Correction 7 (cohérence pack) [20 min]

Auto-fix : README, footers standardisés, format homogène.

### Étape 7 — Correction 2 (fix Nooz L3 polluée) — STOP propositions [15 min]

Génération propositions (cap $0.10 Sonnet). STOP partiel pour validation Jérémy.

**STOP intermédiaire 1** : 

```
POLISH — STOP INTERMÉDIAIRE 1 — Validation Jérémy requise

Corrections auto-appliquées (réversibles via git) :
- Correction 1 (chiffres) : N vérifiés / N hallucinations détectées
- Correction 3 (titre EXTRAIT) : ✅ ou ❌ + détail
- Correction 4 (mention Orso Veyrat) : ✅
- Correction 5 (Plais L1 moment 3 retiré) : ✅
- Correction 7 (cohérence pack) : ✅ + détail

Correction 2 — Nooz L3 polluée — propositions à valider :
[3 propositions A/B/C]

Quel choix ? A / B / C / autre formulation ?
```

### Étape 8 — Correction 6 (polish L2 quotes) — STOP propositions [20 min]

Génération propositions quotes manquantes (cap $0.30 Sonnet). STOP pour validation Jérémy.

**STOP intermédiaire 2** :

```
POLISH — STOP INTERMÉDIAIRE 2 — Validation Jérémy requise

Quotes manquantes propositions :

PLAIS — quote 1 timestamp invalide :
- Vrai timestamp trouvé dans transcript : XX:XX
- Auto-fix proposé : remplacer 00:00 par XX:XX

BOISSENOT — 2 quotes manquantes :
- Proposition A : "..." (timestamp XX:XX) + justification
- Proposition B : "..." (timestamp XX:XX) + justification
- Proposition C : "..." (timestamp XX:XX) + justification
- Lesquelles garder ?

NOOZ — 1 quote manquante :
- Proposition A : "..."
- Proposition B : "..."
- Proposition C : "..."
- Laquelle garder ?

Validation Jérémy avant application.
```

### Étape 9 — Application des fixes validés Jérémy + tests + STOP final [15 min]

Application des fixes Corrections 2 et 6 selon validation Jérémy.

```bash
npm test  # 572/572 toujours verts
git status
```

**STOP final Polish** :

```markdown
# STOP Polish pré-envoi — verdict : READY / PARTIAL / BLOCKED

## Verdict global
N corrections appliquées (auto + validées Jérémy) sur 7 prévues.

## Détail par correction

| Correction | Mode | Statut |
|---|---|---|
| 1. Anti-hallucination chiffres | AUTO | ✅ ou détail |
| 2. Nooz L3 polluée | Validation J | ✅ ou détail |
| 3. Titre [EXTRAIT] Boissenot | AUTO | ✅ ou détail |
| 4. Mention Orso Veyrat | AUTO | ✅ |
| 5. Plais L1 moment 3 retiré | AUTO | ✅ |
| 6. L2 quotes complétées | Validation J | N livrables corrigés sur N |
| 7. Cohérence pack | AUTO | ✅ |

## Findings nouveaux Polish (si applicable)

## Cumul session
- Sonnet Polish : $X.XX
- Opus Polish : $X.XX (probablement 0)
- Total Polish : $X.XX / $2.00
- Total session cumulé : $X.XX / $17.50

## État repo
- Tests : N/M verts
- Régression : aucune
- Working tree : prêt à commit ou commité
- Master : [SHA]

## Pack pilote final
- Localisation : experiments/autonomy-session-2026-04-28/pack-pilote-stefani-orso/
- Contenu : 4 épisodes × 5 livrables = 20 fichiers + README.md
- Tests qualité passés : oui
- Vérifications anti-hallucination : oui

## Recommandation pour Jérémy

- Si polish READY : "Pack pilote prêt pour envoi. Email à rédiger 
  selon draft, envoi possible 15-17/05."
  
- Si polish PARTIAL : "N corrections appliquées, M en attente. 
  Décision Jérémy attendue pour finaliser."

- Si polish BLOCKED : "Findings critiques détectés. Hypothèses : ..."
```

## DISCIPLINE TRANSVERSALE POLISH

- Ne PAS toucher aux livrables Stefani-grade (8/10+) sauf si erreur factuelle
- Ne PAS chercher à élever ce qui est seulement acceptable
- Ne PAS lancer de rewrites Opus sauf si Correction 2 le nécessite
- Préserver le format strict des livrables (timestamps, structure markdown, etc.)
- Auto-fix réversibles via git uniquement (pas de modification destructive)

GO Étape 1 → 2 → 3 → 4 → 5 → 6 → 7 (STOP intermédiaire 1) → 8 (STOP intermédiaire 2) → 9 (STOP final).
