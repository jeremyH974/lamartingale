# Investigation pipeline 5 livrables — état réel 2026-04-28

> **Contexte.** Pause Scénario B M5 imposée pour arbitrage scope. Question initiale Jérémy + Claude.ai : "Sillon génère 5 livrables auto par épisode, hub v2 ne le mentionne pas → sous-vente 5×". Cette investigation documente l'état factuel du pipeline avant arbitrage.
>
> **Niveau A autonome** — investigation pure, $0 LLM, pas de modif code. Branche `feat/hub-v2-scenario-b` en pause à `e6807d2`.

---

## TL;DR — verdict en 4 lignes

1. **Pipeline orchestré : NON.** `engine/pipelines/runPack.ts` throw `'not implemented yet'`. Aucune commande `npx tsx … runPack` ne tourne en prod.
2. **Couverture réelle : 4/3354 épisodes = 0.12 %.** Generation via script ad-hoc `experiments/.../phase6-runner.ts` sur 4 épisodes cherry-pick (Boissenot, Doolaeghe, Plais, Veyrat).
3. **Persistance : 0 rows DB.** Table `editorial_events` créée 2026-04-28, schéma OK, vide. Livrables stockés en `.md` + `.docx` + `.xlsx` dans `experiments/autonomy-session-2026-04-28/pack-pilote-stefani-orso-v3-final/`.
4. **Qualité validée 12/12 ≥ 7.5/10** (auto-éval Phase 6, échantillon visuel CC = excellent, publiable tel quel).

→ **L'écart pitch hub v2 ↔ réalité technique** est réel mais pas du facteur 5x sur la couverture : facteur 5x sur **les types de livrables disponibles** (5 vs 1 brief invité), couverture artisanale 4 épisodes.

---

## Q1 — Volume de couverture

### Couverture par tenant

| Tenant | Episodes ingérés | Episodes avec 5 livrables | % |
|---|---|---|---|
| lamartingale | 294 | 1 (#174 Boissenot) | 0.34 % |
| gdiy | 537+ | 1 (#266 Plais) | <0.2 % |
| lepanier | 137 | 1 (#128 Doolaeghe Nooz) | 0.7 % |
| finscale | 315 | 1 (#107 Veyrat Stoïk) | 0.32 % |
| passionpatrimoine | 158 | 0 | 0 |
| combiencagagne | 72 | 0 | 0 |
| iftd | 187 | 0 | 0 |
| demainvousappartient | 76 | 0 | 0 |
| onlacherien | 54 | 0 | 0 |
| allolamartingale | 7 | 0 | 0 |
| **TOTAL** | **3354** | **4** | **0.12 %** |

### Modalité de sélection

**Cherry-pick éditorial** Phase 6 — pas systématique, pas échantillonné. Critères de sélection (cf. `docs/brief-phase6-production-2026-04-30.md`) :
- Diversité tenants (LM/LP/GDIY/Finscale)
- Densité éditoriale (pas de [REDIFF], invité substantiel)
- Saliency lens élevée (Plais → DTC, Veyrat → insurtech)

→ Couverture **non extensible automatiquement**. Pour couvrir N épisodes, il faut relancer `phase6-runner.ts` N fois.

---

## Q2 — Qualité moyenne (échantillon visuel)

### Auto-éval Phase 6 (référence MEMORY.md)
> "**PASS franchement** : 12/12 livrables pivot ≥ 7.5/10 sur 4 épisodes pilote (Plais V5 ref + Boissenot/Nooz/Veyrat). 0 fail-safe déclenché."

### Audit échantillon CC — Boissenot LM #174

**01-key-moments.md** — 5 moments avec timestamps, saliency 0.82-0.93.
- Score : **5/5**
- Commentaire : timestamps précis (29:54-31:02, etc.), citations vérifiables ("9 milliards de cartes éditées en un an", "1300 et quelques"), rationale Stefani-compatible. Publiable tel quel.

**04-newsletter.md** — 41 lignes, 3 sections séparées par `---`.
- Score : **5/5**
- Commentaire : voix éditoriale forte ("Pas par conviction d'investisseur. Par une brocante…"), références cross-corpus précises (Holzmann sneakers, Lamoure voitures, Carbone/Dubois Matis), thèse construite. **Style Stefani crédible**.

**Attendu sur les 3 autres épisodes** : qualité similaire validée par auto-éval Phase 6 + retravail Phase 8 sur `extractQuotes` (audit timestamps 35/35 OK).

→ **Niveau publication directe — pas de retouche éditoriale nécessaire.**

---

## Q3 — Coût LLM

### Mesure Phase 6 (4 épisodes pilote)

```
Plais (GDIY #266)        : $0.21  (Phase 5 V5 ref final run)
Boissenot (LM #174)      : $0.59
Doolaeghe (LP #128)      : $0.52
Veyrat (Finscale #107)   : $0.80
                          ─────
TOTAL 4 épisodes          : $2.12
                          ─────
Moyenne par épisode      : $0.53
Moyenne par livrable     : $0.10
```

### Détail modèles utilisés

- **Sonnet 4.6** (par défaut) — extractKeyMoments, extractQuotes, lensClassificationAgent, génération L3/L4/L5
- **Opus 4.7** (rewrite si validation Sonnet < 7.5/10) — déclenché 4× sur 20 livrables (20 % du temps)
- **GPT-4o-mini** (fallback si pas d'`ANTHROPIC_API_KEY`) — non utilisé Phase 6 (token ANTHROPIC présent)

### Tokens moyen par livrable (échantillon Phase 6)

| Livrable | Sonnet calls | Tokens in moyens | Tokens out moyens |
|---|---|---|---|
| L1 keyMoments | 1-2 | ~12k | ~1k |
| L2 quotes | 1-2 | ~12k | ~0.8k |
| L3 crossRefs | 2-3 | ~15k | ~2.5k |
| L4 newsletter | 2-3 | ~18k | ~2k |
| L5 briefAnnexe | 1-2 | ~10k | ~1.5k |

Source : `experiments/autonomy-session-2026-04-28/costs.log` lignes phase=6.

### Extrapolation full corpus

| Cible | Coût estimé |
|---|---|
| 100 épisodes | $53 |
| 500 épisodes | $265 |
| 3354 épisodes (full corpus) | **$1 777** |
| 3354 × seulement Boissenot/Plais/Doolaeghe/Veyrat patterns | $1 700–$2 700 selon variance Opus |

**Ne pas inclure** : transcription Whisper (déjà payée pour les 4 pilote, ~$0.40/heure × ~40min = $0.27/ép → +$905 pour full corpus à recouvrir si pas déjà transcrit).

---

## Q4 — Infrastructure pipeline

### Latence par épisode (4 livrables L2-L5 sur transcript pré-existant)

| Épisode | Wall ms | Calls Sonnet | Calls Opus |
|---|---|---|---|
| Plais (Phase 5 V5) | 145s | 13 | 5 |
| Boissenot | 169s | 9 | 1 |
| Doolaeghe | 152s | 9 | 1 |
| Veyrat | 165s | 10 | 2 |
| **Moyenne** | **158s** (~2.6 min) | 10 | 2 |

### Pipeline : ad-hoc CLI, pas batch ni API

**Commande exacte** (pour générer les 5 livrables d'un des 4 épisodes pilote) :
```bash
npx tsx experiments/autonomy-session-2026-04-28/phase6-runner.ts boissenot
npx tsx experiments/autonomy-session-2026-04-28/phase6-runner.ts nooz
npx tsx experiments/autonomy-session-2026-04-28/phase6-runner.ts veyrat
# Plais via phase5-plais-v5.ts (pipeline V5 ref)
```

**Limitations** :
- Slugs hardcodés dans phase6-runner.ts (`boissenot` / `nooz` / `veyrat` uniquement)
- Pas de paramétrage générique pour un nouvel épisode (doit modifier le source).
- Pas de batch parallèle (séquentiel mono-process).
- Pas de schedule (pas de cron, pas de hook ingest).

### `runPack()` — pipeline orchestré canonique : NON IMPLÉMENTÉ

```ts
// engine/pipelines/runPack.ts ligne 142
throw new Error('runPack: not implemented yet — agents needed first');
```

→ **Le pipeline "orchestrateur officiel" du brief Phase 7a est un squelette typé.** Tous les livrables existants ont été produits par scripts ad-hoc Phase 5/6/7/8.

### Idempotence

- `phase6-runner.ts` : `await fs.writeFile(...)` → **écrase** sans vérification. Re-run = nouvelle génération coût plein, écrase output précédent.
- Pas de cache LLM par épisode.
- Phase 8 a montré qu'on peut régénérer sélectivement L2 (`phase8-regen-l2.ts`) — mais ad-hoc, pas générique.

---

## Q5 — Distribution actuelle (où vivent les livrables)

### Stockage primaire : filesystem `experiments/`

```
experiments/autonomy-session-2026-04-28/
├── pack-pilote-stefani-orso-v3-final/         ← VERSION DE RÉFÉRENCE
│   ├── boissenot-pokemon/
│   │   ├── 01-key-moments.xlsx
│   │   ├── 02-quotes.xlsx
│   │   ├── 03-cross-refs-by-lens.docx
│   │   ├── 04-newsletter.docx
│   │   └── 05-brief-annexe.docx
│   ├── nooz-optics/                            (5 fichiers idem)
│   ├── plais-platform-sh/                      (5 fichiers idem)
│   └── veyrat-stoik/                           (5 fichiers idem)
│
├── pack-pilote-stefani-orso-v3-final-md-audit/ ← Sources MD (parsing audit)
│   └── {slug}/0X-*.md                          (20 fichiers)
│
└── (8 dossiers v0/v1/v2/v2-bugfix/v2-veyrat-fix/v3-l2-fix/v3-final-md-audit/v3-final = historique versions)
```

**Status repo** : `experiments/` est **dans .gitignore** (sandbox autonomie). Les livrables ne sont **pas commités** → invisibles GitHub public, accessibles seulement local.

### Stockage secondaire : DB `editorial_events` (vide)

```sql
CREATE TABLE editorial_events (
  id UUID PRIMARY KEY,
  source_id TEXT NOT NULL,        -- ex: 'episode-XXX'
  source_type TEXT DEFAULT 'episode',
  type TEXT NOT NULL,              -- 'key_moment'|'quote'|'cross_reference'|'lens_classification'
  position JSONB NOT NULL,
  content_text TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  lens_tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Vérifié 2026-04-28 16:30** :
```
total rows: 0
by type:    (vide)
top source_id: (vide)
```

→ **Les primitives `persistEditorialEvents()` ne sont pas appelées en production** sur les 4 épisodes pilote. Ils écrivent en `.md` direct, sans persistance DB.

### API endpoints serving livrables

`grep -nE "livrable|key_moments|cross-refs|newsletter|brief-annexe" engine/api.ts` → **0 match**.

→ Aucun endpoint `/api/episode/:id/livrables` ou équivalent n'existe. Le hub `frontend/hub.html` ne peut **pas** afficher ces contenus en l'état (ils ne sortent pas par l'API).

### Format

| Phase | Format source | Format final |
|---|---|---|
| Phase 5/6 | `.md` (markdown structuré custom) | `.md` |
| Phase 7a | `.md` (parser markdownParser.ts) | `.docx` (officegen) + `.xlsx` (exceljs) |

Les 4 packs `v3-final` sont en formats Office bureautique (Stefani-friendly), pas web.

---

## Q6 — Système "lens" thématique

### Implémentation prod : OK (mais utilisée seulement Phase 6)

**Code source** :
- `engine/agents/lensClassificationAgent.ts` — agent Sonnet, scoring lens × segment transcript
- `engine/agents/lensSectionGate.ts` — `shouldGenerateLensSection()` + `dedupCrossRefSelectionsByEpisodeId()`
- `clients/stefani-orso.config.ts` ligne 230-340 — registry des 5 lens

### Mode : **CURATED** (pas dynamic)

Concepts hardcodés par lens dans la config client. Pas d'auto-detection de nouveaux lens depuis le contenu. Évolution = manual edit de `stefani-orso.config.ts` + redéploiement.

### Liste exhaustive des lens (clients/stefani-orso.config.ts)

| Lens id | Description | Concepts | Threshold |
|---|---|---|---|
| `ovni-vc-deeptech` | Scaleup tech B2B européenne, profil Ovni Capital VC | 7 concepts (deeptech, Series B+, scale international…) | 0.3 (default) |
| `alternative-investments` | Investissement hors-marché classique, niche, asymétrique | 7 concepts (collectibles, crypto trading, immobilier atypique…) | 0.3 |
| `dtc-acquisition-tactical` | E-commerce DTC + acquisition payante performance | 6 concepts (Facebook/Google/Amazon Ads, CAC LTV…) | 0.3 |
| `b2b-insurance-tech` | Insurtech B2B (cyber, RH, garantie) | 6 concepts (cyber-insurance, courtiers, primes…) | **0.5** (V4 finding F-V4-1) |
| `editorial-base` | Fallback large angle Stefani business/finance | (concepts non audités ici, défini ligne 318+) | 0.3 |

### Algorithm

1. Découpage transcript en segments ~240s (4 min, `DEFAULT_SEGMENT_TARGET_SECONDS`)
2. Pour chaque segment : 1 appel Sonnet → score lens 0.0-1.0 + rationale + matched_concepts
3. Filtrage `lens_score >= threshold`
4. Persistance attendue → `editorial_events.type = 'lens_classification'` (jamais effectué — table vide)
5. Gate Phase 6 : `shouldGenerateLensSection()` saute la section L3 d'un lens si < N matches qualifiés

### Couplage L3 cross-refs ↔ lens

L3 (cross-refs) génère une section par lens activé. Si Plais matche `dtc-acquisition-tactical` + `b2b-insurance-tech` (faux pos déduplé), 2 sections. Si Veyrat matche uniquement `b2b-insurance-tech`, 1 section. Lens skippés → footer "X lens skippés (faute de matériau cross-corpus suffisant)".

### État de robustesse

- Calibration Phase 4 : 4 versions (v1/v2/v3/v4) pour faire converger précision/rappel.
- V4 ajustements documentés inline (F-V4-1, F-V4-2, F4 sur DTC). Stable.
- Pas de tests automatisés sur lensClassificationAgent (vérifié `engine/__tests__/` : pas de fichier `lens-classification.test.ts`).

---

## Q7 — Documentation existante

### Mentions du pipeline 5 livrables

**Briefs phase-spécifiques (8 docs, exhaustifs)** :
- `docs/brief-primitives-2026-04-28.md` (Phase 1+2 architecture primitives)
- `docs/brief-phase5-v4-refonte-2026-04-30.md` (V5 ref Plais)
- `docs/brief-phase5-v5-opus-2026-04-30.md` (escalation Opus)
- `docs/brief-phase6-production-2026-04-30.md` (production 3 eps)
- `docs/brief-phase7a-output-formats-2026-04-30.md` (transformation md→docx/xlsx)
- `docs/brief-phase8-extractquotes-fix-2026-04-28.md` (fix L2 timestamps)
- `docs/brief-polish-2026-04-30.md` (polish pré-envoi 15-17/05)
- `docs/session-2026-04-28/phase-3-lens-agent.md` (lens system)

**Roadmaps & strategy** :
- `docs/ROADMAP_V2.md` : **NE MENTIONNE PAS** l'intégration des 5 livrables au hub v2. Section axe `ui-hub` couvre uniquement audit-hub-ui-2026-04-28.md (UI bugs cosmétique).
- `docs/strategy-ideas-backlog.md` : mention `loadStyleCorpus` comme "moat existant" (ligne 349) mais pas d'idée d'expo hub.
- `docs/DETTE.md` : à auditer pour confirmation absence (TODO suivant).

**Email pitch & comms** :
- `docs/draft-email-pilote-stefani-v2.md` : centré sur 4 packs pilote envoyables. Mentionne implicitement les 5 livrables comme **cœur du pilote** (c'est le pilote = les packs).
- `docs/feedback-orso-media.md` : centré data quality, pas pipeline.

### Gap documentaire

**À créer** (post-arbitrage M5) :
1. **`docs/PIPELINE_5_LIVRABLES.md`** — reference doc (état pipeline, comment générer un nouvel épisode, limites runPack, idempotence, coût). Aujourd'hui éparpillé sur 8 briefs phase.
2. **`docs/ROADMAP_V2.md` axe `pipeline-livrables`** — clarifier statut "production artisanale 4 eps / cherrypick" vs "pipeline auto branché RSS ingest" (V2 ?).
3. **Mention dans `MEMORY.md` projet** — fixer la métrique "0.12 % couverture" pour éviter sous-vente ou sur-vente future.

---

## Conclusion — recommandation pour arbitrage M5

### Synthèse de l'écart pitch ↔ réalité

| Dimension | Pitch hub v2 actuel (M5.1 v3) | Réalité technique | Écart |
|---|---|---|---|
| Variétés livrables | 1 type (guest-brief cross-pod) | 5 types (key-moments/quotes/cross-refs/newsletter/brief-annexe) | **5×** |
| Couverture corpus | 62 briefs / 3354 eps = 1.85% (chiffre dynamique carte 4) | 4 packs × 5 = 20 livrables / 16770 livrables théoriques = 0.12% | Carte 4 sous-vend la prouesse pack-pilote, sur-vend la couverture future |
| Qualité validée | Brief Larchevêque (1 exemple) | 12/12 livrables ≥ 7.5/10 sur 4 eps (pack pilote envoyable) | Hub ne montre pas la profondeur éditoriale |
| Intégration produit | Brief inline + page guest-brief (Larchevêque) | Aucune (sandbox `.gitignore`, no API, no DB persistence) | Énorme, structurelle |
| Lens cross-corpus | Mention "cross-refs" abstraite (carte SVG M4) | 5 lens curated + L3 cross-refs concret | Hub ne nomme pas le système lens |

### Scénarios d'arbitrage (réponse en CC pour Claude.ai)

#### **X1 — Vitrine complète** (offensif)
Exposer les 4 packs pilote dans le hub : page dédiée par épisode, 5 livrables téléchargeables (.md preview ou .docx download).
- ✅ Différenciant fort, preuve technique vérifiable, anti-Beepers maximal.
- ❌ Expose travail artisanal (4 eps) → risque "et le reste ?". Risque vol IP avant pilote envoyé.
- ❌ `experiments/` est gitignore → faut migrer les fichiers vers `frontend/data/` ou DB. Travail réel.

#### **X2 — Showcase passif** (mesuré)
1 carte hub "5 livrables auto par épisode" + 1 lien vers 1 pack démo (Boissenot par ex.) + disclaimer "exemple sur 1 épisode pilote, full pipeline en construction".
- ✅ Communique la prouesse sans exposer 4 eps complets.
- ✅ Faisable sous 2h (commit assets Boissenot, 1 nouvelle section M5.x).
- ⚠️ Reste vulnérable à clone si Beepers visite.

#### **X3 — Réserve pilote** (défensif)
Garder les 5 livrables comme **arme de pitch one-on-one** dans email Stefani 13 mai. Hub v2 reste muet sur le pipeline 5 livrables.
- ✅ Anti-vol max, asymétrie info maintenue.
- ❌ Hub continue à sous-vendre. Stefani peut ne PAS comprendre la profondeur sans pitch verbal.
- ❌ Cohérent avec décision Claude.ai précédente "carte 4 = positionnement sans dévoilement".

#### **X4 — Hybride X2+X3 + signal fort carte 4** (mon vote CC)
1. **Carte 4 reformulée** : remplacer bullet 1 "Recherche conversationnelle complète activée" par mention explicite "5 livrables produits par épisode (key-moments, quotes, cross-refs, newsletter, brief annexé) — démontré sur 4 épisodes pilote".
2. **Pas de section dédiée hub** (= pas de page publique pack pilote).
3. **Email pitch M6 inclut lien démo restreint** vers pack Boissenot exposé sur preview Vercel auth-gated.
4. **Documenter dans `MEMORY.md`** la métrique 0.12 % couverture pour future cohérence.
- ✅ Comble l'écart pitch ↔ réalité dans le hub (la carte 4 nomme le 5×).
- ✅ Garde l'arme pitch privée (lien démo uniquement dans email Stefani).
- ✅ Faisable en M5.1 v4 immédiat (modif carte 4 only) + email pitch M6.
- ⚠️ Reste un asymétrie volontaire : visiteur public ne voit pas les packs, seul Stefani via email.

### Mes 3 questions pour Claude.ai avant d'exécuter

1. **Vol IP vs sous-vente** : entre les 2 risques, lequel domine pour Stefani spécifiquement ? S'il refuse pilote car perception faible-tech, X3 perd. S'il signe pilote sans avoir vu le pipeline, X1 expose Beepers gratuitement.
2. **Honnêteté quantitative** : carte 4 mentionne "5 livrables produits par épisode" mais réalité = 4/3354 = 0.12 %. Faut-il préciser dans la copy "démontré sur 4 épisodes pilote" pour éviter sur-vente, ou laisser implicite (Stefani lit "produits" comme "produisibles") ?
3. **Doc gap** : crée-t-on `docs/PIPELINE_5_LIVRABLES.md` maintenant (fixe la métrique, évite sur/sous-vente future) ou seulement post-arbitrage scope final ?

---

## État branche & coût investigation

- Branche `feat/hub-v2-scenario-b` : figée à `e6807d2`. Working tree clean (sauf entry pause M5 dans `docs/scenario-b-decisions.md` non-committée).
- Coût LLM Scénario B inchangé : **3.05¢ / $10**. Investigation = $0.
- Wall : ~25 min CC.

→ **Awaiting Claude.ai arbitrage X1/X2/X3/X4.**
