# Audit naming "auditeur" → "production" — Rapport Phase 1

> Audit naming "auditeur" → "production" mené le 2026-04-27 en réponse à
> un finding du verdict validation persona (Stefani lit "auditeur" →
> territoire NotebookLM/Q&A, alors que la valeur Sillon est côté
> production éditoriale). Méthodologie complète et 8 remplacements
> appliqués sur la branche `pilot-naming-audit` (commits `c615c46`,
> `c3091eb`, `4fa881d`).

---

> Audit lecture seule conduit le 2026-04-27 sur master `df04433`, branche
> `pilot-naming-audit`. Aucun fichier source modifié. Patterns scannés :
> `auditeur`, `audience`, `auditeurs` (case-insensitive).

## Résumé exécutif

- **Total occurrences trouvées** : 62 (sur 31 fichiers)
- **Bucket 1 (remplacement direct)** : 2 occurrences sur 2 fichiers
- **Bucket 2 (reformulation contextuelle, à valider)** : 5 occurrences sur 4 fichiers
- **Bucket 3 (à laisser tel quel)** : 55 occurrences sur 27 fichiers
- **Fichiers les plus chargés (top 3)** :
  1. `docs/_draft-email-orso-matthieu.md` — 6 occurrences (toutes Bucket 3, posture "auditeur de longue date" du pitch)
  2. `docs/PERSONAS_ORSO.md` — 6 occurrences (toutes Bucket 3, vocabulaire pitch + KPIs métier)
  3. `experiments/persona-validation/REPORT.md` — 6 occurrences (4 Bucket 3 analyse meta + 2 Bucket 2 titres angles historiques)

**Lecture clef** : la quasi-totalité des occurrences (89%) désignent
légitimement l'auditeur final ou des champs DB/métadonnées documents
sans rapport avec le naming Sillon. Le naming "auditeur→production"
qui a été identifié comme problématique par la simulation persona ne
concerne en réalité que **2 occurrences canoniques** (le titre de
l'Angle 1 dans le doc simulation Inoxtag + le marker correspondant
dans le script `run-validation.ts`). Les 5 cas Bucket 2 sont des
formulations ambiguës mineures sans lien direct avec le pitch.

---

## Bucket 1 — Remplacements directs sûrs (validation en bloc)

### `docs/inoxtag-simulation-2026-04-27.md` — 1 occurrence

**Ligne 38**

Contexte :
```
## 3 propositions d'angles éditoriaux où Sillon serait DÉFINITIVEMENT supérieur (guide pour primitives lundi)

### Angle 1 — "Auditeur-aware quote dedup"
**Idée** : croiser les quotes proposées Pack 2 avec un index des extraits déjà publiés sur les réseaux GDIY/Cosa Vostra des 12 derniers mois, pour proposer en priorité **des phrases inédites du catalogue** (pas des reformulations de ce que Stefani a déjà clippé sur Instagram/TikTok).
```

Reformulation proposée :
```
### Angle 1 — "Production-aware quote dedup"
```

Justification : c'est la source canonique du naming identifié comme
"piège commercial" par les 3 personas (REPORT persona-validation,
ligne 116 : *"Stefani interprète la valeur côté audience, mais elle est
côté production"*). Le mot "Auditeur" trompe car la mécanique évite
les redondances dans la **production** sortante (clips Instagram déjà
publiés), pas une intelligence sur l'auditeur final.

### `experiments/persona-validation/run-validation.ts` — 1 occurrence

**Ligne 69**

Contexte :
```
  const md = readFileSync(SIMULATION_PATH, 'utf8');
  const markers = [
    { id: '1', title: 'Auditeur-aware quote dedup', start: '### Angle 1 —', end: '### Angle 2 —' },
    { id: '2', title: 'Cross-pod thematic resonance score', start: '### Angle 2 —', end: '### Angle 3 —' },
    { id: '3', title: 'Auditor-mode brief annexe : revoir cet épisode après l\'écoute', start: '### Angle 3 —', end: '## Verdict simulation' },
```

Reformulation proposée :
```
    { id: '1', title: 'Production-aware quote dedup', start: '### Angle 1 —', end: '### Angle 2 —' },
```

Justification : ce script extrait les sections du markdown source via
les markers `### Angle N —`. Le `title` n'est qu'un label informatif,
pas un pattern de match (les `start`/`end` portent sur les `### Angle`
H3). Renommer ici est sans risque sur le parser et nécessaire pour
cohérence avec la source si on relance la simulation. Couplé strict
avec le rename de `docs/inoxtag-simulation-2026-04-27.md:38`.

---

## Bucket 2 — Reformulations contextuelles (validation cas par cas)

### `experiments/persona-validation/REPORT.md` — 2 occurrences

**Ligne 26 — À VALIDER**

Contexte :
```
| Angle | Stefani | Christofer | Esther | Moyenne | Verdict |
|---|:-:|:-:|:-:|:-:|---|
| 1 — Auditeur-aware quote dedup | 2/10 | 3/10 | 3/10 | **2.7** | **FAIL** — reporter en P3 |
| 2 — Cross-pod thematic resonance score | 4/10 | 4/10 | 5/10 | **4.3** | **À ITÉRER** — reporter en P2 |
```

Reformulation proposée (option A — suivre le rename Bucket 1) :
```
| 1 — Production-aware quote dedup | 2/10 | 3/10 | 3/10 | **2.7** | **FAIL** — reporter en P3 |
```

Reformulation proposée (option B — historique préservé) :
```
| 1 — "Auditeur-aware" quote dedup *(naming abandonné, voir bucket 1)* | 2/10 | 3/10 | 3/10 | **2.7** | **FAIL** — reporter en P3 |
```

Justification : ce rapport documente précisément le verdict qui a
motivé l'audit naming — le titre original "Auditeur-aware" doit-il
rester (témoignage historique fidèle) ou suivre le rename (cohérence
prospective) ? Décision Jérémy.

**Ligne 34 — À VALIDER**

Contexte :
```
## Objections récurrentes (transversales aux personas)

### Angle 1 — Auditeur-aware quote dedup

| Objection | Stefani | Christofer | Esther |
```

Reformulation proposée : idem ligne 26, deux options A ou B selon
choix global sur ce fichier.

Justification : même fichier, même H3 réutilisé. Cohérent avec la
décision sur ligne 26.

### `docs/inoxtag-simulation-2026-04-27.md` — 1 occurrence

**Ligne 22 — À VALIDER**

Contexte :
```
## Sur quels axes Sillon brille

1. **Cross-refs structurellement différenciables**. C'est l'agent pivot. Argumentation `why_mono_podcast_rag_cant_find_this` est solide, le finding honnête sur les zones faibles (creator economy YouTube quasi-dominée par GDIY dans le catalogue) renforce la crédibilité au lieu de la masquer. L'auditeur comprend immédiatement la valeur ajoutée vs un Q&A mono-podcast.

2. **Newsletter cross-enrichie**. Quand le prompt fournit la liste cross-corpus en contexte, Sonnet l'intègre proprement avec les numéros corrects et une cohérence narrative...
```

Reformulation proposée :
```
1. **Cross-refs structurellement différenciables**. [...] Le lecteur du brief comprend immédiatement la valeur ajoutée vs un Q&A mono-podcast.
```

Justification : ambigu. "L'auditeur" ici peut désigner soit (a)
l'auditeur final qui consomme la newsletter cross-enrichie, soit (b)
le lecteur du brief de production (Stefani) qui évalue Sillon. Le
contexte (axe sur lequel Sillon brille en simulation) penche vers
(b) — c'est ce que Stefani comprend en lisant le livrable, pas ce
que l'auditeur final consomme. Reformulation "lecteur du brief"
préservé l'intention sans ambiguïté.

### `docs/design-api-universe.md` — 1 occurrence

**Ligne 97 — À VALIDER**

Contexte :
```
- **Cache** : `getCached('universe', 3600, fn)` — 1h TTL. Invalidation manuelle via `/api/cache/clear?prefix=universe`.
- **Perf** : 4 queries SQL parallèles + 1 boucle REGISTRY. Budget < 400ms cold.
- **Exclusion hub** : le tenant `hub` n'apparaît pas dans `podcasts[]` (c'est le consommateur, pas un podcast auditeur).
- **Payload** : ~12 KB gzippé estimé pour 6 podcasts + top 20 cross.
```

Reformulation proposée :
```
- **Exclusion hub** : le tenant `hub` n'apparaît pas dans `podcasts[]` (c'est le consommateur, pas un podcast public).
```

Justification : "podcast auditeur" est une formulation maladroite —
elle veut dire "podcast destiné à un auditeur final" (par opposition
au hub qui est meta). Reformuler en "podcast public" (pendant naturel
de "podcast meta/agrégateur") améliore la clarté sans toucher au
sens. Indépendant du sujet pitch ; juste un nettoyage opportuniste.

### `docs/DETTE.md` — 1 occurrence

**Ligne 84 — À VALIDER**

Contexte :
```
### Search multi-tenant hub retirée en Phase C
- **Décision** : le hub V2 (Phase C) n'aura pas de search bar globale. Les créateurs (audience hub) ont rarement besoin de recherche cross-podcasts ; l'user qui arrive sur un card → va sur le site tenant → utilise la recherche par tenant existante.
- **Pas de fan-out côté client** (6 fetches parallèles) pour un usage marginal.
```

Reformulation proposée :
```
- **Décision** : le hub V2 (Phase C) n'aura pas de search bar globale. Les créateurs (cible du hub) ont rarement besoin de recherche cross-podcasts ; ...
```

Justification : "audience hub" désigne ici le PUBLIC CIBLE du hub
qui est constitué des **créateurs** (Matthieu, équipe Orso) — pas des
auditeurs finaux. La formulation est donc trompeuse : "audience" au
sens "destinataire" plutôt qu'au sens "auditeurs". "Cible du hub"
lève l'ambiguïté. Indépendant du sujet pitch.

---

## Bucket 3 — À laisser tel quel (confirmation en bloc)

### Sous-catégorie 3a — Champs DB techniques `target_audience` (9 occurrences sur 6 fichiers)

Tous légitimes : c'est le nom de colonne SQL de la table
`learning_paths` (parcours pédagogiques). Pas de lien avec le naming
pitch. Renommer casserait migrate-json + queries + schema + JSON
seed et n'apporterait rien.

- `engine/api.ts:304` — propagation API
- `engine/types.ts:64` — interface TS
- `engine/db/migrate-json.ts:200` — migration JSON→DB
- `engine/db/queries.ts:336, 338, 380, 382` — sérialisation read
- `engine/db/schema.ts:182` — colonne Drizzle
- `docs/API.md:106` — réponse OpenAPI
- `docs/DATA.md:200` — schema doc

### Sous-catégorie 3b — Métadonnée doc "Audience : X" (6 occurrences)

Convention de header en début de doc indiquant le **lecteur cible** du
document. Aucun lien avec le naming pitch.

- `docs/anomalies-sites-orso.md:4` — "Audience : Matthieu Stefani"
- `docs/ARCHITECTURE.md:3` — "Audience : Jérémy"
- `docs/CONTRIBUTING.md:3` — "Audience : futur collaborateur"
- `docs/DEPLOYMENT.md:3` — "Audience : Jeremy"
- `docs/PIPELINE.md:3` — "Audience : Jeremy"
- `docs/DEMO_SCRIPT.md:3` — "Audience : Matthieu Stefani"

### Sous-catégorie 3c — Auditeur final légitime, KPIs métier, vocabulaire pitch (40 occurrences)

Vrai auditeur final du podcast, KPI métier sur audience réelle, ou
posture explicite du pitch. **À conserver impérativement** — c'est
le langage que Stefani parle.

#### `engine/auth/middleware.ts` — 1 occurrence
- **Ligne 5** — "Les sous-sites auditeur (/api/episodes, /api/chat, etc.) restent publics" — LÉGITIME (commentaire désigne les sites publics destinés à l'auditeur final, par opposition aux endpoints hub/admin protégés)

#### `frontend/episode.html` — 1 occurrence
- **Ligne 771** — "🎁 Avantage auditeur" — LÉGITIME (UI publique destinée à l'auditeur final, badge promo)

#### `docs/DEMO_READINESS.md` — 3 occurrences
- **Ligne 102** — "Phase F — Auditeur | Login auditeur (≠ créateur), favoris, quiz personnalisé, reco cross-podcast" — LÉGITIME (Phase F = phase produit dédiée à l'auditeur final)
- **Ligne 103** — "Version audité-friendly du dashboard" — LÉGITIME (typo possible mais sens = "facile pour la personne qui audite le dashboard" — créateurs externes auditant leurs KPIs ; pas le naming pitch)
- **Ligne 115** — "(b) Phase F auditeur" — LÉGITIME (idem ligne 102)

#### `docs/audit-univers-live.md` — 4 occurrences
- **Ligne 147** — "Niveau 1 (nav publique auditeur)" — LÉGITIME (navigation auditeur final)
- **Ligne 209** — "Refonte UX auditeur (3 j)" — LÉGITIME (UX auditeur final)
- **Ligne 228** — "F — UX auditeur" — LÉGITIME (idem)
- **Ligne 230** — "produits auditeur différenciés" — LÉGITIME (produits destinés à l'auditeur final)

#### `docs/PERSONAS_ORSO.md` — 6 occurrences
- **Ligne 114** — "Argument rétention catalogue cross-podcast (KPI business direct pour Orso Media, dimension auditeur)" — LÉGITIME (KPI métier sur audience réelle)
- **Ligne 122** — "vous avez beta.lamartingale.io pour les auditeurs, voici ce qu'on construit côté production" — **HAUTEMENT LÉGITIME** — c'est littéralement la phrase de positionnement gagnante "auditeur final / production". À conserver tel quel.
- **Ligne 147** — "'Auditeur intelligent' plutôt que 'consommateur'" — LÉGITIME (vocabulaire à utiliser dans le pitch, désigne explicitement l'auditeur final)
- **Ligne 207** — "rétention auditeurs" — LÉGITIME (KPI métier)
- **Ligne 243** — "il pense audience qualifiée mesurable" — LÉGITIME (KPI métier Stefani)
- **Ligne 334** — "obsession d'audience qualifiée" — LÉGITIME (idem)

#### `docs/inoxtag-simulation-2026-04-27.md` — 1 occurrence
- **Ligne 51** — "augmente la rétention catalogue chez l'auditeur" — LÉGITIME (KPI métier sur auditeur final)

#### `docs/orso-media-feedback.md` — 2 occurrences
- **Ligne 55** — "ces 17 épisodes représentent une audience totale importante" — LÉGITIME (vraie audience finale)
- **Ligne 82** — "un auditeur qui clique sur le lien" — LÉGITIME (vrai auditeur final)

#### `docs/ROADMAP.md` — 1 occurrence
- **Ligne 44** — "Dashboard 'ce que ton audience cherche' (pour Matthieu)" — LÉGITIME (vraie audience finale)

#### `docs/DEMO_SCRIPT.md` — 1 occurrence (hors header)
- **Ligne 131** — "ton audience souscrit après avoir écouté ton épisode" — LÉGITIME (vraie audience finale, monétisation attribution)

#### `docs/_draft-email-orso-matthieu.md` — 6 occurrences
- **Ligne 5** — "Jérémy est auditeur de longue date" — LÉGITIME (note interne sur la posture du mail)
- **Ligne 10** — "Version v4 — auditeur de longue date, construction d'un actif" — LÉGITIME (titre version)
- **Ligne 12** — "Sujet : (à choisir selon canal — ex. 'Auditeur GDIY / LM — projet autour de vos podcasts')" — LÉGITIME (Jérémy se présente comme auditeur final dans le sujet)
- **Ligne 18** — "ce qui suit est le projet d'un auditeur, pas d'une agence" — LÉGITIME (posture explicite du pitch, fondateur-auditeur fidèle)
- **Ligne 71** — "La PJ signale l'agence... pas l'auditeur curieux" — LÉGITIME (idem)
- **Ligne 91** — "Promettre ce qui n'existe pas encore (Phase F auditeur..." — LÉGITIME (référence phase produit)

#### `experiments/persona-validation/REPORT.md` — 4 occurrences (analyse meta)
- **Ligne 18** — "re-cadrer l'argument côté production / due diligence VC, pas côté auditeur (Stefani)" — LÉGITIME (recommandation explicite à conserver)
- **Ligne 42** — "Naming 'auditeur-aware' trompeur — la valeur est côté production" — LÉGITIME (analyse du finding ; supprimer "auditeur-aware" ferait perdre le sens du tableau d'objections)
- **Ligne 99** — "Le naming 'auditeur-aware' est en plus dommageable (Stefani : 'valeur côté production')" — LÉGITIME (analyse)
- **Ligne 116** — "Le naming `auditeur-aware` est un piège commercial" — LÉGITIME (analyse)

#### `experiments/persona-validation/outputs/*.json` — 11 occurrences (outputs simulation gelés)
- `1-stefani.json:24` — "La valeur est côté production, pas côté auditeur — le nom 'auditeur-aware' est donc trompeur" — LÉGITIME (output simulation, à ne pas modifier — perdrait la traçabilité de la simulation)
- `1-stefani.json:25` — citation persona Stefani sur l'auditeur — LÉGITIME (output simulation)
- `1-stefani.json:44` — `raw_text` (duplication parsed) — LÉGITIME (output simulation)
- `2-christofer.json:17` — "audience qualifiée" — LÉGITIME (KPI métier dans persona)
- `2-christofer.json:44` — `raw_text` — LÉGITIME (output simulation)
- `3-stefani.json:26` — "Durée session par auditeur" — LÉGITIME (KPI métier auditeur final)
- `3-stefani.json:45` — `raw_text` — LÉGITIME (output simulation)
- `3-christofer.json:17` — "un auditeur qui reçoit une liste de 7 épisodes recommandés" — LÉGITIME (vrai auditeur final)
- `3-christofer.json:36` — "Comment tu mesures que l'auditeur a suivi les reco" — LÉGITIME (vrai auditeur final)
- `3-christofer.json:44` — `raw_text` — LÉGITIME (output simulation)
- `3-esther.json:21` — "taux de réécoute actuel des auditeurs CTO/GG/LM" — LÉGITIME (KPI métier audience finale)
- `3-esther.json:44` — `raw_text` — LÉGITIME (output simulation)

> **Note Bucket 3 outputs JSON** : par convention sandbox
> `experiments/`, ces fichiers sont des sorties figées d'une
> simulation déjà effectuée. Modifier les `raw_text` invaliderait la
> traçabilité et casserait la reproductibilité de l'analyse. Aucune
> intervention.

---

## Couverture du scan

**Dossiers scannés** :
- `engine/` (TypeScript) — 7 occurrences (target_audience × 8 + commentaire auth × 1)
- `frontend/` (HTML/JS/TS) — 1 occurrence
- `docs/` (Markdown) — 32 occurrences
- `experiments/` (sandbox sandbox) — 22 occurrences (REPORT + outputs JSON + run-validation.ts)
- racine repo (CLAUDE.md, README.md) — 0 occurrence

**Dossiers exclus** : `node_modules/`, `.git/`, `dist/`, `cli/` (vérifié 0 hit), `instances/` (vérifié 0 hit), `scripts/` (vérifié 0 hit), `vercel-configs/`, `api/`, `src/`.

**Patterns recherchés** : `auditeur`, `audience`, `auditeurs` (regex case-insensitive `auditeur|audience|auditeurs`).

**Patterns NON recherchés (signalés ci-dessous comme cousins linguistiques à éventuellement auditer en Phase 1bis)** :
- `Auditor` / `auditor-mode` — présent dans `docs/inoxtag-simulation-2026-04-27.md:48` et `experiments/persona-validation/run-validation.ts:71` ("Auditor-mode brief annexe"). Pour Angle 3 (le SEUL angle confirmé du pilote), le préfixe "Auditor-mode" pose le même piège sémantique que "Auditeur-aware" mais en anglais. Recommandation : à étendre au scope Phase 2.
- `écouteur`, `consommateur`, `abonné`, `listener`, `viewer`, `lecteur` — non scannés.
- `target_audience` (champ DB) — déjà confirmé Bucket 3, hors scope rename.

---

## Observations qualitatives

1. **Le naming "Auditeur-aware" est en réalité ultra-localisé.** Le
   problème identifié par les 3 personas se résume à **2 occurrences
   canoniques** (1 dans le doc source + 1 dans le marker du script
   parser) + 2 occurrences référentielles dans le rapport
   persona-validation. Pas un find-replace de masse, mais un rename
   chirurgical avec couplage strict source ↔ script.

2. **Le cousin "Auditor-mode" (Angle 3) est plus risqué.** Comme
   Angle 3 est le SEUL des 3 angles confirmé pour le pilote et que
   c'est lui qui sera mis en avant le 06/05, le préfixe "Auditor-mode
   brief annexe" reproduit exactement le même piège en anglais. Ne
   pas oublier de l'inclure dans le scope Phase 2 (cousin linguistique
   non couvert par le scan actuel).

3. **PERSONAS_ORSO.md ligne 122 est un trésor.** La formulation "vous
   avez beta.lamartingale.io pour les auditeurs, voici ce qu'on
   construit côté production" est exactement la phrase de
   positionnement gagnante. À ne surtout pas toucher — c'est la
   matrice du pivot complémentarité.

4. **Le draft email v4 (`_draft-email-orso-matthieu.md`) est le plus
   chargé en occurrences (6) mais 100% Bucket 3.** Toutes les
   occurrences exploitent volontairement la posture
   "Jérémy = auditeur fidèle" comme levier de pitch. Aucune
   modification nécessaire. Ce fichier est le plus "safe" malgré son
   poids apparent.

5. **Les outputs JSON gelés ne nécessitent aucune intervention.**
   Convention sandbox `experiments/` : ils témoignent d'une simulation
   passée et leur `raw_text` doit rester intact.

6. **Le commentaire `engine/auth/middleware.ts:5` ("Les sous-sites
   auditeur") est techniquement correct et clair.** À conserver. Le
   nom de classe/fonction reste `requireHubAuth` / `optionalHubAuth`,
   le mot "auditeur" n'apparaît que dans le commentaire descriptif
   pour distinguer les routes publiques (consommées par auditeurs
   finaux) des routes hub (créateurs/admin).

---

## Recommandation Phase 2

**Délai estimé pour application** : ~10 minutes effectives.

Plan de remplacement minimal et chirurgical :

1. **Bucket 1 (en bloc)** :
   - `docs/inoxtag-simulation-2026-04-27.md:38` : "Auditeur-aware" → "Production-aware"
   - `experiments/persona-validation/run-validation.ts:69` : title du marker → "Production-aware quote dedup"

2. **Bucket 2 (cas par cas après validation Jérémy)** :
   - `experiments/persona-validation/REPORT.md:26, 34` : décision option A (rename complet) ou option B (annoter "naming abandonné") — c'est l'arbitrage principal de Phase 2
   - `docs/inoxtag-simulation-2026-04-27.md:22` : "L'auditeur" → "Le lecteur du brief" (clarté)
   - `docs/design-api-universe.md:97` : "podcast auditeur" → "podcast public" (clarté technique)
   - `docs/DETTE.md:84` : "(audience hub)" → "(cible du hub)" (clarté)

3. **Cousin "Auditor-mode" (à confirmer comme scope Phase 2bis)** :
   - `docs/inoxtag-simulation-2026-04-27.md:48` : "Auditor-mode" → ? (proposition à arbitrer — "Editorial-extension brief" ? "Cross-catalogue brief" ?)
   - `experiments/persona-validation/run-validation.ts:71` : suivre

**Risques identifiés** :

- Option A vs B sur REPORT persona-validation : si option A choisie,
  le rapport perd partiellement son sens (objection ligne 42 "Naming
  'auditeur-aware' trompeur" devient incohérente). Recommandation :
  **option B** (annoter avec note) ou **garder Bucket 3 strict**
  (laisser tel quel) — ce sont des artefacts d'analyse historique,
  les renommer dans le rapport reviendrait à réécrire l'histoire de
  la décision.
- Le rename Angle 1 doit être strictement couplé entre le doc source
  et le marker script. Sinon `run-validation.ts` ne parsera plus la
  section.
- Si "Auditor-mode" (Angle 3) est ajouté au scope Phase 2, le
  vocabulaire de remplacement doit être validé sémantiquement par
  Jérémy avant application — c'est un naming de pilote, pas un
  détail.

---

## Métriques scan

| Métrique | Valeur |
|---|---:|
| Patterns scannés | 3 (`auditeur`, `audience`, `auditeurs`) |
| Fichiers scannés (récursif) | ~600+ (excl. node_modules) |
| Fichiers avec ≥1 hit | 31 |
| Occurrences totales | 62 |
| Bucket 1 / 2 / 3 | 2 / 5 / 55 |
| Temps effectif Phase 1 | ~25 min |
| Working tree modifié | non (uniquement `experiments/naming-audit/REPORT.md` créé) |
