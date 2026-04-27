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
