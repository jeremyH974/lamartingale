# Roadmap Sillon — V2 consolidé

> Source unique de vérité post-pilote Stefani 2026-04-28.
> Absorbe `docs/ROADMAP.md` (périmé pre/post-pitch React, à déprécier),
> `docs/ROADMAP_INTERNE.md` (verticales futures + features P2/P3),
> `docs/strategy-ideas-backlog.md` (catégories A/B/C/D détaillées).
>
> Statut : référentiel évolutif. Mis à jour à chaque retour client.
> NE PAS engager de développement à partir de ce document sans décision
> explicite par phase. Les détails de coût/effort/dépendances de chaque
> item B/C/D restent dans `strategy-ideas-backlog.md` qui demeure la
> source détaillée. Ce document = vue agrégée + ordre d'application.

---

## Posture stratégique

- Construire plateforme architecturale, commercialiser podcast
  uniquement pendant 12-18 mois.
- Aucune communication externe sur les autres verticales (presse,
  cinéma, talent management).
- Ordre d'application strict : on n'avance jamais sur Catégorie B/C/D
  tant qu'un item Catégorie A reste pertinent.

---

## ÉTAT 2026-04-28 (post-Phase L)

- Master `fbf910c`, hub v1 envoyable optimal sur 11 tenants Orso
- 22 bugs traités sur 23 (audit 17 + visuels 6) — 1 reporté V2 (Bug #6
  variante L1a luminance conditionnelle si signal Stefani)
- 51 briefs invités cross-tenant générés ($1.83 LLM)
- 715/715 tests verts, audit-timestamps 35/35 préservé
- Tags rollback granulaires : `pre-pilote-phase-{a,a5,b,c,g,h,i,j,k,l}`
  + `pre-pilote-v1-archive`

---

## CATÉGORIE A — Validé, à intégrer Phase 8+ (4-5 jours dev)

> Bénéfice produit indépendant du retour Stefani. Détails dans
> `strategy-ideas-backlog.md`.

| # | Item | Source détail | Dépend |
|---|---|---|---|
| **A1** | Diarization audio Whisper (host vs invité) — pyannote ou whisperX, prérequis B5 | `backlog.md:30-56` | aucune |
| **A2** | Fallback gracieux lens non-match (10-15% eps atypiques) | `backlog.md:57-78` | aucune |
| **A3** | Validation factuelle externe minimaliste | `backlog.md:79-108` | aucune |

---

## CATÉGORIE B — Conditionnel retour Stefani (déclencheur explicite)

| # | Item | Source détail |
|---|---|---|
| **B1** | Studio éditorial collaboratif | `backlog.md:114-125` |
| **B2** | Brief invité interactif pré-épisode | `backlog.md:126-137` |
| **B3** | Dashboard rétention catalogue | `backlog.md:138-149` |
| **B4** | Positionnement business SaaS premium 5-15k€/mois | `backlog.md:150-160` |
| **B5** ⭐ | Transcript publié multi-plateformes (SRT/VTT/JSON) — prérequis A1 diarization | `backlog.md:161-190` |
| **B6** ⭐ | Chapitrage horodaté | `backlog.md:191-228` |
| **B7** ⭐ | Description SEO-optimisée multi-plateformes | `backlog.md:229-274` |

⚠️ Note transversale B5/B6/B7 (`backlog.md:275-287`) : leur activation
**simultanée** transformerait le positionnement Sillon (concurrence
frontale Castmagic/Descript). Activer **un par un** selon signal.

---

## CATÉGORIE C — Long-terme 12+ mois (exclus court-terme)

| # | Item | Source détail |
|---|---|---|
| C1 | Continuité éditoriale entre épisodes successifs | `backlog.md:293-300` |
| C2 | Feedback loop tone profile | `backlog.md:301-308` |
| C3 | Générateur pitch sponsor sur-mesure | `backlog.md:309-316` |
| C4 | Intégrations plateformes hébergement (Acast, Ausha, Spreaker) | `backlog.md:317-324` |
| C5 | Intégrations post-prod (Descript, Riverside) | `backlog.md:325-330` |
| C6 | TTFV onboarding < 10 min (UX SaaS) | `backlog.md:331-338` |
| C7 | Principe transparence choix éditoriaux | `backlog.md:339-344` |
| C8 | Mode "jumeau numérique" tone profile | `backlog.md:345-352` |

---

## VERTICALES FUTURES (presse, ciné, talent — ROADMAP_INTERNE)

| Verticale | Trigger | Implications archi |
|---|---|---|
| Presse écrite & média numérique (Les Échos, L'Express) | Q1-Q2 2027 selon traction podcast | content_type='article', positions chunk = paragraphes |
| Cinéma & audiovisuel (studios, festivals) | 2027 selon opportunités | content_type='masterclass'\|'interview', chunks = scènes/timestamps |
| Management talent (artistes, sportifs, conférenciers) | 2027 selon opportunités | corpus hybride privé+public, entités centrales = personnes |

**Règle anti-overgeneralization** : toute abstraction architecturale
n'est autorisée que si elle est imposée par AU MOINS UN cas présent
ET reste utile pour AU MOINS UN cas futur listé ici.

---

## FEATURES P2 (post-pilote Q3-Q4 2026)

| # | Item | Source détail |
|---|---|---|
| P2-1 | Audio Overview cross-corpus (podcast IA-IA) | `ROADMAP_INTERNE.md:43-48` |
| P2-2 | Couche visuelle podcast (clips 9:16, thumbnails, réactions) — branche `feat/video-pipeline @ a3a91c1` figée | `ROADMAP_INTERNE.md:50-54` |
| P2-3 | Sillon Daily (briefing quotidien email) | `ROADMAP_INTERNE.md:56-59` |

---

## DETTE TECHNIQUE V2 (extrait DETTE.md, par axe)

> Source maîtresse `docs/DETTE.md` (~800 lignes, à restructurer Action 2
> reportée). Ci-dessous vue par axe — détails et estimations dans
> DETTE.md.

### Axe data-quality (P1-P3)

- LinkedIn pollution résiduelle 4 catégories : 139 CONFLICT humains,
  62 LP `laurentkretz`, 20 GDIY `morganprudhomme`, 195/222 LM guests
  orphelins `guest_episodes`
- Cycle de vie cross_podcast_guests : soft-delete `is_active`
- 16 LM eps `slug=""` (P3)
- Divergence `episodes.guest_bio` (88) vs `guests.bio` (~288)
- Accents `display_name` (P3, B5b reportée)

### Axe pipeline-brief (P1)

- **Phase C V2 transcripts dans cascade** (`sourceSelector.ts:37`
  ligne FUTURE commentée) — Whisper top 10-50 cross-guests $14-72
  + regen $2-5
- Bulk-generate ~1100 briefs invités restants (~$15 LLM)
- Diarization Whisper (cf. A1 backlog)
- Biais primauté Sonnet long contexte (Plais 188min)

### Axe ui-hub (P2)

- **Soft-404 `/guest-brief/<random>`** (P1-4 audit)
- Bug #6 variante L1a luminance conditionnelle (Phase L reportée si
  signal Stefani)
- Audit entry points post-`c67f4bf` (Assistant/Graphe/Pour vous)
- Hub absorption dashboards créateur (Option Beta)
- Cold hit `/api/universe` 2.15s sous surveillance

### Axe pipeline-ingest (P0-P2)

- **Deep scrape Orso 0 articles** sur LP/Finscale/PP/CCG — bloque
  richesse `episode_ref`/`tool`/briefs
- **Re-extraction guests LP/GDIY** (P1-6 audit, Phase D skipped pilote)
- Audit numérotation RSS V2 (P3, pitch additionnel Stefani capturé
  Phase K)

### Axe archi-ts (P3)

- Build TS strict KO 13 erreurs (`docs/debt-tracking.md`)
- D3 step 2 unifier `company-rules` (audit 17k rows)
- Discipline `DEFAULT_PACK` scripts audit (règle Phase A.5)

---

## ITEMS DOUBLONS RÉCONCILIÉS

L'inventaire 360° (Scénario B Étape 0) a identifié 4 doublons entre
sources. Réconciliation :

1. **Diarization Whisper** : 3 mentions (A1 backlog, DETTE Phase 5,
   MEMORY) → source canonique = `backlog.md:30-56` (A1)
2. **Bulk briefs** : 3 mentions (audit-hub-ui P1-3, DETTE Phase C V2,
   MEMORY pack pilote) → source canonique = DETTE Phase C V2 (P1)
3. **Soft-404 guest-brief** : 2 mentions (audit-hub-ui P1-4, MEMORY)
   non présent dans DETTE → ajouter à DETTE.md Action 2
4. **Re-extraction guests LP/GDIY** : 2 mentions (audit-hub-ui P1-6,
   DETTE LinkedIn pollution C) → source canonique = DETTE
5. **Vue admin "audit éditorial RSS"** : 1 mention DETTE.md, absent du
   backlog → ajouter en Catégorie B post-pilote (pitch additionnel
   conditionnel)

---

## CATÉGORIE D — Probablement pas (gadgets ou hors-cible)

`backlog.md:353-380` — D1 viz D3.js, D2 multi-langue avant client intl,
D3 mobile native, D4 clipping vidéo OpusClip-like, D5 Q&A grand public
NotebookLM-style.

---

## DOCUMENTS ABSORBÉS / DÉPRÉCIÉS

- `docs/ROADMAP.md` → **DÉPRÉCIÉ** (orienté pre/post-pitch React, items
  ✅ tous closes ou repris ici). À supprimer ou marquer DEPRECATED.
- `docs/ROADMAP_INTERNE.md` → conservé (verticales + features P2/P3
  référence détaillée)
- `docs/strategy-ideas-backlog.md` → conservé (détails catégories
  A/B/C/D, source detail)

---

## TRACE MISES À JOUR

| Date | Auteur | Changement |
|---|---|---|
| 2026-04-28 | CC + Jérémy (Scénario B Étape 0) | Création ROADMAP_V2 consolidé absorbant 3 sources |
