/**
 * Lens — Interface des lens éditoriaux activables par client.
 *
 * Engagement 2 du brief-primitives-2026-04-28.
 *
 * Discipline anti-overgeneralization (cap 4) :
 * - Cas présent : pilote Stefani-Orso définit 5 lens (4 thématiques + 1
 *   fallback editorial-base) toutes utilisant la stratégie de scoring
 *   `concept-match-v1`.
 * - Cas futurs validés (ROADMAP_INTERNE.md) : Espaces 2 (re-circulation
 *   catalogue) et 3 (pitch decks sponsor / attribution sponsor)
 *   introduiront d'autres `type` de lens (sponsor, audience).
 *
 * Le `type` est string libre (pas TS enum) pour les MÊMES raisons que
 * `editorial_events.type` : extensibilité multi-vertical sans modif TS.
 *
 * `scoring_strategy_id` référence une fonction enregistrée dans
 * `engine/lens/scoring-registry.ts`. La résolution échoue à
 * `getScoringStrategy()` si l'id est inconnu — fail-fast au démarrage du
 * pipeline.
 */
export interface Lens {
  id: string;
  /** Type sémantique. Pilote = 'editorial'. Roadmap = 'sponsor', 'audience'. */
  type: string;
  /** ID d'une stratégie enregistrée dans le scoring-registry. */
  scoring_strategy_id: string;
  /** Types de contenu sur lesquels cette lens s'applique. Pilote = ['podcast_episode']. */
  applicable_content_types: string[];
  /** Paramètres lus par la scoring-strategy (shape libre selon strategy). */
  parameters: Record<string, unknown>;
  description?: string;
}
