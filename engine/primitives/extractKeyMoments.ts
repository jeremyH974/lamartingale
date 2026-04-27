/**
 * extractKeyMoments — Primitive : 5 moments clippables par épisode.
 *
 * Discipline (cf. brief-primitives-2026-04-28.md, Phase 1.2) :
 * - Pure : pas d'accès DB, pas d'env, LLM injecté.
 * - Anti-hallucination : finding critique simulation Inoxtag (Sonnet
 *   hallucinait "100M vues" sur un épisode où ce chiffre n'apparaît pas).
 *   Le prompt l'interdit, et la fonction détecte les chiffres non présents
 *   dans le transcript et émet des warnings traçables.
 * - Validation runtime via zod sur l'output LLM.
 * - Truncation top-N par saliency_score si Sonnet retourne plus que demandé.
 *
 * @see docs/brief-primitives-2026-04-28.md (Phase 1.2)
 */

import { z } from 'zod';
import type { TranscriptResult } from './transcribeAudio';
import type { LLMFn, PodcastContext } from './types';
import { parseLLMJsonResponse } from './types';

const DEFAULT_MAX_MOMENTS = 5;
const PROMPT_TRANSCRIPT_CHAR_LIMIT = 50_000;

/**
 * Pattern détectant des « chiffres + unités » dans une string. Volontairement
 * conservateur : on rate certains formats (ex: "1.2 milliards de dollars" en
 * toutes lettres complexes) mais on évite les faux positifs sur les pures
 * dates/timestamps.
 */
const NUMERIC_CITATION_PATTERN =
  /\b\d{1,3}(?:[.,]\d+)?\s?(M€|k€|€|%|vues|abonnés?|millions?|milliards?|M\b|k\b)/gi;

export const KeyMomentSchema = z
  .object({
    start_seconds: z.number().nonnegative(),
    end_seconds: z.number().nonnegative(),
    title: z.string().min(1).max(200),
    hook: z.string().min(1).max(500),
    rationale: z.string().min(10).max(500),
    saliency_score: z.number().min(0).max(1),
  })
  .refine((m) => m.end_seconds >= m.start_seconds, {
    message: 'end_seconds must be >= start_seconds',
    path: ['end_seconds'],
  });

export type KeyMoment = z.infer<typeof KeyMomentSchema>;

export interface ExtractKeyMomentsOptions {
  guestName: string;
  podcastContext: PodcastContext;
  maxMoments?: number;
}

export interface ExtractKeyMomentsConfig {
  llmFn: LLMFn;
}

export interface ExtractKeyMomentsResult {
  moments: KeyMoment[];
  warnings: string[];
}

export function detectHallucinatedNumerics(
  candidateText: string,
  transcriptText: string,
): string[] {
  const matches = [...candidateText.matchAll(NUMERIC_CITATION_PATTERN)].map((m) =>
    m[0].trim(),
  );
  if (matches.length === 0) return [];
  const lowerTranscript = transcriptText.toLowerCase();
  // Normalisation espaces : Sonnet peut écrire "100 M€" alors que transcript
  // a "100M€" ou inverse. On normalise les deux.
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
  const normTranscript = norm(transcriptText);
  const hallucinated: string[] = [];
  for (const match of matches) {
    if (
      !lowerTranscript.includes(match.toLowerCase()) &&
      !normTranscript.includes(norm(match))
    ) {
      hallucinated.push(match);
    }
  }
  return [...new Set(hallucinated)]; // dédup
}

export function buildPrompt(
  transcript: TranscriptResult,
  options: ExtractKeyMomentsOptions,
): string {
  const { guestName, podcastContext, maxMoments = DEFAULT_MAX_MOMENTS } = options;

  // V2 fix F-P5-3 : pour des timestamps PRÉCIS (pas hallucinés), on
  // construit un transcript "indexé" qui montre à Sonnet les segments
  // Whisper réels avec leurs start_seconds/end_seconds. Sonnet doit
  // ensuite citer un segment_index, ou retourner directement un
  // start_seconds/end_seconds qui correspond à un boundary réel des
  // segments.
  const segments = transcript.segments;
  let segmentsBlock = '';
  let truncated = transcript.full_text;

  if (segments && segments.length > 0) {
    // Down-sample: pour les transcripts longs (~3000 segments Whisper),
    // injecter tout serait trop long. On groupe en chunks ~30s pour
    // avoir un index time-grossier mais utilisable.
    const groupSeconds = 30;
    const groups: Array<{ start: number; end: number; text: string }> = [];
    let bucketStart: number | null = null;
    let bucketTexts: string[] = [];
    let bucketEnd = 0;
    for (const s of segments) {
      if (bucketStart === null) bucketStart = s.start_seconds;
      bucketTexts.push(s.text);
      bucketEnd = s.end_seconds;
      if (bucketEnd - bucketStart >= groupSeconds) {
        groups.push({ start: bucketStart, end: bucketEnd, text: bucketTexts.join(' ').trim() });
        bucketStart = null;
        bucketTexts = [];
      }
    }
    if (bucketStart !== null && bucketTexts.length > 0) {
      groups.push({ start: bucketStart, end: bucketEnd, text: bucketTexts.join(' ').trim() });
    }
    // If too long, truncate by char limit
    let totalChars = 0;
    const usedGroups: typeof groups = [];
    for (const g of groups) {
      if (totalChars + g.text.length > PROMPT_TRANSCRIPT_CHAR_LIMIT) break;
      usedGroups.push(g);
      totalChars += g.text.length;
    }
    segmentsBlock = usedGroups
      .map((g) => `[${g.start.toFixed(0)}-${g.end.toFixed(0)}s] ${g.text}`)
      .join('\n');
    if (usedGroups.length < groups.length) {
      segmentsBlock += `\n[... transcript tronqué après ${usedGroups.length}/${groups.length} groupes 30s]`;
    }
  } else {
    // Fallback: legacy behavior on full_text
    truncated =
      transcript.full_text.length > PROMPT_TRANSCRIPT_CHAR_LIMIT
        ? transcript.full_text.slice(0, PROMPT_TRANSCRIPT_CHAR_LIMIT) +
          '\n[... transcript tronqué pour limites tokens]'
        : transcript.full_text;
  }

  return `Tu es éditeur expert en podcast français. Tu identifies les moments les plus clippables d'une interview pour réseaux sociaux et newsletters.

## CONTEXTE
Podcast : ${podcastContext.podcast_name} (${podcastContext.editorial_focus})
${podcastContext.host_name ? `Animateur : ${podcastContext.host_name}\n` : ''}Invité : ${guestName}

## CONSIGNES STRICTES
1. Sélectionne EXACTEMENT ${maxMoments} moments saillants. Pas plus, pas moins.
2. Chaque moment dure 30 à 180 secondes (start_seconds, end_seconds en temps absolu transcript).
3. **start_seconds et end_seconds DOIVENT correspondre à des boundaries de segments réels listés ci-dessous (ex: si tu vois [120-150s], tu peux choisir start_seconds=120 et end_seconds dans un segment voisin)**. NE JAMAIS inventer des timestamps ronds (00:00, 05:00, 10:00). Si tu n'es pas certain, choisis des timestamps qui apparaissent EXPLICITEMENT dans la liste des segments fournie.
4. Saillant = opinion forte, anecdote spécifique, prise de position contre-intuitive, donnée précise.
5. INTERDICTION ABSOLUE : ne JAMAIS citer un chiffre (€, %, vues, abonnés, M, k) qui n'apparaît PAS littéralement dans le transcript fourni. Si tu n'es pas certain qu'un chiffre est dans le transcript, n'en cite pas dans hook/title/rationale.
6. Le hook (1 phrase) doit accrocher pour réseaux sociaux. Pas de clickbait creux. Pas d'expressions type "Plongez dans...", "Fascinant...", "Incontournable...", "Révolutionnaire..." — le ton est direct, anti-cliché.
7. Le rationale explique pourquoi CE moment est saillant pour ce podcast en CITANT un élément précis du segment correspondant.
8. saliency_score ∈ [0..1].
9. title fait 8 à 12 mots.

## TRANSCRIPT (${segmentsBlock ? 'segments indexés' : 'full text'})
${segmentsBlock || truncated}

## OUTPUT
Réponds UNIQUEMENT en JSON strict (pas de markdown wrapping, pas de préambule) :
{
  "moments": [
    {
      "start_seconds": <nombre-aligné-sur-un-boundary-de-segment-fourni>,
      "end_seconds": <nombre-aligné-sur-un-boundary-de-segment-fourni>,
      "title": "<titre-8-à-12-mots>",
      "hook": "<phrase-accroche-anti-cliché>",
      "rationale": "<pourquoi-saillant-citant-élément-précis-du-segment>",
      "saliency_score": <0-1>
    }
  ]
}`;
}

export async function extractKeyMoments(
  transcript: TranscriptResult,
  options: ExtractKeyMomentsOptions,
  config: ExtractKeyMomentsConfig,
): Promise<ExtractKeyMomentsResult> {
  if (!options.guestName?.trim()) {
    throw new Error('extractKeyMoments: guestName is required');
  }
  if (!transcript.full_text?.trim()) {
    throw new Error('extractKeyMoments: transcript.full_text is empty');
  }
  const maxMoments = options.maxMoments ?? DEFAULT_MAX_MOMENTS;

  const prompt = buildPrompt(transcript, options);
  const raw = await config.llmFn(prompt, { temperature: 0.4 });
  const parsed = parseLLMJsonResponse(raw, 'extractKeyMoments');

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('extractKeyMoments: LLM output is not an object');
  }
  const obj = parsed as { moments?: unknown };
  if (!Array.isArray(obj.moments)) {
    throw new Error('extractKeyMoments: moments[] missing or not an array');
  }

  const validated: KeyMoment[] = obj.moments.map((m, i) => {
    try {
      return KeyMomentSchema.parse(m);
    } catch (err) {
      throw new Error(
        `extractKeyMoments: moment[${i}] failed zod validation: ${(err as Error).message}`,
      );
    }
  });

  const warnings: string[] = [];
  let moments = validated;

  if (moments.length > maxMoments) {
    moments = [...moments]
      .sort((a, b) => b.saliency_score - a.saliency_score)
      .slice(0, maxMoments);
    warnings.push(
      `LLM returned ${validated.length} moments, truncated to top ${maxMoments} by saliency_score`,
    );
  } else if (moments.length < maxMoments) {
    warnings.push(
      `LLM returned only ${moments.length} moments (expected ${maxMoments})`,
    );
  }

  for (let i = 0; i < moments.length; i++) {
    const m = moments[i];
    const hallu = detectHallucinatedNumerics(
      `${m.title} ${m.hook} ${m.rationale}`,
      transcript.full_text,
    );
    if (hallu.length > 0) {
      warnings.push(
        `moment[${i}] cites numerics absent from transcript: ${hallu.join(', ')}`,
      );
    }
  }

  return { moments, warnings };
}
