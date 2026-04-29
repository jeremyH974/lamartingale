/**
 * Wrapper AgentFn pour la primitive extractKeyMoments (Phase Alpha S2 T2.2
 * complément 29/04 PM).
 *
 * Branche la primitive `engine/primitives/extractKeyMoments.ts` au système
 * de registry de runPack. Le transcript est passé via `configOverrides.transcript`
 * (le sourceId à lui seul ne contient pas l'audio — l'industrialisation
 * complète d'un loader transcript par sourceId est différée à Phase Beta 1).
 */

import type { AgentFn } from '../../pipelines/runPack';
import type { LLMFn, PodcastContext } from '../../primitives/types';
import type { TranscriptResult } from '../../primitives/transcribeAudio';
import { extractKeyMoments } from '../../primitives/extractKeyMoments';

export interface ExtractKeyMomentsAgentDeps {
  llmFn: LLMFn;
  /** Optional cost tracker for per-step cost reporting in PackOutput. */
  costTracker?: { totalCents: number };
}

/**
 * configOverrides attendus :
 * - `transcript` : TranscriptResult (full_text + segments + duration_seconds)
 * - `guestName` : string
 * - `podcastContext` : PodcastContext
 * - `maxMoments` (optional) : number (default 5)
 */
export function createExtractKeyMomentsAgent(deps: ExtractKeyMomentsAgentDeps): AgentFn {
  return async (ctx) => {
    const ov = (ctx.configOverrides ?? {}) as {
      transcript?: TranscriptResult;
      guestName?: string;
      podcastContext?: PodcastContext;
      maxMoments?: number;
    };
    if (!ov.transcript || !ov.guestName || !ov.podcastContext) {
      throw new Error(
        'extractKeyMomentsAgent: configOverrides.transcript, .guestName, .podcastContext required',
      );
    }
    const before = deps.costTracker?.totalCents ?? 0;
    const result = await extractKeyMoments(
      ov.transcript,
      {
        guestName: ov.guestName,
        podcastContext: ov.podcastContext,
        maxMoments: ov.maxMoments,
      },
      { llmFn: deps.llmFn },
    );
    const delta = deps.costTracker ? deps.costTracker.totalCents - before : 0;
    return { output: result, cost_estimate_cents: delta };
  };
}
