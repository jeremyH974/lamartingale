/**
 * Stubs L3/L4/L5 — Phase Alpha S2 T2.2 complément 29/04 PM.
 *
 * Les vrais wrappers L3 cross-references / L4 newsletter / L5 brief-annexe
 * réutiliseraient la logique de
 * experiments/autonomy-session-2026-04-28/phase6-runner.ts (buildL3CrossRefs,
 * buildL4Newsletter, buildL5BriefAnnexe), elle-même bâtie sur des
 * dépendances lourdes :
 *   - L3 : embeddings + vectorSearch pgvector + lensClassif events pré-calculés
 *   - L4 : style_corpus newsletters + qualityValidator + opusRewrite fallback
 *   - L5 : L3 + L4 outputs + style_corpus + qualityValidator
 *
 * Industrialiser ces wrappers proprement nécessite ~6-8 h CC + ~$2-3 LLM
 * (par ép.) — hors scope T2.2 (1-2 h, cap $1). Ces stubs permettent un
 * smoke run runPack RÉEL bout-en-bout sur les 5 steps déclaratifs sans
 * coûts LLM L3-L5, tout en préservant le contrat AgentFn.
 *
 * Note dans `docs/patterns-emergents.md` (P1) marquant la dette explicite.
 * Industrialisation prévue : Phase Beta 1 ou opportuniste S3.
 */

import type { AgentFn } from '../../pipelines/runPack';

interface StubOutput {
  status: 'deferred';
  agent_step: string;
  message: string;
  followup: string;
}

function makeStub(stepName: string): AgentFn {
  return async (_ctx) => {
    const output: StubOutput = {
      status: 'deferred',
      agent_step: stepName,
      message: `${stepName} stub — vrai wrapper non industrialisé en T2.2 (cap $1 LLM, 1-2 h CC)`,
      followup:
        `Industrialisation : réutiliser la logique de experiments/autonomy-session-2026-04-28/phase6-runner.ts (build${stepName}). Coût ~$0.50-1/ép. Effort ~6-8 h CC. Plan documenté docs/patterns-emergents.md (P1).`,
    };
    return { output, cost_estimate_cents: 0 };
  };
}

/**
 * L3 cross-references stub. Industrialisation = importer
 * `crossReferenceEpisode` primitive + brancher embedTextFn + vectorSearchFn
 * sur `engine/ai/search.ts` ou wrapper Neon pgvector existant.
 */
export const crossReferenceStubAgent: AgentFn = makeStub('L3-CrossReferences');

/**
 * L4 newsletter stub. Industrialisation = porter `buildL4Newsletter` depuis
 * phase6-runner avec qualityValidator + opusRewrite fallback + style_corpus
 * newsletters.
 */
export const newsletterStubAgent: AgentFn = makeStub('L4-Newsletter');

/**
 * L5 brief-annexe stub. Industrialisation = porter `buildL5BriefAnnexe`
 * depuis phase6-runner (consomme L3+L4 outputs).
 */
export const briefAnnexeStubAgent: AgentFn = makeStub('L5-BriefAnnexe');
