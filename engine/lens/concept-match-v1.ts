/**
 * concept-match-v1 — Stratégie de scoring déterministe par matching de
 * concepts littéraux dans le content_text d'un éditorial event.
 *
 * Algo : score = (concepts trouvés dans content_text) / (concepts totaux)
 * après normalisation (lowercase + strip accents).
 *
 * Justification cap 4 :
 * - Cas présent : 5 lens pilote Stefani-Orso utilisent toutes ce strategy_id
 *   (cf. clients/stefani-orso.config.ts post-Engagement 2).
 * - Cas futur : autres clients podcast réutilisent le même algo simple
 *   tant qu'ils n'ont pas un cas qui exige une strategy différente
 *   (embedding-similarity, sponsor-bid-match, etc.).
 *
 * Limite assumée : matching littéral. Un concept "scaleup tech B2B" ne
 * matchera pas si l'event content_text dit "scale-up B2B en tech" (ordre
 * et tirets différents). C'est volontaire pour V1 — le brief Phase 3
 * délègue le scoring fin à Sonnet, le concept-match-v1 ne sert que de
 * baseline déterministe pour Phase 4 sanity check.
 */

import type { ScoringFunction } from './scoring-registry';

export const CONCEPT_MATCH_V1_ID = 'concept-match-v1';

export interface ConceptMatchV1Params {
  concepts: string[];
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function isParams(p: unknown): p is ConceptMatchV1Params {
  return (
    typeof p === 'object' &&
    p !== null &&
    'concepts' in p &&
    Array.isArray((p as ConceptMatchV1Params).concepts) &&
    (p as ConceptMatchV1Params).concepts.every((c) => typeof c === 'string')
  );
}

export const conceptMatchV1: ScoringFunction = (event, params) => {
  if (!isParams(params)) {
    throw new Error(
      "concept-match-v1: params must be { concepts: string[] }",
    );
  }
  if (params.concepts.length === 0) return 0;

  const text = event.content_text ?? '';
  if (!text.trim()) return 0;

  const normText = normalize(text);
  let matched = 0;
  for (const concept of params.concepts) {
    if (concept.trim() && normText.includes(normalize(concept))) {
      matched++;
    }
  }
  return matched / params.concepts.length;
};
