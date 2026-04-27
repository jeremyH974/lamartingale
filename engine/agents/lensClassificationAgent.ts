/**
 * lensClassificationAgent — Pivot agent du pilote Stefani-Orso.
 *
 * Pour un épisode source, classifie les segments transcript selon les lens
 * éditoriaux du client actif et persiste les événements lens_classification
 * dans editorial_events.
 *
 * Discipline (cf. brief-primitives-2026-04-28.md, Phase 3) :
 * - Pure : pas d'accès DB direct, llmFn + persistFn injectées.
 * - Validation runtime via zod sur les outputs Sonnet.
 * - Prompt strict anti-hallucination (interdit chiffres non présents dans
 *   segment ; rationale obligatoire 20-500 chars ; matched_concepts ⊂
 *   segment).
 * - Filtrage `lens_score >= 0.3` (seuil V1, calibré Phase 4).
 *
 * V1 : 1 appel Sonnet par segment de transcript, qui score TOUTES les
 * lens du client en une fois. Plus efficient que 1 appel par
 * (segment, lens). En Phase 4, on calibrera le coût et la cohérence.
 *
 * @see docs/brief-primitives-2026-04-28.md (Phase 3)
 * @see clients/stefani-orso.config.ts (5 lens pilote)
 */

import { z } from 'zod';
import type { TranscriptResult, TranscribedSegment } from '@engine/primitives/transcribeAudio';
import type { LLMFn } from '@engine/primitives/types';
import { parseLLMJsonResponse } from '@engine/primitives/types';
import type {
  EditorialEvent,
  EditorialEventInput,
  PersistEditorialEventsResult,
} from '@engine/primitives/persistEditorialEvents';
import type { ClientConfig } from '@engine/types/client-config';
import type { Lens } from '@engine/types/lens';
import { LensClassificationMetadataSchema } from '@engine/db/types/editorial-event-metadata';

const DEFAULT_LENS_SCORE_THRESHOLD = 0.3;
const DEFAULT_SEGMENT_TARGET_SECONDS = 240; // 4 min

export interface AnalyticSegment {
  start_seconds: number;
  end_seconds: number;
  text: string;
}

export interface LensMatch {
  lens_id: string;
  lens_score: number;
  rationale: string;
  matched_concepts?: string[];
}

const SonnetMatchSchema = z.object({
  lens_id: z.string().min(1),
  lens_score: z.number().min(0).max(1),
  rationale: z.string().min(20).max(500),
  matched_concepts: z.array(z.string()).optional(),
});

const SonnetSegmentResponseSchema = z.object({
  matches: z.array(SonnetMatchSchema),
});

export interface LensClassificationOptions {
  sourceId: string;
  segmentTargetSeconds?: number;
  lensScoreThreshold?: number;
  applicableContentType?: string; // default 'podcast_episode'
}

export interface LensClassificationConfig {
  llmFn: LLMFn;
  persistFn: (events: EditorialEventInput[], sourceId: string) => Promise<PersistEditorialEventsResult>;
  /** Coût estimé d'un appel Sonnet. Tracked pour reporting. Default: 0. */
  perCallCostUsd?: number;
}

export interface LensClassificationResult {
  events_created: EditorialEvent[];
  lens_distribution: { [lens_id: string]: number };
  warnings: string[];
  cost_usd: number;
  segments_analyzed: number;
  llm_calls: number;
}

/**
 * Découpe un transcript en segments analytiques de ~targetSeconds.
 * Accumule les segments transcrits jusqu'à atteindre la cible, puis
 * coupe. Le dernier segment peut être plus court.
 */
export function chunkTranscriptIntoAnalyticSegments(
  transcript: TranscriptResult,
  targetSeconds: number = DEFAULT_SEGMENT_TARGET_SECONDS,
): AnalyticSegment[] {
  if (targetSeconds <= 0) throw new Error('targetSeconds must be > 0');
  if (!transcript.segments || transcript.segments.length === 0) {
    return [];
  }
  const out: AnalyticSegment[] = [];
  let bucketStart: number | null = null;
  let bucketTexts: string[] = [];
  let bucketEnd = 0;
  for (const seg of transcript.segments) {
    if (bucketStart === null) {
      bucketStart = seg.start_seconds;
    }
    bucketTexts.push(seg.text);
    bucketEnd = seg.end_seconds;
    if (bucketEnd - bucketStart >= targetSeconds) {
      out.push({
        start_seconds: bucketStart,
        end_seconds: bucketEnd,
        text: bucketTexts.join(' ').trim(),
      });
      bucketStart = null;
      bucketTexts = [];
    }
  }
  if (bucketStart !== null && bucketTexts.length > 0) {
    out.push({
      start_seconds: bucketStart,
      end_seconds: bucketEnd,
      text: bucketTexts.join(' ').trim(),
    });
  }
  return out;
}

export function buildLensPromptBlock(lenses: Lens[]): string {
  return lenses
    .map((l, i) => {
      const concepts = (l.parameters as { concepts?: unknown }).concepts;
      const conceptList = Array.isArray(concepts) && concepts.every((c) => typeof c === 'string')
        ? (concepts as string[]).join(', ')
        : '(no concepts in parameters)';
      return `### Lens ${i + 1} — id="${l.id}"
Description : ${l.description ?? '(no description)'}
Concepts thématiques : ${conceptList}`;
    })
    .join('\n\n');
}

export function buildSegmentPrompt(
  segment: AnalyticSegment,
  lenses: Lens[],
): string {
  return `Tu es éditeur expert en analyse thématique de podcast français. Tu classifies un segment d'épisode selon des lens éditoriales prédéfinies.

## LENS À ÉVALUER (${lenses.length})
${buildLensPromptBlock(lenses)}

## SEGMENT À CLASSIFIER (start=${segment.start_seconds}s, end=${segment.end_seconds}s)
${segment.text}

## CONSIGNES STRICTES
1. Pour chaque lens, évalue si le contenu du segment correspond aux concepts thématiques de la lens.
2. Si une lens NE matche PAS du tout, NE LA RETOURNE PAS dans matches[]. Pas de score 0 forcé.
3. Si une lens matche faiblement, retourne un lens_score entre 0.0 et 0.3 (le caller filtrera).
4. Si une lens matche bien, retourne un lens_score entre 0.3 et 1.0.
5. rationale (20-500 chars) DOIT citer un élément PRÉCIS et SPÉCIFIQUE du segment de transcript fourni ci-dessus.
   - Tu ne dois JAMAIS produire un rationale générique sans ancrage dans le texte réel du segment.
   - Tu ne dois JAMAIS recopier ou paraphraser un rationale d'un autre segment ou d'un exemple générique.
   - Le rationale doit pouvoir être vérifié contre le segment ligne par ligne.
   - Pas de citation chiffrée (€, %, M, k) qui n'est pas littéralement dans le segment.
   - Pas de connaissance générale au-delà du segment.
6. matched_concepts (optionnel) liste 1-3 expressions LITTÉRALES extraites du segment ci-dessus qui ont déclenché le match. Pas de paraphrase, pas de concept générique copié de la liste de la lens.
7. lens_id DOIT être strictement l'un des id ci-dessus.
8. SILENCE PRÉFÉRÉ : si aucune lens n'est applicable au segment, retourne {"matches": []}. Le silence est une réponse VALIDE et préférée à un faux positif. Ne force PAS un match si le segment est éditorial-base, transition, intro/outro, ou hors-sujet.

## OUTPUT
JSON strict (pas de markdown wrapping, pas de préambule). Schema (placeholders à remplacer par tes valeurs réelles, pas à recopier) :
{
  "matches": [
    {
      "lens_id": "<id-d-une-lens-listée-plus-haut>",
      "lens_score": <nombre-entre-0-et-1>,
      "rationale": "<phrase-citant-un-élément-précis-du-segment-fourni-ci-dessus-pas-générique>",
      "matched_concepts": ["<expression-littérale-extraite-du-segment>", "..."]
    }
  ]
}

Si aucune lens ne matche : {"matches": []}`;
}

export async function lensClassificationAgent(
  transcript: TranscriptResult,
  client: ClientConfig,
  options: LensClassificationOptions,
  config: LensClassificationConfig,
): Promise<LensClassificationResult> {
  if (!options.sourceId?.trim()) {
    throw new Error('lensClassificationAgent: sourceId is required');
  }
  if (!transcript.full_text?.trim()) {
    throw new Error('lensClassificationAgent: transcript.full_text is empty');
  }
  const applicable = options.applicableContentType ?? 'podcast_episode';
  const lenses = client.lenses.filter((l) =>
    l.applicable_content_types.includes(applicable),
  );
  if (lenses.length === 0) {
    throw new Error(
      `lensClassificationAgent: no lenses applicable to '${applicable}' in client '${client.client_id}'`,
    );
  }

  const threshold = options.lensScoreThreshold ?? DEFAULT_LENS_SCORE_THRESHOLD;
  const segmentTarget = options.segmentTargetSeconds ?? DEFAULT_SEGMENT_TARGET_SECONDS;
  const allowedLensIds = new Set(lenses.map((l) => l.id));
  const perCallCost = config.perCallCostUsd ?? 0;

  const warnings: string[] = [];
  const segments = chunkTranscriptIntoAnalyticSegments(transcript, segmentTarget);
  if (segments.length === 0) {
    warnings.push('No analytic segments produced from transcript (empty segments[])');
    return {
      events_created: [],
      lens_distribution: {},
      warnings,
      cost_usd: 0,
      segments_analyzed: 0,
      llm_calls: 0,
    };
  }

  const accumulatedEvents: EditorialEventInput[] = [];
  const distribution: { [lens_id: string]: number } = {};
  let llmCalls = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const prompt = buildSegmentPrompt(seg, lenses);
    let raw: unknown;
    try {
      raw = await config.llmFn(prompt, { temperature: 0.3 });
      llmCalls++;
    } catch (err) {
      warnings.push(`segment[${i}] LLM call failed: ${(err as Error).message.slice(0, 200)}`);
      continue;
    }

    let parsed: unknown;
    try {
      parsed = parseLLMJsonResponse(raw, 'lensClassificationAgent');
    } catch (err) {
      warnings.push(`segment[${i}] JSON parse failed: ${(err as Error).message.slice(0, 200)}`);
      continue;
    }

    let validated;
    try {
      validated = SonnetSegmentResponseSchema.parse(parsed);
    } catch (err) {
      warnings.push(`segment[${i}] schema validation failed: ${(err as Error).message.slice(0, 200)}`);
      continue;
    }

    for (let j = 0; j < validated.matches.length; j++) {
      const match = validated.matches[j];
      if (!allowedLensIds.has(match.lens_id)) {
        warnings.push(`segment[${i}].match[${j}] uses unknown lens_id '${match.lens_id}' — skipped`);
        continue;
      }
      if (match.lens_score < threshold) {
        continue; // below threshold, not persisted (intentional, no warning)
      }

      const metadata = {
        lens_id: match.lens_id,
        lens_score: match.lens_score,
        transcript_segment: {
          start_seconds: seg.start_seconds,
          end_seconds: seg.end_seconds,
        },
        rationale: match.rationale,
        ...(match.matched_concepts ? { matched_concepts: match.matched_concepts } : {}),
      };
      // Sanity-check via the canonical schema (defensive — the SonnetMatchSchema
      // is loose on matched_concepts shape; the canonical one is authoritative).
      try {
        LensClassificationMetadataSchema.parse(metadata);
      } catch (err) {
        warnings.push(`segment[${i}].match[${j}] failed canonical metadata schema: ${(err as Error).message.slice(0, 200)}`);
        continue;
      }

      accumulatedEvents.push({
        type: 'lens_classification',
        position: { start_seconds: seg.start_seconds, end_seconds: seg.end_seconds },
        content_text: seg.text.slice(0, 2000),
        metadata,
        lens_tags: [match.lens_id],
      });
      distribution[match.lens_id] = (distribution[match.lens_id] ?? 0) + 1;
    }
  }

  let eventsCreated: EditorialEvent[] = [];
  if (accumulatedEvents.length > 0) {
    const persistResult = await config.persistFn(accumulatedEvents, options.sourceId);
    eventsCreated = persistResult.events;
    if (persistResult.warnings.length > 0) {
      warnings.push(
        ...persistResult.warnings.map((w) => `persist: ${w}`),
      );
    }
  } else {
    warnings.push('No matches passed threshold; no events persisted');
  }

  // Surface lens never matched
  for (const l of lenses) {
    if ((distribution[l.id] ?? 0) === 0) {
      warnings.push(`Lens '${l.id}' never matched on this episode (0 segments above threshold)`);
    }
  }

  return {
    events_created: eventsCreated,
    lens_distribution: distribution,
    warnings,
    cost_usd: Number((llmCalls * perCallCost).toFixed(4)),
    segments_analyzed: segments.length,
    llm_calls: llmCalls,
  };
}
