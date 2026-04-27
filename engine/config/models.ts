/**
 * Model routing config — Phase 5 V5.
 *
 * Centralise les IDs des modèles utilisés par la chaîne de production
 * éditoriale (génération, validation, rewrite premium) et les caps budget.
 *
 * - generation : Sonnet 4.6 — premier draft des livrables.
 * - validation : Sonnet 4.6 — oracle qualité, doit rester stable.
 * - rewrite_premium : Opus 4.7 — déclenché si validation < cap qualité.
 *
 * Cap budget par livrable : 0.50 USD, max 2 appels Opus puis bascule
 * fail-safe Option B-dégradée.
 */

export const MODELS = {
  generation: 'claude-sonnet-4-6',
  validation: 'claude-sonnet-4-6',
  rewrite_premium: 'claude-opus-4-7',
} as const;

export const MODEL_LIMITS = {
  rewrite_premium_max_calls_per_livrable: 2,
  rewrite_premium_cap_per_livrable_usd: 0.5,
} as const;

// Tarifs publics Anthropic (USD / million tokens). Sert au calcul du coût
// estimé d'un appel Opus 4.7 pour respecter le cap budget.
export const PRICING = {
  'claude-opus-4-7': { input_per_mtok: 15, output_per_mtok: 75 },
  'claude-sonnet-4-6': { input_per_mtok: 3, output_per_mtok: 15 },
  'claude-haiku-4-5-20251001': { input_per_mtok: 1, output_per_mtok: 5 },
} as const;

export function estimateCostUsd(
  model: keyof typeof PRICING,
  inputTokens: number,
  outputTokens: number,
): number {
  const p = PRICING[model];
  return (
    (inputTokens / 1_000_000) * p.input_per_mtok +
    (outputTokens / 1_000_000) * p.output_per_mtok
  );
}
