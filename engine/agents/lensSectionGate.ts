/**
 * lensSectionGate — Décide si un livrable doit générer une section pour
 * un lens donné, en fonction de la matière disponible (Phase 5 V4 Change 2).
 *
 * Critères :
 *  1. >= MIN_MATCHES_ON_EPISODE mentions du lens sur l'épisode source
 *  2. >= MIN_RELEVANT_CANDIDATES candidats cross-tenant pertinents
 *     (distance < MAX_RELEVANT_DISTANCE)
 *
 * Si l'un échoue → skip section et logger la raison.
 *
 * Cf. docs/brief-phase5-v4-refonte-2026-04-30.md (Change 2).
 */

const MIN_MATCHES_ON_EPISODE = 3;
const MIN_RELEVANT_CANDIDATES = 5;
const MAX_RELEVANT_DISTANCE = 0.7;

export interface LensCandidateForGate {
  /** Distance pgvector (cosine) source ↔ candidat. */
  distance: number;
  podcast_id?: string;
  episode_id?: string;
}

export interface LensSectionGateInput {
  lens_id: string;
  matches_on_episode: number;
  candidates: LensCandidateForGate[];
}

export interface LensSectionGateOptions {
  /** Override seuils (défaut : 3 matches / 5 candidats / dist < 0.7). */
  minMatchesOnEpisode?: number;
  minRelevantCandidates?: number;
  maxRelevantDistance?: number;
}

export interface LensSectionGateDecision {
  shouldGenerate: boolean;
  reason?: string;
  details: {
    lens_id: string;
    matches_on_episode: number;
    relevant_candidates: number;
    threshold_matches: number;
    threshold_candidates: number;
    threshold_distance: number;
  };
}

export function shouldGenerateLensSection(
  input: LensSectionGateInput,
  options: LensSectionGateOptions = {},
): LensSectionGateDecision {
  const minMatches = options.minMatchesOnEpisode ?? MIN_MATCHES_ON_EPISODE;
  const minCandidates = options.minRelevantCandidates ?? MIN_RELEVANT_CANDIDATES;
  const maxDistance = options.maxRelevantDistance ?? MAX_RELEVANT_DISTANCE;

  const relevantCandidates = input.candidates.filter(
    (c) => c.distance < maxDistance,
  ).length;

  const baseDetails = {
    lens_id: input.lens_id,
    matches_on_episode: input.matches_on_episode,
    relevant_candidates: relevantCandidates,
    threshold_matches: minMatches,
    threshold_candidates: minCandidates,
    threshold_distance: maxDistance,
  };

  if (input.matches_on_episode < minMatches) {
    return {
      shouldGenerate: false,
      reason: `Lens '${input.lens_id}' a seulement ${input.matches_on_episode} mention(s) sur l'épisode source. Minimum requis : ${minMatches}.`,
      details: baseDetails,
    };
  }

  if (relevantCandidates < minCandidates) {
    return {
      shouldGenerate: false,
      reason: `Pool pgvector trop restreint pour lens '${input.lens_id}' : ${relevantCandidates} candidats pertinents (distance < ${maxDistance}, < ${minCandidates} requis).`,
      details: baseDetails,
    };
  }

  return { shouldGenerate: true, details: baseDetails };
}

// =============================================================================
// Phase 6 micro-fix 3 — déduplication cross-refs par target_episode_id.
// =============================================================================

/**
 * Selection minimale requise pour la déduplication.
 * Le caller peut étendre avec des champs additionnels — ils sont préservés.
 */
export interface DedupableCrossRefSelection {
  target_episode_id: string;
  [key: string]: unknown;
}

export interface DedupCrossRefSelectionsOptions {
  /**
   * Ordre de priorité des lens : un episode_id retenu dans une section
   * lens prioritaire est skip dans les sections suivantes.
   *
   * Si absent, l'ordre des clés du Map d'entrée fait foi (insertion order).
   */
  lensOrder?: string[];
}

export interface DedupCrossRefSelectionsResult<T extends DedupableCrossRefSelection> {
  /** Map dédupliquée — chaque selection apparaît au plus 1 fois sur l'ensemble. */
  selectionsByLens: Map<string, T[]>;
  /** Liste des skips effectués (pour log / audit). */
  removed: Array<{ lens_id: string; target_episode_id: string; first_seen_in: string }>;
}

/**
 * Déduplique les sélections cross-refs entre sections lens : si un target_episode_id
 * apparaît déjà dans une section traitée plus tôt (ordre `lensOrder` ou ordre du Map),
 * on l'évince des sections suivantes.
 *
 * Effet de bord souhaité : éviter qu'un même invité (ex. Zocchetto/PayFit) figure dans
 * deux sections L3 différentes avec deux rationales contradictoires.
 *
 * NB : si une section descend sous 0/1 cross-ref après dédup, on garde ce qu'il reste —
 * le caller décide de masquer la section ou de l'afficher comme telle.
 */
export function dedupCrossRefSelectionsByEpisodeId<T extends DedupableCrossRefSelection>(
  selectionsByLens: Map<string, T[]>,
  options: DedupCrossRefSelectionsOptions = {},
): DedupCrossRefSelectionsResult<T> {
  const order = options.lensOrder
    ? options.lensOrder.filter((id) => selectionsByLens.has(id))
    : Array.from(selectionsByLens.keys());

  // Inclure les lens absents de `lensOrder` à la fin pour ne pas les perdre
  if (options.lensOrder) {
    for (const id of selectionsByLens.keys()) {
      if (!order.includes(id)) order.push(id);
    }
  }

  const alreadySelected = new Map<string, string>(); // episode_id -> first_seen_in
  const result = new Map<string, T[]>();
  const removed: DedupCrossRefSelectionsResult<T>['removed'] = [];

  for (const lensId of order) {
    const sels = selectionsByLens.get(lensId) ?? [];
    const kept: T[] = [];
    for (const sel of sels) {
      const epId = sel.target_episode_id;
      if (alreadySelected.has(epId)) {
        removed.push({
          lens_id: lensId,
          target_episode_id: epId,
          first_seen_in: alreadySelected.get(epId)!,
        });
        continue;
      }
      alreadySelected.set(epId, lensId);
      kept.push(sel);
    }
    result.set(lensId, kept);
  }

  return { selectionsByLens: result, removed };
}
