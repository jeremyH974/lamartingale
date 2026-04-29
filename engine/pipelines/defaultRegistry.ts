/**
 * defaultRegistry — Phase Alpha S2 T2.2 complément 29/04 PM.
 *
 * Factory qui assemble les wrappers AgentFn « réels » autour des primitives
 * Sillon. Coexiste avec les mock registries des tests : runPack ne dépend
 * que du contrat `AgentRegistry`, le caller choisit son implémentation.
 *
 * Usage prod :
 *   const tracker = { totalCents: 0, calls: 0 };
 *   const llmFn = createSonnetLlm({ costTracker: tracker, budgetCapCents: 100 });
 *   const registry = createDefaultRegistry({ llmFn });
 *   const out = await runPack(packDef, sourceId, clientConfig, registry, { budgetCapCents: 100 });
 *
 * Stubs L3/L4/L5 : ce registry expose des stubs deferred pour ces 3 steps,
 * pour permettre un smoke run RÉEL bout-en-bout du pack-stefani-l1-l5 sans
 * coûts LLM L3-L5. Industrialisation différée (cf. stubAgents.ts).
 */

import type { AgentRegistry, AgentFn } from './runPack';
import { createMapAgentRegistry } from './runPack';
import type { LLMFn } from '../primitives/types';
import { createExtractKeyMomentsAgent } from '../agents/wrappers/extractKeyMomentsAgent';
import { createExtractQuotesAgent } from '../agents/wrappers/extractQuotesAgent';
import {
  crossReferenceStubAgent,
  newsletterStubAgent,
  briefAnnexeStubAgent,
} from '../agents/wrappers/stubAgents';

export interface DefaultRegistryOptions {
  /** LLMFn Sonnet partagée par les wrappers réels (L1, L2). */
  llmFn: LLMFn;
  /** Cost tracker partagé. Optional. Permet d'attribuer le coût par step
   *  dans `StepResult.cost_estimate_cents` via lecture du delta. */
  costTracker?: { totalCents: number };
}

/**
 * Construit le registry par défaut Sillon. Les agent_id correspondent aux
 * step.agent_id utilisés par les PackDefinition canoniques (`engine/pipelines/packs/`).
 */
export function createDefaultRegistry(options: DefaultRegistryOptions): AgentRegistry {
  const { llmFn, costTracker } = options;
  const map = new Map<string, AgentFn>([
    // L1 — KeyMoments (réel, primitive extractKeyMoments)
    ['extract-key-moments', createExtractKeyMomentsAgent({ llmFn, costTracker })],
    // L2 — Quotes (réel, primitive extractQuotes)
    ['extract-quotes', createExtractQuotesAgent({ llmFn, costTracker })],
    // L3-L5 — stubs deferred (cf. stubAgents.ts + docs/patterns-emergents.md P1)
    ['cross-reference-episode', crossReferenceStubAgent],
    ['build-newsletter', newsletterStubAgent],
    ['build-brief-annexe', briefAnnexeStubAgent],
  ]);
  return createMapAgentRegistry(map);
}
