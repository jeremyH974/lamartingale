# Livrable 6 — Meta différenciabilité (synthèse simulation)

> Lecture : ~5 min. Écrit pour décider lundi matin de la trajectoire 6 jours suivants.

## Récap des 5 livrables (grille stricte recalibrée)

| # | Livrable | Note (grille stricte 1-10) | Verdict | Critère 5 différenciabilité | Itération nécessaire avant pilote ? |
|---|---|:--:|---|---|---|
| 1 | Key-moments (5 clips) | **7.0** | VIABLE | ❌ FAIL — intra-épisode | Mineure : fix typo schema `saliancy_score`, vérif noms propres (Whisper prompt param) |
| 2 | Quotes (5 cartes) | **6.5** | À ITÉRER | ❌ FAIL — intra-épisode | Modérée : calibration `platform_fit`, vérif verbatim contre transcript, ajout champ `author` |
| 3 | Newsletter (v2 405 mots) | **6.5** | À ITÉRER | ✅ PASS — cite 4 eps catalogue avec n° corrects | Majeure : 2 hallucinations factuelles ("100M vues", "Inès Benazouz" → vrai "Benazzouz"), CTA mal interprété |
| 4 | Titres alternatifs (3) | **6.0** | À ITÉRER | ⚠️ PARTIAL FAIL — `exploits_cross_corpus:true` claimed mais numéros eps **hallucinés** dans `if_cross_corpus` (Mathieu Blanchard #404 vs réel #300 ; Kilian Jornet #380 vs #178 ; Védrines #404 vs #519) | Majeure : fournir liste cross-corpus en contexte (le prompt 04 n'en avait pas, le 03 oui — d'où la divergence qualité) |
| 5 | Cross-refs (3 refs, 1 hors GDIY) | **7.5** | VIABLE | ✅ PASS — `why_mono_podcast_rag_cant_find_this` argumenté, finding honnête sur la zone faible LM/PP/Finscale | Mineure : reranker pourrait préférer CCG #46 Boille (vidéaste, d=0.40) à LP #258 Kikikickz (d=0.44) — mais l'analogie tirée Kikikickz est défendable éditorialement |

**Bilan brut** : 2/5 ≥ 7 (objectif brief 4/6 ≥ 7 → **non atteint**).
**Critère différenciabilité** : 2/5 PASS, 1/5 PARTIAL FAIL, 2/5 FAIL.

## Sur quels axes Sillon brille

1. **Cross-refs structurellement différenciables**. C'est l'agent pivot. Argumentation `why_mono_podcast_rag_cant_find_this` est solide, le finding honnête sur les zones faibles (creator economy YouTube quasi-dominée par GDIY dans le catalogue) renforce la crédibilité au lieu de la masquer. L'auditeur comprend immédiatement la valeur ajoutée vs un Q&A mono-podcast.

2. **Newsletter cross-enrichie**. Quand le prompt fournit la liste cross-corpus en contexte, Sonnet l'intègre proprement avec les numéros corrects et une cohérence narrative ("Mathieu Blanchard, son guide dans Kaizen, illustre cette approche cross-disciplinaire... De même, Kilian Jornet (#178), Mike Horn (#272) ou Benjamin Védrines (#519)..."). Un Q&A mono-podcast NotebookLM ne peut pas produire cette mise en perspective sans accès au catalogue 6 podcasts indexé.

3. **Pack 1 (brief invité MEDIUM-3 déjà en prod)** non testé dans cette simulation, mais reste l'argument commercial le plus différenciant — déjà validé sur Eric Larchevêque samedi (3×3 podcasts agrégés, briefMd Sonnet, 5+5+5 positions/quotes/questions). Sillon offre dès J-3 quelque chose qu'aucun mono-podcast ne peut faire.

## Sur quels axes Sillon est en parité avec Q&A mono-podcast

1. **Key-moments**. La sélection des 5 moments clippables ne dépend que du transcript de l'épisode courant. NotebookLM ferait probablement 6-7/10 sur ce livrable, équivalent. Le seul edge possible serait de **scorer les moments à l'aune du catalogue** (ex: "ce moment résonne avec X autres clips déjà publiés sur GDIY → peut-être saturé éditorialement"). Pas tenté ici, gisement post-démo.

2. **Quotes sociales**. Idem. Sélection intra-transcript. Edge possible : croiser avec un index des "quotes déjà sorties par GDIY/Stefani sur LinkedIn/X" pour éviter les redites — mais c'est une donnée externe, pas catalogue.

3. **Titres alternatifs**. Le format actuel produit des titres qui exploitent le contenu de l'épisode. Le `exploits_cross_corpus:true` est aujourd'hui une post-rationalisation hallucinée, pas une fonctionnalité. Pour un PASS strict il faudrait soit (a) injecter la liste cross-corpus dans le prompt (cf. newsletter qui le fait correctement), soit (b) accepter que les titres restent intra-épisode et ne pas claim de différenciabilité.

## 3 propositions d'angles éditoriaux où Sillon serait DÉFINITIVEMENT supérieur (guide pour primitives lundi)

### Angle 1 — "Auditeur-aware quote dedup"
**Idée** : croiser les quotes proposées Pack 2 avec un index des extraits déjà publiés sur les réseaux GDIY/Cosa Vostra des 12 derniers mois, pour proposer en priorité **des phrases inédites du catalogue** (pas des reformulations de ce que Stefani a déjà clippé sur Instagram/TikTok).
**Edge Sillon** : nécessite l'accès au catalogue + un index sortants (à construire en primitive lundi : `social_clips_published` table optionnelle, ou simple grep sur descriptions Apple/Spotify).
**Pourquoi NotebookLM ne peut pas** : pas d'accès aux sortants externes ni au catalogue cross-podcast.

### Angle 2 — "Cross-pod thematic resonance score"
**Idée** : pour chaque key-moment proposé, ajouter un `thematic_resonance` qui chiffre combien de fois ce thème (discipline, prise de risque, casser-codes-distribution, recrutement-potentiel) a été couvert dans le catalogue 6 podcasts et par quels invités. Si un thème est saturé → reprioriser un moment moins clippé. Si un thème est rare → mettre en avant comme **angle éditorial unique**.
**Edge Sillon** : exploite directement `episodes_enrichment.embedding` + classification thématique cross-tenant (déjà en place pour 5/6 podcasts en mode `predefined`).
**Pourquoi NotebookLM ne peut pas** : nécessite indexation cross-corpus + classification thématique cohérente.

### Angle 3 — "Auditor-mode brief annexe : revoir cet épisode après l'écoute"
**Idée** : à la fin du Pack 2, livrer un mini-brief 1 page "**Pour aller plus loin chez nous**" — listing 5-7 épisodes du catalogue qui prolongent les thèmes de l'épisode courant, classés par lens éditorial (pas par similarité brute). Pour Inoxtag : "Si vous avez aimé l'angle expedition → écoutez Mike Horn #272 + Mathieu Blanchard #300 + Védrines #519. Si vous avez aimé l'angle creator economy → écoutez Tibo InShape #485 + Amixem #522 + Hugo Travers #240. Si vous avez aimé l'angle prise de risque créative → écoutez Kikikickz LP #258 + Matthias Dandois #425."
**Edge Sillon** : c'est essentiellement une extension du livrable cross-refs (qui marche déjà) + classification éditoriale par lens. Un Q&A mono-podcast ne peut **par construction** pas le faire.
**Bonus business** : ce livrable annexe **augmente la rétention catalogue** chez l'auditeur, ce qui est la vraie KPI Stefani — c'est l'argument à mettre en avant dans le mail du 06/05 (au-delà de "vous gagnez du temps", c'est "vous augmentez la rétention catalogue cross-podcast").

## Verdict simulation

**VIABLE AVEC AJUSTEMENTS** pour le Pack 2 du pilote 4 épisodes.

Détail :

- **Whisper API** : ✅ qualité acceptable (transcript 156k chars, 3618 segments, $0.857). Validé pour primitive sous deux conditions :
  - prompt param avec noms propres invité (ce run : "Inoxtag" jamais reconnu, à fixer).
  - split avec overlap 5s pour réduire pertes mid-phrase aux boundaries.

- **Pack 2 livrables 1-2 (key-moments, quotes)** : ✅ techniquement faisables, qualité 6.5-7 stable. **NE PAS les vendre comme différenciants** — ce sont des commodities qu'un assistant Q&A produit aussi. Les positionner dans l'offre comme "table-stakes" à côté des vrais arguments différenciants.

- **Pack 2 livrables 3-4 (newsletter, titres)** : ⚠️ **dépendent strictement de l'injection cross-corpus dans le prompt**. Quand fournie (newsletter v2) → PASS différenciabilité avec 1 itération. Quand absente (titres) → hallucinations dangereuses (numéros eps inventés). Lundi : standardiser que tout livrable Pack 2 a accès au context cross-corpus structuré dans son prompt système.

- **Pack 2 livrable 5 (cross-refs)** : ✅ **agent pivot validé**. C'est le livrable qui doit porter l'argument commercial Stefani. Justifie l'edge Sillon mieux que tous les autres réunis.

- **Pack 2 livrable 6 — Brief annexe "pour aller plus loin"** (proposition Angle 3 ci-dessus) : à **ajouter à l'offre pilote** comme 7e livrable. Coût marginal négligeable (extension cross-refs), valeur narrative énorme.

## Recommandation Brief A vs Brief B lundi

**Brief A (engagement 6-8 jours)** — VALIDÉ avec ajustements.

- Garder le scope 7 nouveaux agents + 2 pipelines orchestrators.
- **Ajouter** Angle 3 ("brief annexe pour aller plus loin") au Pack 2 — coût marginal négligeable, valeur différenciante massive.
- **Réordonner les priorités primitives lundi** :
  1. `crossRefsAgent` + `pourAllerPlusLoinAgent` (extension) — l'agent pivot. À shipper en J1-J2.
  2. `whisperPrimitive` avec prompt param + overlap 5s — J2-J3.
  3. `newsletterAgent` avec injection cross-corpus obligatoire dans le prompt système — J3.
  4. `keyMomentsAgent` + `quotesAgent` (commodities, pas critique en différenciabilité) — J4.
  5. `titlesAgent` avec injection cross-corpus identique à newsletter — J4.
  6. Pipelines orchestrators (J-3 / J+1) — J5-J6.
  7. Buffer test pilote E2E sur 2e épisode test (Tibo InShape #485 ou Amixem #522 — déjà identifiés similarité haute) — J7-J8.

**Brief B (rétrograder pilote 2 eps + Pack 1 only)** — non recommandé.

- Le Pack 1 (brief invité cross-corpus) est déjà validé en prod (MEDIUM-3 Larchevêque). Le restreindre à Pack 1 = pas de proposition de service, juste une démo glorifiée.
- L'argument commercial Stefani repose sur "vous interagissez 12 fois avec l'outil" → impossible avec Pack 1 only.
- Si le pilote rétrograde, le risque est de signaler à Stefani qu'on n'est pas confiants dans la production opérationnelle → effet inverse de l'objectif.

## Risques identifiés non anticipés (pour brief lundi)

1. **Hallucination numéros d'épisodes quand cross-corpus absent du prompt système** (titres). Trivialement fixable mais à standardiser.
2. **Hallucinations factuelles "100M vues"** dans la newsletter v2. Sonnet 4.6 invente des chiffres ronds quand le transcript est ambigu. Mitigation : interdire dans le prompt système toute citation chiffrée non strictement présente dans le transcript fourni.
3. **Whisper ne reconnaît pas les pseudos d'invités** (Inoxtag → 0x). Critique pour la précision des verbatims et l'attribution des quotes. Fix prompt param.
4. **Catalogue zone faible "creator economy YouTube" hors-GDIY**. Pour 4 invités Stefani potentiels, anticiper que les cross-refs hors-GDIY pourraient être tirées par les cheveux si l'invité est très niché — finding honnête à intégrer aux briefs livrés.
5. **Cap latence Whisper** : 9 min série pour 2h22 audio. Pour un pilote 4 épisodes × ~2h, soit ~8h audio à transcrire, on cumule ~36 min série. Acceptable mais à paralléliser si pilote scale au-delà.
6. **Coût total simulation** : ~$1.42 ($0.857 Whisper + $0.560 Sonnet 1-3 + $0.262 Sonnet v2+4+5). Pour un pilote 4 eps × 7 livrables, projection $5-8 par cycle Pack 2, soit ~$30 total pilote. Largement tenable.
