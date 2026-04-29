/**
 * Sonnet LLMFn factory pour les wrappers d'agents (Phase Alpha S2 T2.2 — complément 29/04 PM).
 *
 * Pattern aligné sur experiments/autonomy-session-2026-04-28/phase6-runner.ts
 * (makeSonnetLlm) : wrap l'API Anthropic via @ai-sdk/anthropic, avec compteur
 * de coût injecté pour faciliter les budget caps côté caller.
 *
 * Pas un singleton : chaque caller (smoke run, prod runPack, tests) instancie
 * sa propre LLMFn pour avoir un compteur isolé.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import type { LLMFn } from '../../primitives/types';

// Pricing Anthropic au 29/04/2026 (USD / 1M tokens) — aligné avec
// phase6-runner estimateCostUsd (qui fait la même approximation).
const SONNET_INPUT_USD_PER_M = 3;
const SONNET_OUTPUT_USD_PER_M = 15;

export interface SonnetLlmFactoryOptions {
  /** Compteur de coût mutable injectable (cents-USD = USD × 100). */
  costTracker?: { totalCents: number; calls: number };
  /** Cap de coût en cents-USD. Si dépassé, throw avant l'appel. */
  budgetCapCents?: number;
  /** Override modèle pour tests (ex: claude-haiku). */
  model?: string;
}

/**
 * Crée une `LLMFn` Sonnet conforme au contrat des primitives Sillon.
 * Met à jour `costTracker` après chaque appel et throw si `budgetCapCents`
 * dépassé (avant l'appel, pour ne jamais dépasser).
 */
export function createSonnetLlm(options: SonnetLlmFactoryOptions = {}): LLMFn {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('createSonnetLlm: ANTHROPIC_API_KEY is required');
  }
  const anthropic = createAnthropic({
    baseURL: 'https://api.anthropic.com/v1',
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
  const tracker = options.costTracker;
  const cap = options.budgetCapCents ?? Number.POSITIVE_INFINITY;
  const modelId = options.model ?? 'claude-sonnet-4-6';

  return async (prompt, opts) => {
    if (tracker && tracker.totalCents >= cap) {
      throw new Error(
        `createSonnetLlm: budget cap reached (${tracker.totalCents}/${cap} cents)`,
      );
    }
    const { text, usage } = await generateText({
      model: anthropic(modelId),
      prompt,
      maxOutputTokens: opts?.maxTokens ?? 3000,
      temperature: opts?.temperature ?? 0.4,
    });
    if (tracker) {
      const inputTokens = usage?.inputTokens ?? Math.round(prompt.length / 3.5);
      const outputTokens = usage?.outputTokens ?? Math.round(text.length / 3.5);
      const usd = (inputTokens / 1_000_000) * SONNET_INPUT_USD_PER_M
                + (outputTokens / 1_000_000) * SONNET_OUTPUT_USD_PER_M;
      tracker.totalCents += usd * 100;
      tracker.calls += 1;
    }
    return text;
  };
}
