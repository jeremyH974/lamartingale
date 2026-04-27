# Sillon — Backlog stratégique des idées produit

> Référentiel de priorisation des idées identifiées pour la suite de Sillon
> Source : conversation stratégique 26-30 avril 2026 + retours session marathon V1-V5 + Phase 6 + Phase 7a/7b
> Statut : référentiel évolutif. À relire au moment du retour Stefani.
> **NE PAS engager de développement à partir de ce document sans décision explicite par phase.**

---

## Posture méthodologique

Ce backlog classe les idées en 4 catégories selon leur **maturité de validation**, pas leur "intérêt" perçu. Une idée "intéressante" mais non validée par un signal client réel **ne devient pas action** simplement parce qu'elle est intéressante.

Les 4 catégories :

- **Catégorie A** — Validé, à intégrer Phase 8+ (action court-terme post-pilote)
- **Catégorie B** — Conditionnel au retour Stefani (déclencheur explicite requis)
- **Catégorie C** — Long-terme 12+ mois (exclus de l'action court-terme)
- **Catégorie D** — Probablement pas (gadgets ou hors-cible)

Ordre d'application stricte : on n'avance jamais sur une idée Catégorie B/C/D tant qu'une idée Catégorie A reste non implémentée et toujours pertinente après retour client.

---

## Catégorie A — Validé, à intégrer Phase 8+

> Idées dont le bénéfice produit est validé indépendamment du retour Stefani. À planifier après merge Phase 7a/7b.
> Total estimé : 4-5 jours de dev solo.

### A1 — Q1 Diarization audio (host vs invité)

**Problème résolu** : aujourd'hui Whisper transcrit sans distinguer qui parle. La liste noire phrases-fétiches de Stefani est une mitigation imparfaite (couvre les phrases connues, pas les nouvelles tournures Stefani-style mal attribuées). Risque structurel d'attribuer une phrase Stefani à un invité dans une quote ou un key moment.

**Solution technique** :
- Ajouter une étape post-Whisper avec pyannote-audio v3 OU whisperX
- Output : transcript enrichi avec speaker labels (SPEAKER_00, SPEAKER_01)
- Identification post-traitement : le speaker avec le plus de mots = host (Stefani sur GDIY/LM)
- Intégration dans le pipeline existant : tous les agents downstream (extractQuotes, etc.) reçoivent l'info speaker

**Coût estimé** : 1-2 jours dev + 1 jour intégration/tests + ré-génération transcripts 4 épisodes pilote

**Bénéfice** :
- Élimine 100% des risques d'erreur d'attribution (vs ~80-90% aujourd'hui)
- Base technique pour features futures : ratio temps de parole, segments d'interruption, transition speaker
- Argument différenciant vs Castmagic/NotebookLM (qui ne diarizent pas systématiquement)
- **Prérequis pour B5 (Transcript publié multi-plateformes)** — sans diarization, transcript publié = "block" indistinct

**Quand activer** : Phase 8 post-merge Phase 7a/7b, AVANT envoi pilote idéalement, sinon dans les 2 semaines post-envoi

**Dépendances** : aucune

**Risques** :
- pyannote-audio nécessite GPU (ou service hébergé) — vérifier coût infrastructure
- Latence ajoutée : 30-60s par épisode (acceptable)
- whisperX = wrapper qui combine Whisper + pyannote, plus simple à intégrer

### A2 — Q5 Fallback gracieux quand un lens ne match pas

**Problème résolu** : aujourd'hui quand aucun lens ne match (épisode atypique sortant de la ligne éditoriale habituelle), le pack contient des sections vides ou minimales sur les cross-refs. Mauvaise expérience utilisateur.

**Solution technique** :
- Détecter dans `lensClassificationAgent.ts` quand aucun lens n'atteint le seuil minimum
- Au lieu de retourner pack vide → générer un message éditorial structuré du type :
  > "Cet épisode aborde un angle nouveau dans votre catalogue : [résumé en 2 phrases]. Pas de cross-références fortes disponibles. Ce contenu pourrait devenir un point d'ancrage pour une future ligne éditoriale [lens X émergent suggéré par classification générique]."

**Coût estimé** : 2-3h dev + tests

**Bénéfice** :
- Transforme l'absence de matching en signal stratégique
- Évite la sensation "trou dans la livraison" pour 10-15% des épisodes atypiques
- Renforce le positionnement Sillon "éditeur" vs "outil"

**Quand activer** : Phase 8, après Q1 (diarization)

**Dépendances** : aucune

**Risques** : faible. Feature bornée, pas de risque de régression.

### A3 — Q2 Validation factuelle externe (version minimaliste)

**Problème résolu** : aujourd'hui l'anti-hallucination "grep dans transcript" vérifie que le chiffre/nom apparaît, pas qu'il est correct. Si l'invité dit "140 millions" en se trompant (voulait dire "14 millions"), Sillon reproduit l'erreur. Sur les noms d'entreprise, mêmes risques.

**Solution technique (version minimaliste validée)** :
- Validation des **noms propres invité** : appel Wikipedia API gratuit, vérifier que la personne existe avec un profil professionnel cohérent (entrepreneur/CEO/etc.)
- Validation des **noms d'entreprise** : check existence du domaine web (DNS lookup) + vérification basique site officiel
- **PAS** la validation des chiffres (impossible automatiquement, garde la QA humaine)
- **PAS** LinkedIn (API publique restreinte depuis 2024)
- **PAS** cross-référence presse (RAG web, complexité disproportionnée)

**Output** : note de bas de page automatique dans les livrables si incohérence détectée :
> "[Note Sillon] : nom 'XYZ Corp' non trouvé via vérification automatique. Vérifier orthographe ou validité avant publication."

**Coût estimé** : 4-6h dev (Wikipedia API + DNS lookup + intégration pipeline + tests)

**Bénéfice** :
- Couvre 60-70% des erreurs factuelles courantes (noms invité + entreprise) pour 50% du coût d'une validation complète
- Le reste passe par QA humaine pendant le pilote
- Transforme Sillon de "perroquet IA" en "assistant avec scrupule de vérification"

**Quand activer** : Phase 8 ou 9 après Q1 et Q5

**Dépendances** : aucune

**Risques** : 
- Wikipedia API rate limits (à vérifier, mais usage faible donc OK)
- Faux positifs (entreprise qui existe mais pas indexée) — gérés par message non-bloquant

---

## Catégorie B — Conditionnel au retour Stefani

> Idées dont la pertinence ne sera vérifiée qu'au retour Stefani sur le pilote. Activer SEULEMENT si signal explicite.

### B1 — D1 Studio éditorial collaboratif

**Description** : espace web où Stefani édite les livrables Sillon directement, accepte/rejette des suggestions, demande des reformulations à chaud.

**Déclencheur d'activation** : Stefani dans son retour mentionne "j'aimerais pouvoir éditer/itérer sur les livrables sans copier-coller dans Notion".

**Coût estimé si activé** : 4-6 semaines de dev V1 utilisable

**Risque** : grande dépendance à la spec Stefani. Sans déclencheur clair, c'est de la pré-modélisation.

**Note** : Le draft email pilote V2 (PS roadmap) signale cette direction. Si Stefani ne mentionne pas l'édition dans son retour, **ne pas le construire**.

### B2 — D2 Brief invité interactif pré-épisode

**Description** : page web interactive où Stefani peut, en préparation d'interview, poser des questions à chaud sur l'invité au catalogue indexé.

**Déclencheur d'activation** : Stefani dans son retour mentionne "j'aimerais pouvoir poser des questions au catalogue à chaud" OU "le brief est utile mais j'aurais besoin de creuser certaines pistes pendant la prép".

**Coût estimé si activé** : 7-10 jours dev pour V1 minimaliste (UI chat + wrapper agents existants)

**Risque** : Le doc stratégique antérieur sous-estime la complexité (gestion sessions, état, latence streaming, fallback erreurs). Estimation réelle 7-10 jours, pas 1-2 semaines.

**Note** : Idée séduisante mais nécessite validation client. Sans signal explicite, ne pas construire.

### B3 — D3 Dashboard rétention catalogue

**Description** : dashboard hebdomadaire montrant l'effet de Sillon sur la consommation profonde du catalogue (courbe de complétion, circulation entre épisodes, etc.).

**Déclencheur d'activation** : 
- Stefani accepte le partage des analytics Apple Podcasts Connect + Spotify for Podcasters
- ET demande explicitement à mesurer le ROI

**Coût estimé si activé** : 1-2 semaines dev (intégration APIs analytics + viz simple)

**Note** : Le draft email pilote V2 propose ce dashboard comme bonus conditionnel. Décision Stefani détermine l'activation.

### B4 — Positionnement business "SaaS premium 5-15k€/mois"

**Description** : positionnement pricing ET model commercial à acter (SaaS premium avec accompagnement vs pure SaaS vs service consultatif).

**Déclencheur d'activation** :
- Retour Stefani positif sur la valeur perçue
- Discussion explicite avec Stefani sur ce qu'il paierait, à quelle fréquence, pour quel scope
- Signal d'au moins 1-2 prospects supplémentaires (autres podcasters)

**Note** : Le doc stratégique antérieur tranche à 5-15k€/mois sur la base d'hypothèses non vérifiées. **Ne pas acter ce positionnement avant signal client réel**. Discussion à reprendre post-retour Stefani avec data réelle.

### B5 — Transcript publié multi-plateformes (SRT/VTT/JSON) ⭐ NOUVEAU

**Description** : génération automatique du transcript formaté pour publication directe sur les plateformes de podcast/vidéo (YouTube, Apple Podcasts Connect, Spotify, Acast). 

Formats à supporter :
- **SRT** (sous-titres standard, compatible YouTube)
- **VTT** (web standard, alternative SRT)
- **Apple Podcasts Connect JSON** (avec speaker labels)
- **Spotify JSON** (avec timestamps + speaker)
- **YouTube description block** (transcript brut formaté avec sauts par speaker)

**Déclencheur d'activation** : Stefani ou Christofer mentionne :
- "J'aimerais utiliser les transcripts pour [YouTube/Apple/Spotify]"
- "J'ai besoin de sous-titres pour mes épisodes"  
- "Je passe du temps à formater le transcript pour publier"
- "Le transcript serait utile en sortie de Sillon"

**Coût estimé si activé** : 1 jour dev (formatters multiples, transformation pure depuis transcript Whisper)

**Coût LLM** : $0 (pas d'appel LLM, juste transformation format)

**Dépendance** : **Q1 diarization (A1) est PRÉREQUIS** pour qualité publishable. Sans Q1, transcript = "block" indistinct sans labels speaker. À activer **uniquement après A1 livré**.

**Bénéfice si activé** : 
- Stefani gagne 30-60 min de retravail manuel par épisode
- Sillon devient "tout-en-un" pour la chaîne de publication
- Différenciation faible vs Castmagic (qui le fait déjà), mais commodité utile en pack premium

**Risque** : dilue le différenciateur cross-corpus. Castmagic/Descript font déjà ça. Si Stefani priorise ce livrable, signal qu'il valorise la commodité plus que le pivot Sillon — à creuser en RDV.

### B6 — Chapitrage horodaté ⭐ NOUVEAU

**Description** : génération automatique du chapitrage continu de l'épisode (5-12 chapitres avec titres et timestamps), format collable directement dans description YouTube ou Apple Podcasts.

Format de sortie type :
```
00:00 - Introduction
03:42 - L'arrivée chez Platform.sh
12:15 - Le pari du 100% remote
28:50 - Lever 140 millions sans bureau
...
```

**Différence avec Key moments (L1 existant)** :
- **Key moments** = 5 moments les plus saillants, durée variable, choisis pour impact viral
- **Chapitres** = découpage continu de l'épisode (chaque seconde dans un chapitre), titres orientés thématique

C'est un livrable distinct nécessitant un prompt LLM dédié au chapitrage.

**Déclencheur d'activation** : Stefani ou Christofer mentionne :
- "J'aimerais que mes épisodes soient chapitrés automatiquement"
- "Le chapitrage me prend du temps"
- "Je veux des chapitres YouTube/Apple Podcasts"
- "Mes auditeurs réclament des chapitres"

**Coût estimé si activé** : 2 jours dev (nouveau prompt + nouvel agent + formatter YouTube/Apple + tests régression)

**Coût LLM** : ~$0.20 par épisode (Sonnet pour chapitrage, validation Sonnet, rewrite Opus si <7.5)

**Dépendance** : aucune (pas besoin de Q1 diarization)

**Bénéfice si activé** :
- Gain de temps significatif pour l'équipe Orso (chapitrage manuel = 30-45 min par épisode)
- Améliore la consommation profonde du catalogue (auditeurs naviguent par chapitre)
- Synergie avec D3 Dashboard rétention (mesurer quels chapitres sont les plus écoutés)

**Risque** : qualité du chapitrage à valider — un bon chapitrage demande compréhension fine du flow narratif, pas juste découpage temporel. Premier livrable de chapitrage à QA humainement avant validation produit.

### B7 — Description SEO-optimisée multi-plateformes ⭐ NOUVEAU

**Description** : génération automatique de la description podcast/YouTube optimisée SEO, en 2 versions :
- **Version longue YouTube** (jusqu'à 5000 caractères) : hook + bullets sujets + invité + cross-refs + hashtags
- **Version courte Apple/Spotify** (max 4000 caractères) : version condensée

Structure type :
```
[Hook 2-3 phrases - les 200 premiers caractères critiques pour SEO]

Dans cet épisode :
• Sujet 1 (avec timestamp si chapitrage activé)
• Sujet 2
• Sujet 3
...

L'invité : [Nom] - [Bio courte] - [LinkedIn]

Pour aller plus loin dans le catalogue :
• [Cross-ref 1 - utilise les données existantes Sillon]
• [Cross-ref 2]

#hashtag1 #hashtag2 #hashtag3
```

**Déclencheur d'activation** : Stefani ou Christofer mentionne :
- "J'ai du mal à écrire les descriptions"
- "Je veux mieux référencer mes épisodes"
- "Mes descriptions ne sont pas optimisées SEO"
- "J'aimerais automatiser les descriptions Apple/Spotify"

**Coût estimé si activé** : 1 jour dev (nouveau prompt + agent + formatter + tests)

**Coût LLM** : ~$0.15 par épisode

**Dépendance** : 
- Cross-refs existants (déjà produits par Sillon) — utilisable directement
- B6 chapitrage : si activé, descriptions intègrent les timestamps chapitrés

**Bénéfice si activé** :
- Gain de temps : 15-30 min par épisode économisées
- Meilleur référencement SEO (keywords pertinents, structure standardisée)
- Cohérence cross-épisodes

**Risque** : Sillon entre frontalement en compétition avec les outils SEO podcast (Capsho, Castmagic, etc.). Le différenciateur Sillon = qualité du contenu et cross-corpus, pas SEO en soi.

### Note transversale B5/B6/B7 — "Identité produit"

L'activation simultanée de B5+B6+B7 transformerait Sillon de :

**Sillon V1 actuel** : "moteur cross-corpus pour valoriser ton catalogue podcast" (différenciateur unique)

**Sillon + B5/B6/B7** : "assistant complet de production-publication podcast" (concurrence frontale Castmagic/Descript/Capsho)

**Implication stratégique** : si le retour Stefani priorise B5/B6/B7 plutôt que le pivot cross-corpus, c'est un **signal majeur** sur le positionnement produit. Ne pas activer aveuglément — discuter en RDV avec Stefani pour comprendre quel positionnement il valorise vraiment.

**Reco** : si déclencheur clair sur 1 des 3 → activer celui-là. Si déclencheur sur 2-3 → RDV obligatoire avant activation pour discuter positionnement business.

---

## Catégorie C — Long-terme 12+ mois

> Idées dont la pertinence est défendable mais qui demandent maturité produit + masse critique de clients. Exclus de l'action court-terme.

### C1 — Q3 Continuité éditoriale entre épisodes successifs

**Description** : window glissante 4-6 dernières semaines comme contexte privilégié, permettant des continuités narratives ("comme évoqué la semaine dernière avec...").

**Pourquoi long-terme** : nécessite un client qui produit régulièrement (1+ épisode/semaine sur plusieurs mois). Pré-modélisation classique sans data réelle.

**Quand reconsidérer** : 6-12 mois post-signature client #1

### C2 — Q4 Feedback loop tone profile

**Description** : système de feedback structuré post-livrable. Stefani édite, l'éditée est comparée à la générée, patterns d'édition extraits → tone profile évolutif.

**Pourquoi long-terme** : pour un feedback loop, il faut **des feedbacks**. Donc des éditions client. Donc un client en usage actif depuis plusieurs mois.

**Quand reconsidérer** : 6-12 mois post-signature client #1, après collecte de N éditions (N ≥ 20)

### C3 — D4 Générateur de pitch sponsor sur-mesure

**Description** : module activable qui prend en input "marque cible" et produit un deck PDF personnalisé exploitant le catalogue Orso.

**Pourquoi long-terme** : transforme Sillon de "outil contenu" à "outil commercial". Demande validation que Stefani vend des sponsors comme ça + calibration sur 1+ marques cibles + modèle économique distinct.

**Quand reconsidérer** : 12-18 mois post-signature, conditionnel à activation espace 3 (cf. ROADMAP_INTERNE.md)

### C4 — Intégrations plateformes hébergement (Acast, Ausha, Spreaker)

**Description** : récupération automatique des nouveaux épisodes via APIs hébergement.

**Pourquoi long-terme** : prématuré avant signature client #1. Construire l'intégration avant validation = peut-être maintenir une intégration que client #2 n'utilise pas.

**Quand reconsidérer** : après signature client #1, selon plateforme utilisée

### C5 — Intégrations post-prod (Descript, Riverside)

**Description** : import transcripts Descript, export key moments vers timeline Descript.

**Pourquoi long-terme** : même logique que C4. Construire selon ce que les premiers clients utilisent réellement.

### C6 — TTFV onboarding < 10 min (UX SaaS)

**Description** : onboarding où le client se connecte, donne son flux RSS, clique "Indexer", reçoit un livrable test en < 30 min.

**Pourquoi long-terme** : nécessite UI auth + dashboard + indexation auto, soit plusieurs semaines de dev. Pas pertinent avant scope SaaS multi-client.

**Quand reconsidérer** : 6-12 mois, lors de la transition vers "client #2-#5" si business model SaaS validé

### C7 — Principe transparence choix éditoriaux

**Description** : section "Pourquoi ces choix ?" expliquant lens activé, cross-refs choisies, angles préférés.

**Note** : déjà partiellement présent dans les livrables L3 ("Pourquoi pertinent" + "Pourquoi un RAG mono-source ne trouve pas ça"). À étendre marginalement Phase 9+ selon retour client.

### C8 — Mode "jumeau numérique" pour onboarding tone profile

**Description** : tone profile auto-appris depuis 3-5 derniers épisodes du nouveau client, validé/ajusté ensuite.

**Note** : C'est EXACTEMENT ce que `loadStyleCorpus` fait pour Stefani-Orso (6 newsletters indexées). À documenter comme **moat existant**, pas comme feature à construire. La généralisation à d'autres clients viendra naturellement quand client #2 arrivera.

---

## Catégorie D — Probablement pas (gadgets ou hors-cible)

> Idées rejetées explicitement. Ne pas allouer de temps de dev.

### D1 — D5 Carte cross-corpus interactive (D3.js viz)

**Pourquoi rejeté** : Le doc stratégique lui-même reconnaît "sans valeur opérationnelle directe, mais énorme valeur de pitch". C'est-à-dire : gadget joli pour vendre. Risque d'investir dans une feature "wow démo" qui n'apporte rien à l'usage quotidien.

**Cas d'exception** : si tu fais un jour des présentations live à investisseurs/journalistes, peut être pertinent. Pas de priorité avant.

### D2 — Multi-langue (EN, ES) avant signature client international

**Pourquoi rejeté** : pré-modélisation. Construire pour un cas d'usage hypothétique = effort maintenance permanent. Activer sur signal réel.

### D3 — Mobile app native, plugin WordPress, plugin Notion

**Pourquoi rejeté** : multiplication des surfaces sans valeur ajoutée. Le pack Sillon livré dans Drive/email est exploitable par tout outil. Pas de surface native nécessaire.

### D4 — Clipping vidéo automatique style OpusClip / Submagic

**Pourquoi rejeté** : espace commodifié et compétition forte. Sillon V1 (Phase 7b) ajoutera des clips bruts en sortie, suffisant. Aller au-delà = entrer dans une catégorie où on ne gagne pas.

### D5 — Q&A grand public style NotebookLM

**Pourquoi rejeté** : Sillon est B2B éditorial. Le Q&A grand public adresse les auditeurs finaux, pas les podcasteurs. Hors-cible.

---

## Comment utiliser ce backlog

### Quand consulter ce fichier

- **Au moment du retour Stefani** (15-30/05) : lire la Catégorie B en regard du retour pour identifier les déclencheurs activés
- **Avant tout démarrage d'une nouvelle phase de dev** : vérifier que la phase démarre sur Catégorie A ou Catégorie B activée, jamais directement Catégorie C/D
- **Lors de discussions stratégiques** (avec investisseur, prospect, ami dev) : utiliser comme référentiel pour ne pas dévier
- **Tous les 3 mois** : relecture critique pour reclasser éventuellement (B → A ou C → B selon évolution)

### Quand NE PAS utiliser ce fichier

- Pour pré-engager une roadmap timeline avec dates fixes (ce backlog n'engage pas)
- Pour rédiger un brief Claude Code de mission (les briefs se rédigent au moment de la mission, pas avant)
- Pour communication externe (Stefani, prospects, etc.) — c'est un référentiel interne

### Discipline anti-dérive

- Si une nouvelle idée arrive : la classer dans une des 4 catégories AVANT de la travailler
- Si une idée Catégorie C "remonte" en B ou A : nécessite un signal client explicite documenté
- Si tu te retrouves à raffiner une idée Catégorie D : c'est un signal de procrastination, à nommer

---

## Trace de mise à jour

| Date | Modification | Source |
|---|---|---|
| 2026-04-30 | Création initiale | Session marathon Sillon V1-V5 + Phase 6 + doc stratégique antérieur |
| 2026-04-30 | Ajout B5/B6/B7 (transcript publié, chapitrage, description SEO) | Discussion soirée 30/04 sur extension scope publication podcast |
| à venir | Mise à jour post-retour Stefani | Retour réel Stefani-Orso |
| à venir | Reclassement post-signature client #1 | Décision business |
