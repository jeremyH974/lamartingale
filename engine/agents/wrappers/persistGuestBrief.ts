/**
 * persistGuestBrief — Wrapper d'orchestration MEDIUM-3.
 *
 * Pipeline :
 * 1. Fetch guest depuis `cross_podcast_guests` par ID.
 * 2. Pour chaque (tenant, episode_number) listé dans `tenant_appearances`,
 *    fetch l'épisode avec ses sources de contenu.
 * 3. Cap à `maxEpisodes` plus récents (par `date_created` DESC).
 * 4. `selectBestSource()` pour chaque épisode (cf sourceSelector.ts).
 * 5. Build `GuestBriefInput` + invoque `guestBriefAgent.run()`.
 * 6. Si `dryRun=false` : UPDATE colonnes `brief_*` sur le guest.
 * 7. Loggue durée + coût estimé via `usage` Anthropic remonté par
 *    `generateText`.
 *
 * Le wrapper centralise tous les hits DB et l'invocation LLM réelle. L'agent
 * reste pur (pas d'I/O).
 *
 * Tests : injection de dépendances via 2e param `overrides` (caché de la
 * signature publique mais accessible). Voir `engine/__tests__/persist-guest-brief.test.ts`.
 */

import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { generateText } from 'ai';
import {
  guestBriefAgent,
  type GuestBriefInput,
  type GuestBriefOutput,
  type LLMFn,
} from '../guestBriefAgent';
import { selectBestSource, type SourceEpisode } from './sourceSelector';
import { getLLM, getLLMFast } from '../../ai/llm';

export interface PersistGuestBriefOptions {
  guestId: number;
  llmModel?: 'sonnet' | 'haiku';
  maxEpisodes?: number;
  dryRun?: boolean;
}

export interface PersistGuestBriefResult {
  guestId: number;
  guestName: string;
  brief: GuestBriefOutput;
  episodesUsed: number;
  totalEpisodesAvailable: number;
  costEstimateCents: number;
  durationMs: number;
  persisted: boolean;
}

interface GuestRow {
  id: number;
  canonical_name: string;
  display_name: string;
  linkedin_url: string | null;
  tenant_appearances: Array<{ tenant_id: string; episode_numbers: number[] }>;
}

interface EpisodeRow extends SourceEpisode {
  id: number;
  tenant_id: string;
  episode_number: number;
  title: string;
  date_created: string;
}

export interface PersistGuestBriefDeps {
  fetchGuest?: (guestId: number) => Promise<GuestRow | null>;
  fetchEpisodes?: (
    pairs: Array<{ tenant_id: string; episode_number: number }>,
  ) => Promise<EpisodeRow[]>;
  updateBrief?: (
    guestId: number,
    brief: GuestBriefOutput,
    model: string,
  ) => Promise<void>;
  runAgent?: typeof guestBriefAgent.run;
  // Si fourni, court-circuite generateText : utile pour tests sans hit LLM.
  llmFn?: LLMFn;
  // Si fourni, le wrapper utilise cette fonction pour estimer le coût au lieu
  // de l'usage Anthropic réel.
  costEstimator?: (inputTokens: number, outputTokens: number, model: 'sonnet' | 'haiku') => number;
}

const DEFAULT_MAX_EPISODES = 10;

// Tarifs Anthropic en cents par token (avril 2026).
//   Sonnet 4.6 : $3/M input, $15/M output
//   Haiku 4.5  : $1/M input, $5/M output
function defaultCostEstimateCents(
  inputTokens: number,
  outputTokens: number,
  model: 'sonnet' | 'haiku',
): number {
  if (model === 'sonnet') {
    return inputTokens * 0.0003 + outputTokens * 0.0015;
  }
  return inputTokens * 0.0001 + outputTokens * 0.0005;
}

// Default fetchers — production path. Utilisent neon raw SQL (cohérence god
// nodes : `engine/db/queries.ts`).

function makeDefaultDeps(): Required<
  Pick<PersistGuestBriefDeps, 'fetchGuest' | 'fetchEpisodes' | 'updateBrief'>
> {
  const sql = neon(process.env.DATABASE_URL!) as NeonQueryFunction<false, false>;
  return {
    fetchGuest: async (guestId: number) => {
      const rows = (await sql`
        SELECT id, canonical_name, display_name, linkedin_url, tenant_appearances
        FROM cross_podcast_guests
        WHERE id = ${guestId}
      `) as unknown as GuestRow[];
      return rows[0] ?? null;
    },
    fetchEpisodes: async (pairs) => {
      if (pairs.length === 0) return [];
      // On construit un OR multi-colonnes en raw SQL via array_agg de tuples.
      // L'approche naive : une query par tenant. Plus simple, suffisant ici
      // (≤ 7 tenants × N eps).
      const byTenant = new Map<string, number[]>();
      for (const p of pairs) {
        const arr = byTenant.get(p.tenant_id) ?? [];
        arr.push(p.episode_number);
        byTenant.set(p.tenant_id, arr);
      }
      const all: EpisodeRow[] = [];
      for (const [tenant, epNums] of byTenant) {
        const rows = (await sql`
          SELECT
            id,
            tenant_id,
            episode_number,
            title,
            date_created,
            article_content,
            chapters,
            key_takeaways,
            rss_description
          FROM episodes
          WHERE tenant_id = ${tenant}
            AND episode_number = ANY(${epNums}::int[])
        `) as unknown as EpisodeRow[];
        all.push(...rows);
      }
      return all;
    },
    updateBrief: async (guestId, brief, model) => {
      await sql`
        UPDATE cross_podcast_guests
        SET
          brief_md = ${brief.briefMd},
          key_positions = ${JSON.stringify(brief.keyPositions)}::jsonb,
          quotes = ${JSON.stringify(brief.quotes)}::jsonb,
          original_questions = ${JSON.stringify(brief.originalQuestions)}::jsonb,
          brief_generated_at = NOW(),
          brief_model = ${model}
        WHERE id = ${guestId}
      `;
    },
  };
}

// Default LLM factory — production path. Capture l'usage pour cost estimate.
function makeDefaultLLM(model: 'sonnet' | 'haiku'): {
  llmFn: LLMFn;
  getUsage: () => { inputTokens: number; outputTokens: number };
} {
  let lastUsage = { inputTokens: 0, outputTokens: 0 };
  const llmFn: LLMFn = async (prompt, opts) => {
    const aiModel = model === 'haiku' ? getLLMFast() : getLLM();
    const result = await generateText({
      model: aiModel,
      prompt,
      maxOutputTokens: opts?.maxTokens ?? 4096,
      temperature: opts?.temperature ?? 0.4,
    });
    const usage = (result as { usage?: { inputTokens?: number; outputTokens?: number } }).usage;
    lastUsage = {
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
    };
    return result.text;
  };
  return { llmFn, getUsage: () => lastUsage };
}

export async function persistGuestBrief(
  options: PersistGuestBriefOptions,
  overrides: PersistGuestBriefDeps = {},
): Promise<PersistGuestBriefResult> {
  const t0 = Date.now();
  const llmModel = options.llmModel ?? 'sonnet';
  const maxEpisodes = options.maxEpisodes ?? DEFAULT_MAX_EPISODES;
  const dryRun = options.dryRun ?? false;

  const defaults = overrides.fetchGuest && overrides.fetchEpisodes && overrides.updateBrief
    ? null
    : makeDefaultDeps();

  const fetchGuest = overrides.fetchGuest ?? defaults!.fetchGuest;
  const fetchEpisodes = overrides.fetchEpisodes ?? defaults!.fetchEpisodes;
  const updateBrief = overrides.updateBrief ?? defaults!.updateBrief;
  const runAgent = overrides.runAgent ?? guestBriefAgent.run;
  const costEstimator = overrides.costEstimator ?? defaultCostEstimateCents;

  // 1. Fetch guest
  const guest = await fetchGuest(options.guestId);
  if (!guest) {
    throw new Error(`persistGuestBrief: guest id=${options.guestId} not found`);
  }

  // 2. Build (tenant, episode_number) pairs from tenant_appearances
  const pairs: Array<{ tenant_id: string; episode_number: number }> = [];
  for (const app of guest.tenant_appearances ?? []) {
    for (const epNum of app.episode_numbers ?? []) {
      pairs.push({ tenant_id: app.tenant_id, episode_number: epNum });
    }
  }
  if (pairs.length === 0) {
    throw new Error(
      `persistGuestBrief: guest id=${options.guestId} has no tenant_appearances`,
    );
  }
  const totalEpisodesAvailable = pairs.length;

  // 3. Fetch episodes from DB
  const episodes = await fetchEpisodes(pairs);

  // 4. Sort by date_created DESC and cap to maxEpisodes
  episodes.sort(
    (a, b) => new Date(b.date_created).getTime() - new Date(a.date_created).getTime(),
  );
  const capped = episodes.slice(0, maxEpisodes);

  // 5. Apply sourceSelector and build agent input
  const agentEpisodes: GuestBriefInput['episodes'] = [];
  for (const ep of capped) {
    const sel = selectBestSource(ep);
    if (!sel.content || sel.content.length < 50) {
      // Garde-fou : on saute les épisodes vraiment vides plutôt que d'envoyer
      // du bruit au LLM.
      continue;
    }
    // sourceSelector peut renvoyer 'transcript' (futur) — l'agent n'accepte
    // que les 3 types matérialisés. On filtre.
    const sourceType =
      sel.type === 'transcript' ? 'article_content' : sel.type;
    agentEpisodes.push({
      episode_id: ep.id,
      podcast_id: ep.tenant_id,
      title: ep.title,
      date_created: ep.date_created,
      source_content: sel.content,
      source_type: sourceType as 'article_content' | 'chapters_takeaways' | 'rss_description',
      source_quality: sel.qualityScore,
    });
  }
  if (agentEpisodes.length === 0) {
    throw new Error(
      `persistGuestBrief: guest id=${options.guestId} has no usable source content across ${capped.length} episodes`,
    );
  }

  // 6. Setup LLM (real or mocked)
  let usageReporter: () => { inputTokens: number; outputTokens: number } = () => ({
    inputTokens: 0,
    outputTokens: 0,
  });
  let llmFn: LLMFn;
  if (overrides.llmFn) {
    llmFn = overrides.llmFn;
  } else {
    const def = makeDefaultLLM(llmModel);
    llmFn = def.llmFn;
    usageReporter = def.getUsage;
  }

  // 7. Run agent
  const agentInput: GuestBriefInput = {
    guestName: guest.display_name || guest.canonical_name,
    guestLinkedin: guest.linkedin_url ?? undefined,
    episodes: agentEpisodes,
  };
  const brief = await runAgent(agentInput, { llmFn, llmModel });

  // 8. Persist (or not)
  let persisted = false;
  if (!dryRun) {
    await updateBrief(options.guestId, brief, modelLabel(llmModel));
    persisted = true;
  }

  // 9. Cost estimate from usage
  const usage = usageReporter();
  const costEstimateCents = costEstimator(usage.inputTokens, usage.outputTokens, llmModel);

  return {
    guestId: options.guestId,
    guestName: agentInput.guestName,
    brief,
    episodesUsed: agentEpisodes.length,
    totalEpisodesAvailable,
    costEstimateCents: Number(costEstimateCents.toFixed(3)),
    durationMs: Date.now() - t0,
    persisted,
  };
}

function modelLabel(model: 'sonnet' | 'haiku'): string {
  return model === 'sonnet' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';
}
