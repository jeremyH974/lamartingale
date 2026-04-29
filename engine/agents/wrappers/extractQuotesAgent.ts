/**
 * Wrapper AgentFn pour la primitive extractQuotes (Phase Alpha S2 T2.2
 * complément 29/04 PM).
 */

import type { AgentFn } from '../../pipelines/runPack';
import type { LLMFn, PodcastContext } from '../../primitives/types';
import type { TranscriptResult } from '../../primitives/transcribeAudio';
import { extractQuotes } from '../../primitives/extractQuotes';

export interface ExtractQuotesAgentDeps {
  llmFn: LLMFn;
  /** Optional cost tracker for per-step cost reporting in PackOutput. */
  costTracker?: { totalCents: number };
}

/**
 * configOverrides attendus :
 * - `transcript` : TranscriptResult
 * - `guestName` : string
 * - `hostName` (optional) : string
 * - `podcastContext` : PodcastContext
 * - `maxQuotes` (optional) : number
 * - `hostBlacklistPhrases` (optional) : string[]
 */
export function createExtractQuotesAgent(deps: ExtractQuotesAgentDeps): AgentFn {
  return async (ctx) => {
    const ov = (ctx.configOverrides ?? {}) as {
      transcript?: TranscriptResult;
      guestName?: string;
      hostName?: string;
      podcastContext?: PodcastContext;
      maxQuotes?: number;
      hostBlacklistPhrases?: string[];
    };
    if (!ov.transcript || !ov.guestName || !ov.podcastContext) {
      throw new Error(
        'extractQuotesAgent: configOverrides.transcript, .guestName, .podcastContext required',
      );
    }
    const before = deps.costTracker?.totalCents ?? 0;
    const result = await extractQuotes(
      ov.transcript,
      {
        guestName: ov.guestName,
        hostName: ov.hostName,
        podcastContext: ov.podcastContext,
        maxQuotes: ov.maxQuotes,
        hostBlacklistPhrases: ov.hostBlacklistPhrases,
      },
      { llmFn: deps.llmFn },
    );
    const delta = deps.costTracker ? deps.costTracker.totalCents - before : 0;
    return { output: result, cost_estimate_cents: delta };
  };
}
