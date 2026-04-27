# Brief Claude Code — Phase 7a : formats de sortie pro + architecture V2-ready

> Mission : transformer les livrables Markdown sandbox en formats pro (docx + xlsx) avec architecture extensible pour V2
> Branche : `feat/output-formats` (séparée de master, merge si PASS)
> Précédent : Pack pilote Polish READY (572/572 tests, master `aad8397`)

## CONTEXTE PHASE 7A

Le pack pilote actuel est en sandbox Markdown gitignored. Pour l'envoi à Stefani/Christofer, les formats Markdown ne sont pas exploitables directement (équipe Orso ne va pas ouvrir des .md dans VSCode).

Phase 7a transforme les livrables en formats pro adaptés à chaque type :
- L1 Key moments → **xlsx** (tableau timestamps, exploitable par community manager)
- L2 Quotes → **xlsx** (tableau plateforme + texte + timestamp)
- L3 Cross-refs → **docx** (lecture éditoriale)
- L4 Newsletter → **docx** (édition collaborative)
- L5 Brief annexe → **docx**

Architecture **V2-ready** : prévoir l'extension future à pdf + markdown + intégration UI sans refactoring.

## CAPS NON-NÉGOCIABLES PHASE 7A

1. **Cap qualité** : aucune dégradation du contenu. Les formats pro doivent reproduire fidèlement le contenu Markdown.

2. **Cap budget Phase 7a** : $0 LLM. Aucun appel Sonnet/Opus nécessaire — uniquement transformation format. Budget reservé pour vérification anti-hallucination si besoin : $0.20.

3. **Cap discipline anti-régression** : 572/572 tests verts maintenus + nouveaux tests formats.

4. **Cap timing** : 2.5 jours dev + 0.5 jour polish/tests = 3 jours wall max.

5. **Cap fail-safe** : branche `feat/output-formats`, master jamais touché tant que PASS confirmé.

## ARCHITECTURE V2-READY (5 DÉCISIONS)

### Décision 1 — outputFormats avec dispatcher

Créer `engine/output/formats/` avec :

```
engine/output/formats/
├── types.ts              # interface OutputFormatter
├── markdownFormatter.ts  # déjà existe (l'actuel)
├── docxFormatter.ts      # nouveau V1
├── xlsxFormatter.ts      # nouveau V1
├── pdfFormatter.ts       # placeholder V2 (skeleton + throw "not implemented")
└── dispatcher.ts         # route livrable → formatter selon config
```

Interface :
```typescript
export interface OutputFormatter {
  readonly format: 'markdown' | 'docx' | 'xlsx' | 'pdf';
  readonly supportedLivrables: LivrableType[];
  
  formatLivrable(
    livrable: Livrable, 
    context: FormatterContext
  ): Promise<FormatterOutput>;
}

export interface FormatterOutput {
  filename: string;        // ex: "01-key-moments.xlsx"
  buffer: Buffer;          // contenu binaire
  mimeType: string;
}
```

Le dispatcher lit la config client `outputFormats` et invoque les bons formatters :

```typescript
// clients/stefani-orso.config.ts
outputFormats: {
  L1_keyMoments: 'xlsx',
  L2_quotes: 'xlsx',
  L3_crossRefs: 'docx',
  L4_newsletter: 'docx',
  L5_briefAnnexe: 'docx',
  // V2 prévu : permettre array ['xlsx', 'docx'] pour multi-format simultané
}
```

### Décision 2 — outputChannels avec interface

Créer `engine/output/channels/` avec :

```
engine/output/channels/
├── types.ts              # interface OutputChannel
├── localZipChannel.ts    # V1 unique implémentation
├── driveChannel.ts       # placeholder V2 (skeleton + throw)
└── index.ts              # registry
```

Interface :
```typescript
export interface OutputChannel {
  readonly id: string;
  readonly description: string;
  
  publish(
    pack: ProductionPack,
    config: ChannelConfig
  ): Promise<PublishResult>;
}

export interface PublishResult {
  success: boolean;
  location: string;        // path local ou URL distante
  metadata?: Record<string, unknown>;
}
```

V1 utilise `LocalZipChannel` qui produit un .zip dans `output/packs/{client}-{date}.zip`.

### Décision 3 — ConfigLoader avec interface

Créer `engine/config/loaders/` avec :

```
engine/config/loaders/
├── types.ts              # interface ConfigLoader
├── fileLoader.ts         # V1 - lit clients/*.config.ts
└── index.ts              # registry pour ajouts futurs (ex: dbLoader V2)
```

Interface :
```typescript
export interface ConfigLoader {
  readonly source: 'file' | 'db' | 'api';
  
  loadClientConfig(clientId: string): Promise<ClientConfig>;
  listClients(): Promise<string[]>;
}
```

### Décision 4 — Séparation API/CLI (à vérifier, déjà OK normalement)

**Action de vérification** : confirmer que la logique de production de pack est dans une fonction `produceClientPack(clientId, options): Promise<ProductionPack>` exportée depuis le core engine, et que la CLI n'est qu'un wrapper de cet appel.

Si la séparation existe déjà : note dans le STOP que c'est déjà conforme V2-ready.

Si la séparation n'existe pas : extraire la logique dans une fonction core, la CLI devient un thin wrapper.

### Décision 5 — Auth (V2, ne rien préparer)

Skip. Pas d'anticipation.

## SPEC FORMATS PAR LIVRABLE

### L1 Key moments — xlsx

Onglet unique "Key moments" avec colonnes :
- Numéro (1-5)
- Titre du moment
- Timestamp début (mm:ss)
- Timestamp fin (mm:ss)
- Saliency (0.0-1.0)
- Quote / extrait
- Pourquoi c'est saillant
- Lien vidéo (placeholder pour Phase 7b, vide en V1 hors vidéo) ← **prévoir colonne**

Header : couleur de fond cohérente (#1F4E79 par exemple, cohérent avec brand)
Police : Calibri 11
Largeurs colonnes adaptées (timestamps ~80px, contenu textuel ~400-600px)

### L2 Quotes — xlsx

Onglet unique "Quotes" avec colonnes :
- Numéro (1-5)
- Citation verbatim
- Auteur (invité)
- Timestamp (mm:ss)
- Plateformes suggérées (Twitter / LinkedIn / Instagram, séparées par virgule)
- Pourquoi cette citation
- Lien micro-clip vidéo (placeholder Phase 7b) ← **prévoir colonne**

Format identique à L1 (cohérence visuelle pack).

### L3 Cross-refs by lens — docx

Format Word professionnel :
- Titre H1 : nom de l'épisode
- Sous-titre : phrase d'introduction
- Pour chaque lens activé :
  - H2 : "Si vous avez aimé l'angle [lens]"
  - Description courte du lens
  - Pour chaque cross-ref :
    - H3 : numéro + titre épisode + invité (avec lien vers podcast si dispo)
    - Paragraphe "Pourquoi pertinent" 
    - Paragraphe "Pourquoi un RAG mono-source ne trouve pas ça"
- Section finale : note sur lens skippés (avec gate intelligent)

Police : Calibri, taille 11 corps, 14 H3, 16 H2, 20 H1
Marges 1 pouce A4
Footer : numéro de page + "Sillon — Pack pilote — [date]"

### L4 Newsletter — docx

Format Word "article édito" :
- Titre H1 : titre de la newsletter (préservé du markdown)
- Corps en paragraphes formatés
- Citations en italique avec retrait
- Mots en gras préservés
- Pas de TOC (article court ~400 mots)
- Footer minimaliste : "Sillon — newsletter générée"

Police : Calibri 11
Espacement paragraphes : 1.5 ligne pour lecture confortable
Marges 1 pouce A4

### L5 Brief annexe — docx

Format Word "brief synthèse" :
- Titre H1 : "Brief annexe — Cross-catalogue Orso pour [épisode]"
- Phrase d'intro
- Pour chaque section lens :
  - H2 : nom du lens
  - Paragraphes corps
- Footer minimaliste

Format compact, optimisé pour lecture rapide (~1-2 pages).

## ORDRE D'EXÉCUTION PHASE 7A

### Étape 1 — Vérifications préalables + branche (15 min)

```bash
pwd
git branch --show-current  # master attendu
git status  # clean
git log -1 --oneline  # aad8397 ou descendant
npm test  # 572/572 attendus

# Créer branche feature
git checkout -b feat/output-formats
git status
```

### Étape 2 — Setup architecture V2-ready (3h)

1. Créer arborescence `engine/output/formats/` et `engine/output/channels/`
2. Définir interfaces TypeScript (Décisions 1, 2, 3)
3. Implémenter MarkdownFormatter (refactor de l'existant si besoin)
4. Implémenter LocalZipChannel
5. Vérifier séparation API/CLI (Décision 4)
6. Tests unitaires interfaces (12+ tests)

`npm test` → 584+/584+ verts

### Étape 3 — Implémentation DocxFormatter (1 jour)

Utiliser la skill docx disponible (cf. `/mnt/skills/public/docx/SKILL.md`).

1. Lire la skill docx complète avant tout dev
2. Implémenter DocxFormatter pour L3, L4, L5
3. Définir styles cohérents (couleurs brand, polices, marges)
4. Gérer les éléments markdown : titres, paragraphes, gras, italique, citations, listes
5. Tests : 9 tests (3 livrables × 3 épisodes test)

Critère qualité :
- Le contenu Markdown source est intégralement préservé
- Le formatting visuel est pro (pas brutal sans styling)
- Le fichier passe la validation docx (script de skill)

### Étape 4 — Implémentation XlsxFormatter (0.5 jour)

Utiliser la skill xlsx disponible (cf. `/mnt/skills/public/xlsx/SKILL.md`).

1. Lire la skill xlsx avant dev
2. Implémenter XlsxFormatter pour L1, L2
3. Headers stylés (couleur, gras, freeze)
4. Largeurs de colonnes adaptées
5. **Inclure colonnes "Lien vidéo / micro-clip"** vides en V1, prêtes pour Phase 7b
6. Tests : 6 tests (2 livrables × 3 épisodes test)

### Étape 5 — Placeholders V2 (1h)

1. Créer `pdfFormatter.ts` qui throw `NotImplementedError("PDF format scheduled for V2")`
2. Créer `driveChannel.ts` qui throw idem
3. Tests : 2 tests confirmant que les placeholders throw correctement
4. Documentation inline expliquant le scope V2

### Étape 6 — Intégration pipeline (1h)

1. Modifier le script de production pack pour utiliser le dispatcher
2. Config `clients/stefani-orso.config.ts` : ajouter `outputFormats` selon spec
3. Le pack final devient un .zip contenant : 4 dossiers épisodes × 5 fichiers (.docx ou .xlsx) + README.md + Index.xlsx (Q4 si décidé, sinon README seul)
4. Tests d'intégration : 4 tests (1 par épisode pilote → vérifier pack généré)

### Étape 7 — Génération pack pilote final V2 (30 min)

1. Re-générer le pack pilote complet sur les 4 épisodes en utilisant les nouveaux formatters
2. Stocker dans `experiments/autonomy-session-2026-04-28/pack-pilote-stefani-orso-v2/`
3. Vérifier visuellement : ouvrir 2-3 docx + 2-3 xlsx pour validation manuelle
4. Logger le pack final + ZIP

### Étape 8 — Tests de cohérence anti-régression (30 min)

1. Diff manuel rapide : le contenu textuel des nouveaux formats correspond-il au markdown source ?
2. Vérifier qu'aucune régression sur les 572 tests existants
3. `npm test` final

### Étape 9 — STOP Phase 7a (15 min)

Format STOP :

```markdown
# STOP Phase 7a — verdict : READY / PARTIAL / FAIL

## Verdict global
N/5 livrables types convertis avec succès en formats pro

## Implémentation V2-ready
- Décision 1 (outputFormats dispatcher) : ✅ ou détail
- Décision 2 (outputChannels interface) : ✅ ou détail
- Décision 3 (ConfigLoader interface) : ✅ ou détail
- Décision 4 (séparation API/CLI) : ✅ déjà conforme / ✅ refactoré / ❌
- Décision 5 (Auth V2) : N/A

## Formatters implémentés
- MarkdownFormatter : ✅ (existant ou refactoré)
- DocxFormatter : ✅ + N tests verts
- XlsxFormatter : ✅ + N tests verts
- PdfFormatter (placeholder V2) : ✅ throw NotImplementedError
- (futur) : DriveChannel placeholder ✅

## Pack pilote V2 produit
- Localisation : experiments/autonomy-session-2026-04-28/pack-pilote-stefani-orso-v2/
- Contenu : 4 dossiers épisodes × 5 fichiers (docx ou xlsx) + ZIP
- Validation manuelle : 2-3 docx ouverts + 2-3 xlsx ouverts (tu rapportes ce que tu as vu)
- Cohérence contenu : préservé / dégradé / signalé

## Tests
- Tests cumulés : N/M verts (delta : +N nouveaux tests Phase 7a)
- Régression : aucune
- Skills docx + xlsx utilisées : oui

## Cumul session
- Sonnet/Opus Phase 7a : ~$0 (pas d'appel LLM nécessaire)
- Total session cumulé : ~$6.55 / $17.50

## État repo
- Branche : feat/output-formats
- Commits sur la branche : N
- Master : aad8397 inchangé
- Working tree branche : clean

## Recommandation pour Jérémy

- Si Phase 7a READY franchement : "Pack V2 généré, validation manuelle 
  à faire par Jérémy avant merge sur master. Phase 7b vidéo peut 
  démarrer après merge."

- Si Phase 7a PARTIAL : "lesquels formats résistent, hypothèses, 
  options pour V7a-bis ou descope."

- Si Phase 7a FAIL : "diagnostic du problème structurel, options 
  pour rollback de la branche."

Pas d'auto-merge sur master. Pas d'auto-démarrage Phase 7b.
```

## DISCIPLINE TRANSVERSALE PHASE 7A

- **Branche `feat/output-formats` exclusivement**, master jamais touché
- **Lire les skills docx + xlsx en début de mission** (obligatoire avant dev)
- **Pas de modification du contenu** des livrables — uniquement transformation format
- **Pas d'appel LLM** sauf si vraiment nécessaire (devrait être 0)
- **Pas de dépendances npm exotiques** : utiliser docx-js et xlsx (SheetJS) standard
- Cap timing strict : 2.5 jours dev + 0.5 jour tests/polish

## PROCÉDURE EN CAS D'ÉCHEC

Si à mi-parcours (Étape 4 ou 5) tu identifies un blocker majeur :

1. **STOP immédiat** sans continuer
2. Documenter le blocker dans le STOP (cause, effort estimé pour fix)
3. Ne pas merger la branche
4. Master `aad8397` reste l'état stable, le pack pilote actuel reste envoyable

Cas typiques de blocker :
- docx-js produit du XML invalide non corrigeable
- xlsx (SheetJS) crash sur les caractères français accentués
- Performance inacceptable (>5s par livrable)
- Tests régression sur les 572 baseline

## FALLBACK EXPLICITE

**Si la branche feat/output-formats est mergée avant le 17/05** : Phase 7b vidéo peut démarrer.

**Si la branche échoue ou prend trop de temps (au-delà de fin de semaine 02-03/05)** : merge ce qui marche, on envoie le pilote avec :
- Pack actuel Markdown si rien ne marche
- Pack mixte (docx OK + xlsx OK + markdown pour ce qui résiste) si partiel

L'objectif est de **ne jamais bloquer l'envoi 17-20/05** par cette feature. Le pilote actuel est envoyable. Les améliorations Phase 7a sont un bonus, pas un prérequis.

GO Étape 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9.
