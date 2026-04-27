/**
 * engine/lens — Point d'entrée du module lens.
 *
 * Expose :
 *   - Lens (ré-export depuis engine/types/lens.ts)
 *   - scoring-registry (register/get/has/list/clear)
 *   - concept-match-v1 (la stratégie + son ID)
 *   - registerPilotScoringStrategies() : helper d'init pour le pilote
 *     Stefani-Orso, à appeler au boot de tout pipeline qui consomme
 *     les lens du pilote.
 */

import {
  registerScoringStrategy,
  hasScoringStrategy,
  listScoringStrategies,
} from './scoring-registry';
import { conceptMatchV1, CONCEPT_MATCH_V1_ID } from './concept-match-v1';

export type { Lens } from '@engine/types/lens';
export {
  registerScoringStrategy,
  getScoringStrategy,
  hasScoringStrategy,
  listScoringStrategies,
  clearScoringRegistry,
  type ScoringFunction,
} from './scoring-registry';
export {
  conceptMatchV1,
  CONCEPT_MATCH_V1_ID,
  type ConceptMatchV1Params,
} from './concept-match-v1';

/**
 * Enregistre les stratégies de scoring nécessaires aux lens du pilote
 * Stefani-Orso (les 5 lens utilisent toutes `concept-match-v1`).
 *
 * Idempotent : ne ré-enregistre pas si déjà présent.
 *
 * Usage typique :
 *   import { registerPilotScoringStrategies } from '@engine/lens';
 *   registerPilotScoringStrategies();  // au boot du pipeline
 */
export function registerPilotScoringStrategies(): string[] {
  if (!hasScoringStrategy(CONCEPT_MATCH_V1_ID)) {
    registerScoringStrategy(CONCEPT_MATCH_V1_ID, conceptMatchV1);
  }
  return listScoringStrategies();
}
