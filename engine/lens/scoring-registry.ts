/**
 * scoring-registry — Registry mutable de stratégies de scoring de lens.
 *
 * Engagement 2 du brief-primitives-2026-04-28.
 *
 * Pattern : registry singleton mutable (Map global au module). Les
 * stratégies sont enregistrées au boot du pipeline via
 * `registerPilotScoringStrategies()`. Les tests utilisent
 * `clearScoringRegistry()` pour isoler.
 *
 * Le scoring lui-même est appelé pour des cas de figure non-LLM :
 *   - Re-scoring déterministe d'événements existants (Phase 5 ?).
 *   - Sanity check / debug Sillon UI sur un classement Sonnet.
 *   - Backup si Sonnet rate / coupe budget.
 *
 * En Phase 3 V1, lensClassificationAgent utilise Sonnet directement pour
 * obtenir lens_score (le registry n'est pas appelé). Mais la
 * `scoring_strategy_id` est conservée dans la config Lens pour permettre
 * une bascule V2 vers un scoring déterministe sans changement de schéma.
 */

import type { EditorialEvent } from '@engine/primitives/persistEditorialEvents';

/**
 * Signature : prend un event éditorial + des paramètres opaques (shape
 * dépend de la strategy), retourne un score [0..1].
 *
 * Throw possibles :
 *   - params malformés pour la strategy ciblée
 *   - event manquant un champ obligatoire (ex: content_text vide)
 */
export type ScoringFunction = (event: EditorialEvent, params: unknown) => number;

const registry = new Map<string, ScoringFunction>();

export function registerScoringStrategy(id: string, fn: ScoringFunction): void {
  if (!id?.trim()) {
    throw new Error('scoring-registry: strategy id cannot be empty');
  }
  if (typeof fn !== 'function') {
    throw new Error(`scoring-registry: strategy '${id}' must be a function`);
  }
  registry.set(id, fn);
}

export function getScoringStrategy(id: string): ScoringFunction {
  const fn = registry.get(id);
  if (!fn) {
    throw new Error(
      `scoring-registry: no strategy registered with id '${id}'. Registered: [${listScoringStrategies().join(', ')}]`,
    );
  }
  return fn;
}

export function hasScoringStrategy(id: string): boolean {
  return registry.has(id);
}

export function listScoringStrategies(): string[] {
  return [...registry.keys()].sort();
}

export function clearScoringRegistry(): void {
  registry.clear();
}
