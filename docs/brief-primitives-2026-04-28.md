# Brief Claude Code — Couche primitives + lensClassificationAgent + Engagements architecturaux 1-2-3

> Pilote Stefani-Orso — Démarrage lundi 28/04/2026
> Cap envoi pilote : 13/05 (réaliste), 20/05 (buffer si Phase 4 fail)
> Estimation mission : 6.5 jours (optimiste) / 10.5 jours (réaliste) / 13 jours (pessimiste)

## CONTEXTE GÉNÉRAL

Tu reprends un projet config-driven multi-tenant (Sillon, alias podcast-engine) qui agrège 6 podcasts de l'écosystème Orso Media via ms-hub.vercel.app + 6 sous-sites individuels. Stack TypeScript + Express + Vercel multi-projects + Neon Postgres avec pgvector.

Contexte stratégique consolidé ce week-end (27/04) :
- Verdict simulation Inoxtag : "VIABLE AVEC AJUSTEMENTS"
- Verdict validation persona des 3 angles différenciants : critique (2.7 / 4.3 / 4.7 sur 10), aucun angle ≥ 7/10
- Pivot identifié : la SEULE vraie idée différenciante est la classification par lens éditorial vs similarité brute (convergent 3/3 personas)
- Décision : Brief A "recentré" — couche primitives + lensClassificationAgent comme pivot central + reframing livrables (pas 7 agents séparés)
- Architecture étendue : tripartition créateur/audience/sponsor + 3 espaces produits (re-circulation catalogue / attribution sponsor / pitch decks sponsor) + 4 engagements architecturaux

État repo au démarrage de cette mission :
- Master à `880c3f1` (commit du 27/04 21h, episode-shortlist promu)
- 1 seule branche locale (master)
- 2 archives sur origin (pilot-simulation-inoxtag, recon/beta-lamartingale-2026-04-26)
- Working tree clean
- Tests : 335/335 verts (entities migrée, lens_classification schema livré, naming corrigé)
- zod 4.3.6 disponible en dépendance
- Node + npm fonctionnels

Cap dur global : envoi pilote 13/05 (vs 06/05 initial décalé suite au pivot lensClassificationAgent).

## CAP QUALITÉ NON-NÉGOCIABLES

Ces 5 caps s'appliquent à TOUTES les phases ci-dessous. Si tu sens qu'une décision technique arbitre entre l'un de ces caps et la vitesse, tu choisis le cap, pas la vitesse.

1. **Cap qualité > vitesse d'exécution.** Si tu commences à prendre des raccourcis ou proposer des fallbacks faibles non validés, STOP et demande clarification plutôt que de livrer du moyen. Cible qualité différenciée :
   - 7+/10 sur les commodities (key_moments, quotes, transcript)
   - 7.5+/10 sur les pivots (lensClassificationAgent, cross-refs, newsletter, brief annexe)

2. **Cap satisfaction client > satisfaction fondateur.** Stefani et Christofer Ciminelli vont juger la qualité de ce qui leur est livré. Si une décision technique arbitre entre "rapide pour Jérémy" et "meilleur pour le pitch", choisis le second à chaque fois.

3. **Cap discipline anti-régression.** Aucun test précédemment vert ne doit devenir rouge. Les 335/335 verts actuels sont la baseline intouchable. Si tu introduis une régression : STOP immédiat, rollback envisagé.

4. **Cap discipline anti-overgeneralization.** Abstraction si et seulement si imposée par 1 cas présent ET au moins 1 cas futur identifié dans docs/ROADMAP_INTERNE.md. Pas plus. Pas de schéma spéculatif, pas de discriminated union prématurée, pas de placeholder vide.

5. **Cap honnêteté du verdict.** Si quelque chose dérape ou si tu identifies une dette technique : signale clairement dans le STOP, ne masque pas. Mieux un rapport honnête sur 70% du scope qu'un "tout est vert" trompeur sur 100%.

## ARCHITECTURE CIBLE — RAPPEL DES 4 NIVEAUX

Sillon est structuré en 4 niveaux hiérarchiques (cf. décisions architecture pré-pilote samedi-dimanche) :

1. **Primitives** (pures, agnostiques tenant) : transcribeAudio, extractKeyMoments, extractQuotes, crossReferenceEpisode, persistEditorialEvents. Pas de logique métier client. Pas de dépendance Tenant ID.

2. **Agents** (compositions, contrat 6/6) : agents qui combinent plusieurs primitives pour produire un livrable spécifique. Le pivot : lensClassificationAgent.

3. **Pipelines** (orchestrations) : runPack(packDefinition) générique, déjà squeletté en branche pilot-architecture-prep (mergée). Lit une config client + une définition de pack + exécute la séquence d'agents.

4. **Configs client** : clients/<client>.config.ts déclaratif. Pour le pilote : clients/stefani-orso.config.ts (déjà livré squelette).

Les 4 engagements architecturaux du brief de passation 14h30 (samedi 26/04) sont à finaliser dans cette mission :

- **Engagement 1** : Table editorial_events (création + helpers + tests). Schéma déjà cadré par le commit Chantier B (lens_classification metadata zod schema).
- **Engagement 2** : Interface Lens + scoring registry.
- **Engagement 3** : Champ beneficiary_type dans DeliverablePack.
- **Engagement 4** : Update docs/ROADMAP_INTERNE.md (en parallèle Phase 5-6).

## 4 ÉPISODES PILOTE STEFANI-ORSO

Sélection finale validée le 27/04 à 17h. 1 épisode par podcast Orso différent pour désamorcer l'objection Christofer "Sillon ne sert que Stefani". Lens cibles diversifiés pour test maximal de lensClassificationAgent.

| # | Podcast | Episode | Date | Invité/Brand | Lens cible |
|---|---|---|---|---|---|
| 1 | GDIY | #266 | 2022-06-23 | Frédéric Plais (Platform.sh) | ovni-vc-deeptech |
| 2 | La Martingale | #174 | 2023-08-09 | Alexandre Boissenot (cartes Pokémon) | alternative-investments |
| 3 | Le Panier | #128 | 2021-11-19 | Nooz Optics (lunettes DTC) | dtc-acquisition-tactical |
| 4 | Finscale | #107 | 2022-07-02 | Jules Veyrat (Stoïk, cyber-insurance) | b2b-insurance-tech |

Ces 4 épisodes sont la baseline pour :
- Phase 4 (jalon calibration mercredi soir) : 3 lens × 3 épisodes = 9 lens-épisode
- Phase 6 (run E2E final) : exécution complète Pack 2 sur les 4

Lens registry initial du pilote (5 lens : 4 spécifiques + 1 fallback) documenté en Phase 3 ci-dessous.

## PHASE 0 — NAMING ACQUIS (rappel, pas d'action)

L'audit naming "auditeur" → "production" a été appliqué le week-end 27/04 sur la branche pilot-naming-audit, désormais mergée sur master. 8 remplacements effectués :
- "Auditeur-aware quote dedup" → "Production-aware quote dedup"
- "Auditor-mode brief annexe" → "Cross-catalogue brief annexe"
- 4 reformulations contextuelles diverses

Cette phase ne demande aucune action. Mais : tous tes outputs (prompts agents, commit messages, commentaires de code) doivent respecter cette discipline naming. Vocabulaire à utiliser :
- "production éditoriale" (pas "valeur auditeur")
- "préparation interview" / "due diligence invité"
- "cross-catalogue" / "cross-corpus" / "indexation cross-tenant"
- "lecteur du brief" (quand on parle de Stefani lisant un livrable Sillon)

Vocabulaire à éviter :
- "auditeur-aware" (toute combinaison)
- "auditor-mode" (toute combinaison)
- "valeur côté auditeur" (sauf si on parle vraiment de l'auditeur final qui consomme le podcast)

## PHASE 1 — COUCHE PRIMITIVES (lundi-mardi, ~1.5 jours)

### Vue d'ensemble

5 unités à livrer dans cette phase. Toutes pures, agnostiques tenant, testables en isolation. Tu suis le pattern existant (cf. exemples : guestBriefAgent dans engine/, tests dans engine/__tests__/).

Cap qualité phase 1 : 7+/10 sur les commodities (key_moments, quotes, transcript). 7.5+/10 sur crossReferenceEpisode (= proche d'un pivot puisque c'est l'agent qui a déjà eu 7.5/10 dans la simulation Inoxtag).

### Primitive 1.1 — transcribeAudio

**Objectif** : transcrire un fichier audio MP3 podcast en texte structuré avec timestamps via Whisper API.

**Contrat** :
```typescript
async function transcribeAudio(
  audioUrl: string,
  options: {
    guestName?: string  // pour Whisper prompt param
    model?: 'whisper-1'  // default
    language?: 'fr'  // default
  }
): Promise<TranscriptResult>

type TranscriptResult = {
  full_text: string
  segments: TranscriptSegment[]  // depuis engine/db/types/editorial-event-metadata.ts
  duration_seconds: number
  cost_usd: number
}
```

**Spec implémentation** :

1. Si l'audio est plus long que 25 MB (limite Whisper API), splitter en chunks de ~24 MB avec **overlap 5s mid-phrase**. C'est un finding critique de la simulation Inoxtag (perte mid-phrase boundaries sans overlap).

2. Whisper prompt param obligatoire avec le guestName si fourni. Finding critique simulation Inoxtag : "Inoxtag" jamais reconnu sans prompt param. Format prompt :
   ```
   "Podcast français. Invité : ${guestName}. Vocabulaire entrepreneurial, finance, tech."
   ```

3. Concaténation des chunks avec dedup overlap (algo simple : pour chaque chunk N+1, retirer les premiers segments dont le start_seconds < end_seconds du dernier segment du chunk N).

4. Coût calculé : $0.006 / minute audio Whisper API.

**Tests obligatoires** :
- Mock Whisper API (pas d'appel réel en CI)
- Audio < 25 MB : 1 chunk, pas de split
- Audio > 25 MB : split + dedup overlap correct
- guestName fourni : prompt param présent dans la requête mock
- guestName absent : prompt par défaut
- Calcul coût correct sur audio de durée connue

**Cap qualité** : 7+/10. Pas de tuning de prompt complexe attendu. Discipline : reproductibilité sur les 4 épisodes pilote en Phase 6.

### Primitive 1.2 — extractKeyMoments

**Objectif** : extraire 5 moments clés clippables d'un épisode podcast à partir du transcript.

**Contrat** :
```typescript
async function extractKeyMoments(
  transcript: TranscriptResult,
  options: {
    guestName: string
    podcastContext: PodcastContext
    maxMoments?: number  // default 5
  }
): Promise<KeyMoment[]>

type KeyMoment = {
  start_seconds: number
  end_seconds: number
  title: string  // 8-12 mots
  hook: string  // 1 phrase pour réseaux sociaux
  rationale: string  // pourquoi ce moment
  saliency_score: number  // [0..1]
}
```

**Spec implémentation** :

1. Découpe le transcript en segments contigus de ~3-5 minutes pour analyse.

2. Appel Sonnet 4.6 avec prompt structuré demandant 5 moments clippables. Le prompt doit inclure :
   - Le contexte podcast (GDIY = entrepreneuriat, LM = finance personnelle, etc.)
   - Le nom de l'invité
   - Une consigne stricte : pas de citation chiffrée non strictement présente dans le transcript (finding critique simulation Inoxtag : Sonnet hallucine "100M vues" sur Inoxtag).

3. Validation runtime via zod du schema KeyMoment[].

4. Si Sonnet retourne moins de 5 moments ou plus de 5, truncate à 5 en gardant les saliency_score top.

**Tests obligatoires** :
- Mock Sonnet response avec 5 moments valides → return 5
- Mock Sonnet response avec 6 moments → return top 5
- Mock Sonnet response avec 3 moments → return 3 (warning logged)
- Mock Sonnet response avec citation chiffrée hallucinée → filtrage ou warning
- Validation zod sur output Sonnet mal formé → throw

**Cap qualité** : 7+/10. Cible simulation Inoxtag : 7.0/10 atteint sans optimisation. Maintenir ce niveau.

### Primitive 1.3 — extractQuotes

**Objectif** : extraire 5 quotes prêtes pour réseaux sociaux à partir du transcript.

**Contrat** :
```typescript
async function extractQuotes(
  transcript: TranscriptResult,
  options: {
    guestName: string
    podcastContext: PodcastContext
    maxQuotes?: number  // default 5
  }
): Promise<Quote[]>

type Quote = {
  text: string  // verbatim transcript, max 280 chars
  author: string  // toujours guestName ou host (Stefani, etc.)
  start_seconds: number
  end_seconds: number
  platform_fit: ('twitter' | 'linkedin' | 'instagram')[]
  rationale: string
}
```

**Spec implémentation** :

1. Appel Sonnet 4.6 avec prompt demandant 5 quotes.

2. Garde-fous obligatoires dans le prompt :
   - "Quote MUST be verbatim from transcript, no paraphrasing"
   - "If you can't find 5 verbatim quotes, return fewer with warning"
   - "Author MUST be guestName or host name explicitly stated"

3. Validation post-Sonnet : pour chaque quote, vérifier que le text apparaît littéralement dans transcript.full_text. Si pas trouvé → quote rejetée.

**Tests obligatoires** :
- Mock Sonnet avec 5 quotes verbatim valides → return 5
- Mock Sonnet avec 1 quote paraphrasée (non-verbatim) → return 4 (la non-verbatim est rejetée)
- Mock Sonnet avec quote > 280 chars → truncate ou rejet
- platform_fit cohérent (pas de quote LinkedIn de 280 chars qui devrait être Twitter only)

**Cap qualité** : 7+/10. Cible simulation Inoxtag : 6.5/10 atteint, push à 7+ avec garde-fou verbatim strict.

### Primitive 1.4 — crossReferenceEpisode

**Objectif** : pour un épisode source, identifier 3-5 épisodes du catalogue cross-tenant qui prolongent ses thèmes, avec rationale explicite.

**Contrat** :
```typescript
async function crossReferenceEpisode(
  episodeId: string,
  transcript: TranscriptResult,
  options: {
    targetCount?: number  // default 3-5
    excludePodcasts?: string[]  // exclude same podcast for diversity
  }
): Promise<CrossReference[]>

type CrossReference = {
  target_episode_id: string
  target_podcast: string
  target_title: string
  target_guest: string
  similarity_distance: number  // pgvector distance
  why_relevant: string  // 1-2 phrases éditorial
  why_mono_podcast_rag_cant_find_this: string  // argument différenciation Sillon
}
```

**Spec implémentation** :

1. Calculer l'embedding du transcript source (ou utiliser un embedding pré-calculé si disponible dans episodes_enrichment).

2. Query pgvector cross-tenant :
   `SELECT episode_id, podcast, title, guest, embedding <-> $1 AS distance FROM episodes_enrichment ORDER BY distance LIMIT 20`

3. Boost cross-podcast : pour chaque candidat, si même podcast que source, multiplier distance par 1.2 (légère pénalité pour diversité).

4. Top 3-5 par distance ajustée.

5. Pour chaque sélection : appel Sonnet pour générer `why_relevant` + `why_mono_podcast_rag_cant_find_this`. Le second champ est l'argument commercial Sillon : pourquoi NotebookLM mono-source ne pourrait pas trouver cette connexion.

**Tests obligatoires** :
- Mock pgvector query → top 20 candidates
- Boost cross-podcast appliqué correctement
- Top 3-5 sélectionnés selon distance ajustée
- Mock Sonnet pour génération why_* → quotes valides
- Cas edge : moins de 5 candidats avec distance < threshold → return ce qui existe avec warning

**Cap qualité** : 7.5+/10. Cible simulation Inoxtag : 7.5/10 atteint sur Inoxtag. Maintenir ou améliorer.

### Primitive 1.5 — persistEditorialEvents

**Objectif** : persister les événements éditoriaux (key_moments, quotes, cross_refs, lens_classifications) dans la table editorial_events créée en Phase 2.

**Contrat** :
```typescript
async function persistEditorialEvents(
  sourceId: string,
  events: EditorialEventInput[]
): Promise<EditorialEvent[]>

type EditorialEventInput = {
  type: string  // 'key_moment' | 'quote' | 'cross_reference' | 'lens_classification'
  position: { start_seconds: number; end_seconds: number }
  content_text?: string
  metadata: unknown  // validé via zod schema selon type
  lens_tags?: string[]
}
```

**Spec implémentation** :

1. Pour chaque event, valider le metadata via le schema zod correspondant au type (cf. engine/db/types/editorial-event-metadata.ts pour lens_classification, à étendre en Phase 2 pour les autres types).

2. Insertion par batch (rappel : Neon HTTP OOM au-delà de ~10 inserts parallèles → batcher par 8).

3. Return les événements créés avec leur id généré.

**Tests obligatoires** :
- Insert d'un event lens_classification valide → succès
- Insert d'un event lens_classification avec metadata invalide → throw zod error
- Insert batch de 20 events → 3 batches de 8/8/4
- Insert event avec type inconnu → warning ou throw selon décision

**Cap qualité** : 7+/10 (utilitaire technique, pas de pivot).

### STOP intermédiaire après Phase 1

Format attendu :

```
PHASE 1 PRIMITIVES — TERMINÉE

Primitives livrées : 5/5
- transcribeAudio ✅
- extractKeyMoments ✅
- extractQuotes ✅
- crossReferenceEpisode ✅
- persistEditorialEvents ✅

Tests :
- Avant : 335 verts
- Après : N verts (delta : +X tests primitives)
- Régression : aucune

Commits : N commits sur master (merge direct ou branche dédiée selon décision Jérémy à formaliser au démarrage)

Cap qualité auto-évaluation :
- transcribeAudio : N/10
- extractKeyMoments : N/10
- extractQuotes : N/10
- crossReferenceEpisode : N/10
- persistEditorialEvents : N/10

Findings nouveaux à signaler : (liste si applicable)

Prêt pour Phase 2 (engagements architecturaux) : oui / non
```

## PHASE 2 — ENGAGEMENTS ARCHITECTURAUX 1+2+3 (mardi PM, ~0.5 jour)

Note : Engagement 1 (table editorial_events) est livré PARTIELLEMENT par Phase 1 (la primitive persistEditorialEvents l'utilise). Cette phase finalise la création SQL + helpers + tests.

### Engagement 1 — Table editorial_events

**Objectif** : table polymorphe pour stocker les événements éditoriaux de tout type (key_moment, quote, cross_reference, lens_classification, etc.).

**Spec migration SQL** :

```sql
-- engine/db/migrations/2026-04-28-create-editorial-events.sql
-- Idempotente. Additive (pas de touch sur tables existantes).

CREATE TABLE IF NOT EXISTS editorial_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'episode',
  type TEXT NOT NULL,
  position JSONB NOT NULL,
  content_text TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  lens_tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS editorial_events_source_idx
  ON editorial_events (source_id, source_type);
CREATE INDEX IF NOT EXISTS editorial_events_type_idx
  ON editorial_events (type);
CREATE INDEX IF NOT EXISTS editorial_events_lens_tags_idx
  ON editorial_events USING gin (lens_tags);
```

**Important** : type est string libre (pas enum SQL), pour extensibilité aux espaces 1/2/3 futurs sans migration.

**Application migration** : utiliser le pattern one-shot validé dimanche soir (`npx tsx -e ".then() chaîné"` ligne unique), PAS le wrapper migrate-entities.ts qui a un bug connu. Documenter dans docs/DETTE.md le bug du wrapper avant la migration suivante (table editorial_events serait la 2e migration, donc fix wrapper avant ?).

Décision : tu fixes le wrapper `engine/db/migrate-entities.ts` AVANT d'appliquer cette migration. C'est le moment.

**Helpers minimaux** :

```typescript
// engine/db/editorial-events.ts

export async function getEditorialEventsBySource(
  sourceId: string,
  options?: { types?: string[]; lens_tags?: string[] }
): Promise<EditorialEvent[]>

export async function insertEditorialEvent(
  event: EditorialEventInput
): Promise<EditorialEvent>

export async function insertEditorialEventsBatch(
  events: EditorialEventInput[]
): Promise<EditorialEvent[]>
```

**Tests obligatoires** :
- Migration appliquée → table existe avec colonnes attendues + 3 indexes
- getEditorialEventsBySource retourne events filtrés par type
- insertEditorialEvent valide metadata via zod selon type
- Batch insert respecte la limite Neon (8 par batch)

### Engagement 2 — Interface Lens + Scoring registry

**Objectif** : poser l'infrastructure pour les lens éditoriaux configurables par client.

**Interface TypeScript** :

```typescript
// engine/types/lens.ts

export interface Lens {
  id: string
  type: string  // 'editorial' | 'sponsor' | 'audience' | extensible
  scoring_strategy_id: string
  applicable_content_types: string[]
  parameters: Record<string, unknown>
  description?: string
}

// engine/lens/scoring-registry.ts

export type ScoringFunction = (
  event: EditorialEvent,
  params: unknown
) => number  // [0..1]

const registry = new Map<string, ScoringFunction>()

export function registerScoringStrategy(
  id: string,
  fn: ScoringFunction
): void

export function getScoringStrategy(id: string): ScoringFunction
// throw if not found
```

**Discipline** : pour le pilote, tu enregistres UNIQUEMENT les 5 lens du registry pilote (cf. Phase 3 ci-dessous : ovni-vc-deeptech, alternative-investments, dtc-acquisition-tactical, b2b-insurance-tech, editorial-base). Pas de lens spéculatives.

**Tests obligatoires** :
- registerScoringStrategy + getScoringStrategy round-trip
- getScoringStrategy('inexistant') → throw
- Validation que les 5 lens du pilote sont enregistrées au démarrage

### Engagement 3 — Champ beneficiary_type dans DeliverablePack

**Objectif** : préparer la tripartition créateur/audience/sponsor sans la coder.

**Modification** :

```typescript
// engine/pipelines/runPack.ts

export interface DeliverablePack {
  id: string
  client_id: string
  pack_type: string
  beneficiary_type: string  // ← AJOUT : 'creator' pour pilote, extensible
  triggers: TriggerDefinition[]
  agents_to_run: AgentSequence[]
  output_format: string
  delivery_channel: string
}
```

**Discipline** : pour le pilote Stefani, tu utilises UNIQUEMENT `'creator'`. Pas de spéculation sur 'audience' / 'sponsor'.

**Tests obligatoires** :
- Création d'un DeliverablePack avec beneficiary_type='creator' → OK
- Création sans beneficiary_type → throw (mandatory)
- Le runPack utilise beneficiary_type dans le rendering (cf. Phase 5 pour le renderer)

### STOP intermédiaire après Phase 2

```
PHASE 2 ENGAGEMENTS ARCHITECTURAUX — TERMINÉE

Engagement 1 (editorial_events) :
- Migration appliquée : ✅ ou ❌ + raison
- Wrapper migrate-entities.ts : fixé / contourné via one-shot
- Helpers livrés : 3
- Tests : N verts

Engagement 2 (Lens registry) :
- Interface livrée : ✅
- Registry minimal : 5 lens enregistrées
- Tests : N verts

Engagement 3 (beneficiary_type) :
- Champ ajouté : ✅
- Valeur 'creator' partout dans configs pilote
- Tests : N verts

Tests cumulés : N verts (delta : +X)
Régression : aucune

Prêt pour Phase 3 (lensClassificationAgent) : oui / non
```

## PHASE 3 — lensClassificationAgent (mercredi, ~1 jour, AGENT PIVOT)

C'est l'agent CENTRAL du pivot stratégique post-validation persona. Tout le reste sert à le servir. Tuning maximum sur cet agent.

### Objectif

Pour un épisode podcast, classifier les segments transcript selon les lens éditoriaux du client actif, et persister les événements lens_classification dans editorial_events.

### Contrat

```typescript
// engine/agents/lensClassificationAgent.ts

async function lensClassificationAgent(
  sourceId: string,
  transcript: TranscriptResult,
  client: ClientConfig
): Promise<LensClassificationResult>

type LensClassificationResult = {
  events_created: EditorialEvent[]
  lens_distribution: { [lens_id: string]: number }
  warnings: string[]
  cost_usd: number
}
```

### Spec implémentation

1. Charger les lens du client depuis client.lenses (5 lens pour le pilote Stefani-Orso).

2. Découper le transcript en segments analytiques (3-5 minutes chacun, ou cohérence sémantique si possible).

3. Pour chaque segment, appel Sonnet 4.6 avec prompt structuré :
   - Description des 5 lens du client
   - Segment de transcript
   - Demande : pour chaque lens applicable, fournir lens_score [0..1], rationale (20-500 chars), matched_concepts optionnel
   - Format JSON strict (parsable par zod schema LensClassificationMetadataSchema déjà livré)

4. Filtrage : seuls les matches avec lens_score >= 0.3 sont retenus (seuil arbitraire à calibrer en Phase 4).

5. Persistance : pour chaque match retenu, créer un event lens_classification dans editorial_events avec metadata = {lens_id, lens_score, transcript_segment, rationale, matched_concepts}.

6. Return distribution + warnings (ex: "lens X jamais matché sur cet épisode") + cost.

### Lens registry initial pour le pilote Stefani-Orso

À enregistrer dans clients/stefani-orso.config.ts :

```typescript
export const stefaniOrsoConfig: ClientConfig = {
  // ... reste de la config existante

  lenses: [
    {
      id: 'ovni-vc-deeptech',
      type: 'editorial',
      scoring_strategy_id: 'concept-match-v1',
      applicable_content_types: ['podcast_episode'],
      parameters: {
        concepts: [
          'scaleup tech B2B européenne',
          'deeptech infrastructure',
          'levée Series B+ 50M€-300M€',
          'fondateur tech avec ambition européenne',
          'product/market fit confirmé',
          'enjeu de scale international',
          'profil eligible Ovni Capital VC'
        ]
      },
      description: 'Scaleup tech B2B avec ambition européenne, profil Ovni Capital'
    },
    {
      id: 'alternative-investments',
      type: 'editorial',
      scoring_strategy_id: 'concept-match-v1',
      applicable_content_types: ['podcast_episode'],
      parameters: {
        concepts: [
          'investissement spéculatif niche',
          'collectibles (cartes, montres, art, sneakers)',
          'crypto trading expert',
          'immobilier atypique (parkings, terres, garages)',
          'rendement asymétrique',
          'marché illiquide ou émergent',
          'patrimoine non-conventionnel'
        ]
      },
      description: 'Investissement hors-marché classique, niche, asymétrique'
    },
    {
      id: 'dtc-acquisition-tactical',
      type: 'editorial',
      scoring_strategy_id: 'concept-match-v1',
      applicable_content_types: ['podcast_episode'],
      parameters: {
        concepts: [
          'e-commerce DTC',
          'acquisition payante (Facebook Ads, Google, Amazon)',
          'performance marketing',
          'CAC LTV unit economics',
          'scaling operationnel rapide',
          'brand-building digital natif',
          'retail tactique data-driven'
        ]
      },
      description: 'E-commerce DTC avec stratégie acquisition payante performance'
    },
    {
      id: 'b2b-insurance-tech',
      type: 'editorial',
      scoring_strategy_id: 'concept-match-v1',
      applicable_content_types: ['podcast_episode'],
      parameters: {
        concepts: [
          'insurtech B2B',
          'cyber-insurance',
          'assurance entreprise spécialisée',
          'tech au service de la finance',
          'product mid-market',
          'distribution via courtiers',
          'risque émergent'
        ]
      },
      description: 'Insurtech B2B (cyber, RH, garantie spécialisée)'
    },
    {
      id: 'editorial-base',
      type: 'editorial',
      scoring_strategy_id: 'concept-match-v1',
      applicable_content_types: ['podcast_episode'],
      parameters: {
        concepts: [
          'parcours entrepreneurial',
          'leçons business',
          'discipline mentale',
          'prise de risque',
          'culture d\'entreprise'
        ]
      },
      description: 'Lens fallback générique, applicable à la plupart des épisodes Orso'
    }
  ]
}
```

### Discipline tuning

Cet agent reçoit 60% du temps de tuning Phase 3. Mardi soir, tu livres une V1. Mercredi, tu itères jusqu'à atteindre les critères Phase 4.

Discipline anti-régression sur Sonnet hallucinations :
- Le prompt système doit interdire toute citation chiffrée non présente dans le segment transcript fourni
- Le rationale doit être strictement basé sur le segment, pas sur la connaissance générale Sonnet
- Les matched_concepts doivent être des extraits littéraux ou très proches du segment

### Tests obligatoires

- Mock Sonnet sur 1 segment + 5 lens : retour valide
- Mock Sonnet avec lens_score < 0.3 : event NOT créé
- Mock Sonnet avec rationale trop court (<20 chars) : zod throw
- Validation distribution lens : le total des events créés est cohérent
- Cas edge : 0 lens matche → return result avec warnings

### STOP intermédiaire après Phase 3

```
PHASE 3 lensClassificationAgent V1 — TERMINÉE

Agent livré : ✅
Lens registry : 5 lens enregistrées (ovni-vc-deeptech,
alternative-investments, dtc-acquisition-tactical,
b2b-insurance-tech, editorial-base)

Tests : N verts (delta : +X)

Run préliminaire sur 1 épisode pilote (recommandé GDIY #266 Plais comme baseline) :
- Cost Sonnet : $X
- Events créés : N (distribution lens : ...)
- Cohérence éditoriale : auto-évaluation 1-10

Prêt pour Phase 4 (jalon calibration) : oui / non
```

## PHASE 4 — JALON CALIBRATION (mercredi soir, STOP STRATÉGIQUE)

**C'est le moment décision go/no-go pour la suite.**

### Objectif

Évaluer la qualité de lensClassificationAgent sur 9 lens-épisode (3 lens × 3 épisodes pilote) pour décider :
- Envoi 13/05 (cible nominale)
- Envoi 20/05 (décalage 1 semaine)
- Discussion scope si qualité insuffisante

### Spec exécution

1. Sélectionner 3 épisodes pilote parmi les 4 (recommandation : garder le 4e pour test final Phase 6) :
   - GDIY #266 Plais
   - La Martingale #174 Pokémon
   - Finscale #107 Stoïk

   (Le Panier #128 Nooz gardé pour Phase 6 final.)

2. Sélectionner 3 lens parmi les 5 enregistrés (les plus transversaux) :
   - ovni-vc-deeptech
   - alternative-investments
   - editorial-base

3. Lancer lensClassificationAgent sur chacune des 3 × 3 = 9 combinaisons.

4. Pour chaque output, auto-évaluation Claude Code (1-10) sur :
   - Pertinence des matches (les segments classés sous lens X sont-ils vraiment du lens X ?)
   - Qualité des rationale (cohérent avec le contenu du segment ?)
   - Distribution réaliste (pas tous les segments matchent toutes les lens — sinon scoring trop permissif)

5. Reporting STOP intermédiaire avec scores 9 lens-épisode.

### Critères go/no-go

| Résultat | Verdict | Action |
|---|---|---|
| ≥ 7/9 à 7+/10 | GO 13/05 | Phase 5 démarre jeudi |
| 5-6/9 à 7+/10 | GO 20/05 | Phase 5 démarre jeudi mais cap ajusté |
| < 5/9 à 7+/10 | DISCUSSION SCOPE | STOP. Jérémy + Claude.ai discutent recalibrage. |

### STOP intermédiaire OBLIGATOIRE

Format strict pour décision Jérémy :

```
PHASE 4 JALON CALIBRATION — TERMINÉE

9 lens-épisode évalués :

| Episode | Lens | Score | Rationale |
|---|---|---|---|
| GDIY #266 | ovni-vc-deeptech | N/10 | ... |
| GDIY #266 | alternative-investments | N/10 | ... |
| GDIY #266 | editorial-base | N/10 | ... |
| LM #174 | ovni-vc-deeptech | N/10 | ... |
| LM #174 | alternative-investments | N/10 | ... |
| LM #174 | editorial-base | N/10 | ... |
| Finscale #107 | ovni-vc-deeptech | N/10 | ... |
| Finscale #107 | alternative-investments | N/10 | ... |
| Finscale #107 | editorial-base | N/10 | ... |

Total ≥ 7/10 : N/9
Cost cumulé Sonnet : $X

Verdict auto :
- ≥ 7/9 → GO 13/05
- 5-6/9 → GO 20/05
- < 5/9 → DISCUSSION SCOPE (STOP)

Findings nouveaux Phase 4 (s'il y en a) : ...

ATTENTE DÉCISION JÉRÉMY : continuer Phase 5 ou recalibrer ?
```

**TU NE CONTINUES PAS PHASE 5 SANS GO EXPLICITE DE JÉRÉMY APRÈS LECTURE DU STOP PHASE 4.** C'est le seul vrai STOP stratégique de toute la mission.

## PHASE 5 — LIVRABLES PACK 2 REFRAMED (jeudi-vendredi, ~2 jours)

**Conditionnel à GO Phase 4.**

### Vue d'ensemble

Construire les 5 livrables Pack 2 reframed à partir des primitives Phase 1 + lensClassificationAgent Phase 3. Pas de nouveaux agents indépendants, juste des compositions intelligentes.

### Livrables Pack 2

**Livrable 1 — Key moments (5 par épisode)**
Reuse direct de extractKeyMoments. Avec mention systématique de l'écosystème Orso si moment connecte à autre podcast.

**Livrable 2 — Quotes (5 par épisode)**
Reuse direct de extractQuotes. Verbatim strict.

**Livrable 3 — Cross-refs PAR LENS (3-5 par épisode, pivot)**
Composition crossReferenceEpisode + lensClassificationAgent. Les cross-refs sont organisées par lens éditorial actif sur l'épisode source. Format :
```
## Si vous avez aimé l'angle ovni-vc-deeptech
- Episode X (Podcast Y) — pourquoi pertinent
- Episode Z (Podcast W) — pourquoi pertinent

## Si vous avez aimé l'angle alternative-investments
- ...
```

**Livrable 4 — Newsletter cross-corpus (1 par épisode, 350-450 mots)**
Composition de tous les outputs précédents + injection cross-corpus context dans le prompt système. Discipline forte sur la non-hallucination de chiffres.

**Livrable 5 — Brief annexe "Cross-catalogue brief annexe : revoir cet épisode après l'écoute" (1 par épisode)**
Extension du livrable cross-refs avec un format mini-page (200-300 mots) classé par lens. C'est le livrable directement issu de l'Angle 3 reframed du verdict simulation.

### Discipline transversale Phase 5

Tous les livrables doivent :
- Mentionner explicitement l'écosystème Orso si pertinent (résoud finding 3 verdict persona)
- Utiliser le vocabulaire "production éditoriale" (résoud finding 1)
- Citer des cross-refs vers AU MOINS 2 podcasts différents par épisode pilote (diversité)
- Être livrable au beneficiary_type='creator' (cohérent Engagement 3)

### Cap qualité phase 5

7.5+/10 sur livrables 3, 4, 5 (pivots). 7+/10 sur livrables 1, 2 (commodities).

### STOP intermédiaire après Phase 5

```
PHASE 5 LIVRABLES PACK 2 — TERMINÉE

5 livrables produits sur 4 épisodes pilote = 20 outputs.

Auto-évaluation qualité :
| Livrable | Plais | Pokémon | Nooz | Stoïk | Moyenne |
|---|---|---|---|---|---|
| 1 Key moments | N | N | N | N | N |
| 2 Quotes | N | N | N | N | N |
| 3 Cross-refs par lens | N | N | N | N | N |
| 4 Newsletter | N | N | N | N | N |
| 5 Brief annexe | N | N | N | N | N |

Cap qualité atteint : oui / partiel / non
Tests : N verts (delta : +X)

Prêt pour Phase 6 (run E2E) : oui / non
```

## PHASE 6 — RUN E2E (samedi, ~0.5 jour)

### Objectif

Exécuter le pipeline complet (Phase 1 → 5) sur les 4 épisodes pilote, produire les outputs finaux dans le format de livraison Stefani.

### Spec

1. Pour chaque épisode pilote (4 itérations) :
   - Appel transcribeAudio
   - Appel extractKeyMoments + extractQuotes + crossReferenceEpisode
   - Appel lensClassificationAgent
   - Persistance editorial_events
   - Génération des 5 livrables Pack 2
   - Output : 1 PDF (ou Markdown formaté) par épisode

2. Cumul de coût final Sonnet + Whisper.

3. Vérification éditoriale finale :
   - Pas d'hallucination de chiffres
   - Vocabulaire production cohérent
   - Mention écosystème Orso présente
   - Cross-refs vers 2+ podcasts différents

### Output attendu

`outputs/pilot-stefani/2026-04-XX/` avec :
- `plais-platform-sh.md` (ou .pdf)
- `boissenot-pokemon.md`
- `nooz-optics.md`
- `veyrat-stoik.md`
- `_summary.md` avec coût total et stats

### STOP intermédiaire après Phase 6

```
PHASE 6 RUN E2E — TERMINÉ

4 épisodes pilote traités :
- Plais (GDIY #266) ✅
- Pokémon (LM #174) ✅
- Nooz (LP #128) ✅
- Stoïk (Finscale #107) ✅

Cost total :
- Whisper : $X
- Sonnet : $X
- Total : $X (cible budget : ~$30)

Outputs livrés : outputs/pilot-stefani/2026-04-XX/

Auto-évaluation finale par épisode (1-10) :
| Episode | Score | Forces | Faiblesses |
|---|---|---|---|
| Plais | N/10 | ... | ... |
| Pokémon | N/10 | ... | ... |
| Nooz | N/10 | ... | ... |
| Stoïk | N/10 | ... | ... |

Recommandation finale envoi :
- 13/05 si tous ≥ 7.5
- 20/05 si certains à itérer
- Discussion scope si moyennes < 7

ATTENTE DÉCISION JÉRÉMY pour envoi.
```

## PHASE 7 — UPDATE ROADMAP_INTERNE.MD (parallèle Phase 5-6)

À faire en arrière-plan pendant Phase 5-6, ou en finition Phase 6 si pas le temps avant.

### Sections à ajouter/mettre à jour dans docs/ROADMAP_INTERNE.md

1. **Section "Récit produit unifié"** : tripartition créateur / audience / sponsor + lien avec les 3 espaces.

2. **Section "Trois espaces produits identifiés"** : description sourcée de chaque espace (re-circulation catalogue / attribution sponsor / pitch decks sponsor) + déclencheurs d'activation séquentiels.

3. **Section "Architecture de portabilité"** : les 4 engagements architecturaux + marqueurs de validation + test mental "scénario studio cinéma 2027" comme jalon vérifiable.

4. **Section "Pièges de prématurité à éviter"** : modélisation enum fermée, plugins overengineered, agents trop abstraits, UI multi-vertical prématurée, tests d'intégration sans clients réels.

### Coût estimé

25 min de rédaction. Peut être délégué à Claude Code en fin de session avec instructions précises.

## DISCIPLINE TRANSVERSALE — RAPPELS

À chaque commit, la discipline suivante s'applique :

1. **Commit messages descriptifs** : préfixe (feat/fix/chore/docs/refactor) + scope (architecture/primitives/agents/...) + description claire.

2. **Pas de force-push sur master.** Toute modif passe par commit + push.

3. **Tests verts avant commit.** Si rouge introduit : revert ou fix.

4. **Validation runtime via zod** sur tous les inputs externes (DB jsonb, LLM outputs, API responses).

5. **Pas de modification de cross_podcast_guests** (table intentionnellement non touchée par l'architecture étendue).

6. **Documenter la dette** dans docs/DETTE.md si tu identifies quelque chose à fixer plus tard (ex: bug wrapper migrate-entities.ts).

## STOPS INTERMÉDIAIRES OBLIGATOIRES — RÉSUMÉ

Tu fais un STOP avec validation Jérémy à ces moments :

| STOP | Position | Auto-continue ou attente Jérémy ? |
|---|---|---|
| Après Phase 1 (primitives) | Lundi soir | Auto-continue Phase 2 si verts |
| Après Phase 2 (engagements) | Mardi soir | Auto-continue Phase 3 si verts |
| Après Phase 3 (agent V1) | Mercredi midi | Auto-continue Phase 4 |
| **Après Phase 4 (jalon calibration)** | **Mercredi soir** | **STOP STRATÉGIQUE — attente Jérémy** |
| Après Phase 5 (livrables) | Vendredi soir | Auto-continue Phase 6 si verts |
| Après Phase 6 (E2E) | Samedi midi | STOP final — attente Jérémy pour envoi |

Le seul STOP stratégique non-négociable est Phase 4. Les autres sont des points de contrôle où tu rapportes mais continues si tout est conforme.

## FORMAT STOP FINAL ATTENDU

À la fin complète de la mission (Phase 6 + Phase 7) :

```
MISSION PILOTE STEFANI-ORSO — TERMINÉE

État cumulé :
- Phases livrées : 1, 2, 3, 4, 5, 6, 7 ✅
- Tests : N verts (delta total : +X depuis baseline 335)
- Régression : aucune

Coût total :
- Whisper : $X
- Sonnet : $X
- Total : $X

Outputs livrables :
- 4 épisodes pilote complets (Pack 2 reframed)
- editorial_events table populée avec lens_classifications
- ROADMAP_INTERNE.md à jour

Verdict qualité final :
- 4 épisodes ≥ 7.5/10 → GO envoi 13/05
- Certains à itérer → discussion timeline
- Moyenne < 7 → recalibrage scope

Findings stratégiques nouveaux à intégrer dans email v4 : ...

Dette technique introduite : ...

PROCHAINE ÉTAPE : décision Jérémy sur envoi pilote + finalisation mail v4.
```

## LIMITES STRICTES TRANSVERSALES

- Pas de modification de cross_podcast_guests
- Pas de modification de l'auth middleware
- Pas de touch aux frontends (engine/api/ uniquement, pas frontend/)
- Pas d'ajout de dépendance npm sans validation Jérémy explicite
- Pas de migration SQL non-additive
- Cap budget Sonnet : ~$30 sur l'ensemble du pilote (alerter si dépassement à 50%)

## GO / NO-GO DÉMARRAGE

Avant de démarrer Phase 1 lundi matin, vérifications préalables :

1. Master à jour avec 880c3f1 (ou descendant)
2. Working tree clean
3. Tests 335/335 verts
4. zod 4.3.6 disponible
5. Variables d'environnement Neon + Anthropic + OpenAI accessibles (.env.local)
6. Whisper API testable (test d'1 minute audio)
7. Sonnet 4.6 testable (test 1 prompt simple)

Si tous ✅ → GO Phase 1.
Si l'un ❌ → STOP, signaler à Jérémy, attendre.

GO mission complète si pré-flight validé.
