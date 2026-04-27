/**
 * crossReferenceEpisode — Primitive : 3-5 épisodes du catalogue cross-tenant
 * qui prolongent les thèmes d'un épisode source, avec rationale éditorial +
 * argument différenciation Sillon vs RAG mono-source.
 *
 * Discipline (cf. brief-primitives-2026-04-28.md, Phase 1.4) :
 * - Cap qualité 7.5+/10 (pivot — agent qui a déjà eu 7.5/10 sur Inoxtag).
 * - Pure : pas d'accès DB, pas d'env. Les deps (embedding, pgvector search,
 *   LLM) sont injectées via `config`.
 * - Boost cross-podcast : pénalité légère (×1.2) sur les candidats du même
 *   podcast pour favoriser la diversité éditoriale, sans exclure d'office
 *   (les bons matches same-pod restent retenus si l'écart de distance est
 *   suffisant).
 * - 1 seul appel Sonnet pour générer les rationale des N cross-refs (vs 1
 *   appel par cross-ref) — efficience tokens + latence.
 *
 * @see docs/brief-primitives-2026-04-28.md (Phase 1.4)
 */

import { z } from 'zod';
import type { TranscriptResult } from './transcribeAudio';
import type { LLMFn, PodcastContext } from './types';
import { parseLLMJsonResponse } from './types';

const DEFAULT_TARGET_COUNT = 5;
const DEFAULT_CANDIDATE_LIMIT = 20;
const SAME_PODCAST_DISTANCE_PENALTY = 1.2;
const DEFAULT_DISTANCE_THRESHOLD = 1.0;
const PROMPT_TRANSCRIPT_CHAR_LIMIT = 8_000;
const PROMPT_CANDIDATE_EXCERPT_LIMIT = 1_500;

export const CrossReferenceSchema = z.object({
  target_episode_id: z.string().min(1),
  target_podcast: z.string().min(1),
  target_title: z.string().min(1),
  target_guest: z.string().min(1),
  similarity_distance: z.number().nonnegative(),
  why_relevant: z.string().min(20).max(500),
  why_mono_podcast_rag_cant_find_this: z.string().min(20).max(500),
});

export type CrossReference = z.infer<typeof CrossReferenceSchema>;

/**
 * Résultat brut d'une query pgvector cross-tenant.
 * `embedding_distance` est la distance cosine retournée par pgvector
 * (`embedding <-> source_embedding`). Range [0..2], 0 = identique.
 */
export interface VectorSearchCandidate {
  episode_id: string;
  podcast_id: string;
  title: string;
  guest: string;
  embedding_distance: number;
  excerpt?: string;
}

export interface CrossReferenceOptions {
  sourceEpisodeId: string;
  sourcePodcastContext: PodcastContext;
  sourceGuest: string;
  sourceTitle: string;
  targetCount?: number;
  excludePodcasts?: string[];
  distanceThreshold?: number;
  candidateLimit?: number;
}

export interface CrossReferenceConfig {
  embedTextFn: (text: string) => Promise<number[]>;
  vectorSearchFn: (
    embedding: number[],
    opts: { excludeEpisodeIds: string[]; limit: number },
  ) => Promise<VectorSearchCandidate[]>;
  llmFn: LLMFn;
}

export interface CrossReferenceResult {
  references: CrossReference[];
  warnings: string[];
}

/**
 * Applique le boost cross-podcast : multiplie la distance par 1.2 si même
 * podcast que la source. Ne mute pas les candidats originaux.
 */
export function applyCrossPodcastBoost(
  candidates: VectorSearchCandidate[],
  sourcePodcastId: string,
): Array<VectorSearchCandidate & { adjusted_distance: number }> {
  return candidates.map((c) => ({
    ...c,
    adjusted_distance:
      c.podcast_id === sourcePodcastId
        ? c.embedding_distance * SAME_PODCAST_DISTANCE_PENALTY
        : c.embedding_distance,
  }));
}

export function buildRationalePrompt(
  source: {
    episodeId: string;
    podcastContext: PodcastContext;
    guest: string;
    title: string;
    transcriptExcerpt: string;
  },
  candidates: Array<VectorSearchCandidate & { adjusted_distance: number }>,
): string {
  const candidateBlock = candidates
    .map(
      (c, i) => `### Candidate ${i + 1}
target_episode_id: ${c.episode_id}
target_podcast: ${c.podcast_id}
target_title: ${c.title}
target_guest: ${c.guest}
similarity_distance: ${c.adjusted_distance.toFixed(4)}
${c.excerpt ? `excerpt:\n${c.excerpt.slice(0, PROMPT_CANDIDATE_EXCERPT_LIMIT)}` : 'excerpt: (non fourni)'}`,
    )
    .join('\n\n---\n\n');

  return `Tu es éditeur expert sur l'écosystème podcast français cross-corpus. Tu écris les rationale de cross-référencement entre un épisode source et N épisodes candidats du catalogue.

## ÉPISODE SOURCE
podcast: ${source.podcastContext.podcast_name} (${source.podcastContext.editorial_focus})
episode_id: ${source.episodeId}
guest: ${source.guest}
title: ${source.title}

extrait transcript :
${source.transcriptExcerpt}

## ÉPISODES CANDIDATS (${candidates.length})
${candidateBlock}

## CONSIGNES STRICTES
Pour CHAQUE candidat, produis 2 phrases :

1. \`why_relevant\` (1-2 phrases, 20-500 chars) : pourquoi cet épisode prolonge éditorialement la source. Sois SPÉCIFIQUE — réfère à l'angle du candidat ET de la source. Pas de généralité ("c'est dans le même thème").

2. \`why_mono_podcast_rag_cant_find_this\` (1-2 phrases, 20-500 chars) : pourquoi un RAG mono-source (NotebookLM, beta.lamartingale.io) ne pourrait PAS établir cette connexion automatiquement. Argument différenciation Sillon. Exemples :
   - "Ce candidat est dans le podcast X, donc invisible depuis un index ${source.podcastContext.podcast_name} mono-source."
   - "Connecter ces deux angles requiert l'index cross-tenant : NotebookLM ne dispose que d'un seul corpus."
   - "L'angle [X] de la source résonne avec [Y] du candidat, mais NotebookLM ne voit jamais Y depuis un upload ${source.podcastContext.podcast_name}."

## INTERDICTIONS
- Pas de chiffre inventé (€, %, écoutes, vues).
- Pas de paraphrase générique applicable à n'importe quel épisode.
- Pas de "c'est intéressant" sans contenu.

## OUTPUT
JSON strict, ordre préservé des candidats :
{
  "rationales": [
    {
      "target_episode_id": "${candidates[0]?.episode_id ?? '...'}",
      "why_relevant": "...",
      "why_mono_podcast_rag_cant_find_this": "..."
    }
  ]
}`;
}

interface RationaleEntry {
  target_episode_id: string;
  why_relevant: string;
  why_mono_podcast_rag_cant_find_this: string;
}

export async function crossReferenceEpisode(
  transcript: TranscriptResult,
  options: CrossReferenceOptions,
  config: CrossReferenceConfig,
): Promise<CrossReferenceResult> {
  if (!options.sourceEpisodeId?.trim()) {
    throw new Error('crossReferenceEpisode: sourceEpisodeId is required');
  }
  if (!transcript.full_text?.trim()) {
    throw new Error('crossReferenceEpisode: transcript.full_text is empty');
  }
  const targetCount = options.targetCount ?? DEFAULT_TARGET_COUNT;
  const candidateLimit = options.candidateLimit ?? DEFAULT_CANDIDATE_LIMIT;
  const distanceThreshold =
    options.distanceThreshold ?? DEFAULT_DISTANCE_THRESHOLD;
  const excludePodcasts = options.excludePodcasts ?? [];

  const warnings: string[] = [];

  const embedding = await config.embedTextFn(transcript.full_text);

  const rawCandidates = await config.vectorSearchFn(embedding, {
    excludeEpisodeIds: [options.sourceEpisodeId],
    limit: candidateLimit,
  });

  const filteredByPodcast = rawCandidates.filter(
    (c) => !excludePodcasts.includes(c.podcast_id),
  );
  if (filteredByPodcast.length < rawCandidates.length) {
    warnings.push(
      `Filtered out ${rawCandidates.length - filteredByPodcast.length} candidates from excludePodcasts=[${excludePodcasts.join(', ')}]`,
    );
  }

  const boosted = applyCrossPodcastBoost(
    filteredByPodcast,
    options.sourcePodcastContext.podcast_id,
  );

  const filteredByDistance = boosted.filter(
    (c) => c.adjusted_distance <= distanceThreshold,
  );
  if (filteredByDistance.length < boosted.length) {
    warnings.push(
      `${boosted.length - filteredByDistance.length} candidates exceeded distance threshold ${distanceThreshold}`,
    );
  }

  const sorted = [...filteredByDistance].sort(
    (a, b) => a.adjusted_distance - b.adjusted_distance,
  );
  const topN = sorted.slice(0, targetCount);

  if (topN.length === 0) {
    warnings.push('No candidate passed filters; returning empty references');
    return { references: [], warnings };
  }
  if (topN.length < targetCount) {
    warnings.push(
      `Only ${topN.length} candidates passed filters (asked ${targetCount})`,
    );
  }

  const transcriptExcerpt =
    transcript.full_text.length > PROMPT_TRANSCRIPT_CHAR_LIMIT
      ? transcript.full_text.slice(0, PROMPT_TRANSCRIPT_CHAR_LIMIT) +
        '\n[... tronqué]'
      : transcript.full_text;

  const prompt = buildRationalePrompt(
    {
      episodeId: options.sourceEpisodeId,
      podcastContext: options.sourcePodcastContext,
      guest: options.sourceGuest,
      title: options.sourceTitle,
      transcriptExcerpt,
    },
    topN,
  );
  const raw = await config.llmFn(prompt, { temperature: 0.4 });
  const parsed = parseLLMJsonResponse(raw, 'crossReferenceEpisode');

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('crossReferenceEpisode: LLM output is not an object');
  }
  const obj = parsed as { rationales?: unknown };
  if (!Array.isArray(obj.rationales)) {
    throw new Error('crossReferenceEpisode: rationales[] missing or not an array');
  }

  const rationaleByTarget = new Map<string, RationaleEntry>();
  for (const r of obj.rationales) {
    if (
      typeof r === 'object' &&
      r !== null &&
      typeof (r as RationaleEntry).target_episode_id === 'string'
    ) {
      const entry = r as RationaleEntry;
      rationaleByTarget.set(entry.target_episode_id, entry);
    }
  }

  const references: CrossReference[] = [];
  for (const candidate of topN) {
    const rationale = rationaleByTarget.get(candidate.episode_id);
    if (!rationale) {
      warnings.push(
        `No rationale returned by LLM for candidate ${candidate.episode_id}`,
      );
      continue;
    }
    const candidateRef = {
      target_episode_id: candidate.episode_id,
      target_podcast: candidate.podcast_id,
      target_title: candidate.title,
      target_guest: candidate.guest,
      similarity_distance: candidate.adjusted_distance,
      why_relevant: rationale.why_relevant,
      why_mono_podcast_rag_cant_find_this:
        rationale.why_mono_podcast_rag_cant_find_this,
    };
    try {
      const validated = CrossReferenceSchema.parse(candidateRef);
      references.push(validated);
    } catch (err) {
      warnings.push(
        `Cross-ref ${candidate.episode_id} failed zod: ${(err as Error).message.slice(0, 200)}`,
      );
    }
  }

  return { references, warnings };
}
