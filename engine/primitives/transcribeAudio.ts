/**
 * transcribeAudio — Primitive Whisper.
 *
 * Transcrit un fichier audio (URL distante) en texte structuré avec timestamps.
 *
 * Discipline (cf. brief-primitives-2026-04-28.md, Phase 1.1) :
 * - Pure : pas d'accès DB, pas de lecture env, pas d'appel réseau direct.
 * - Toutes les dépendances externes (fetch audio, split MP3, Whisper API) sont
 *   injectées via `deps` pour testabilité en isolation.
 * - Findings simulation Inoxtag intégrés :
 *     1. guestName -> prompt Whisper obligatoire (sinon noms propres flingués)
 *     2. overlap mid-phrase 5s sur les chunks (sinon perte boundaries)
 *     3. dedup post-merge sur les segments overlappants
 *
 * @see docs/brief-primitives-2026-04-28.md (Phase 1.1)
 * @see engine/agents/guestBriefAgent.ts (pattern de référence)
 */

const WHISPER_PRICE_PER_MIN_USD = 0.006;
export const WHISPER_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const WHISPER_CHUNK_TARGET_BYTES = 24 * 1024 * 1024;
export const WHISPER_CHUNK_OVERLAP_SECONDS = 5;

/**
 * Segment de transcript avec texte. Distinct de TranscriptSegmentSchema
 * (engine/db/types/editorial-event-metadata.ts) qui ne contient que la
 * position (utilisé pour persister un lens_classification, pas pour
 * l'output d'un transcribeur).
 */
export interface TranscribedSegment {
  start_seconds: number;
  end_seconds: number;
  text: string;
}

export interface TranscribeAudioOptions {
  guestName?: string;
  model?: 'whisper-1';
  language?: 'fr';
}

export interface TranscriptResult {
  full_text: string;
  segments: TranscribedSegment[];
  duration_seconds: number;
  cost_usd: number;
}

export interface AudioChunk {
  buffer: Buffer;
  sizeBytes: number;
  startOffsetSeconds: number;
  durationSeconds: number;
}

export interface WhisperParams {
  audioBuffer: Buffer;
  prompt?: string;
  language?: string;
  model?: string;
}

export interface WhisperResponse {
  text: string;
  segments: TranscribedSegment[];
  duration_seconds: number;
}

export interface FetchAudioResult {
  buffer: Buffer;
  sizeBytes: number;
}

export interface TranscribeAudioDeps {
  fetchAudioFn: (url: string) => Promise<FetchAudioResult>;
  /** Splitter audio en chunks ~targetBytes avec overlap mid-phrase (ffmpeg
   *  côté impl prod, mock côté tests). */
  splitAudioFn: (
    buffer: Buffer,
    opts: { targetBytes: number; overlapSeconds: number },
  ) => Promise<AudioChunk[]>;
  whisperFn: (params: WhisperParams) => Promise<WhisperResponse>;
}

export function buildWhisperPrompt(guestName?: string): string {
  const base = 'Podcast français. Vocabulaire entrepreneurial, finance, tech.';
  if (!guestName?.trim()) return base;
  return `Podcast français. Invité : ${guestName}. Vocabulaire entrepreneurial, finance, tech.`;
}

/**
 * Merge les segments transcrits de chunks contigus en un transcript continu,
 * en re-positionnant chaque segment sur le temps absolu et en supprimant les
 * doublons issus de l'overlap.
 */
export function mergeTranscribedChunks(
  chunkResults: WhisperResponse[],
  chunks: AudioChunk[],
): TranscribedSegment[] {
  if (chunkResults.length !== chunks.length) {
    throw new Error(
      `transcribeAudio: chunkResults.length (${chunkResults.length}) !== chunks.length (${chunks.length})`,
    );
  }
  const merged: TranscribedSegment[] = [];
  for (let i = 0; i < chunkResults.length; i++) {
    const offset = chunks[i].startOffsetSeconds;
    const positioned: TranscribedSegment[] = chunkResults[i].segments.map((s) => ({
      start_seconds: s.start_seconds + offset,
      end_seconds: s.end_seconds + offset,
      text: s.text,
    }));
    if (i === 0) {
      merged.push(...positioned);
      continue;
    }
    const lastEnd = merged.length ? merged[merged.length - 1].end_seconds : 0;
    // dedup : on retire les segments qui démarrent avant la fin du dernier segment retenu
    for (const seg of positioned) {
      if (seg.start_seconds >= lastEnd) {
        merged.push(seg);
      }
    }
  }
  return merged;
}

export async function transcribeAudio(
  audioUrl: string,
  options: TranscribeAudioOptions,
  deps: TranscribeAudioDeps,
): Promise<TranscriptResult> {
  if (typeof audioUrl !== 'string' || !audioUrl.trim()) {
    throw new Error('transcribeAudio: audioUrl is required');
  }

  const prompt = buildWhisperPrompt(options.guestName);
  const language = options.language ?? 'fr';
  const model = options.model ?? 'whisper-1';

  const { buffer, sizeBytes } = await deps.fetchAudioFn(audioUrl);

  let chunks: AudioChunk[];
  if (sizeBytes <= WHISPER_MAX_FILE_BYTES) {
    chunks = [
      { buffer, sizeBytes, startOffsetSeconds: 0, durationSeconds: 0 },
    ];
  } else {
    chunks = await deps.splitAudioFn(buffer, {
      targetBytes: WHISPER_CHUNK_TARGET_BYTES,
      overlapSeconds: WHISPER_CHUNK_OVERLAP_SECONDS,
    });
    if (chunks.length === 0) {
      throw new Error('transcribeAudio: splitAudioFn returned 0 chunks');
    }
  }

  const chunkResults: WhisperResponse[] = [];
  for (const chunk of chunks) {
    const result = await deps.whisperFn({
      audioBuffer: chunk.buffer,
      prompt,
      language,
      model,
    });
    chunkResults.push(result);
  }

  const segments = mergeTranscribedChunks(chunkResults, chunks);

  // duration absolue : max des fins de segments si dispo, fallback sur
  // somme des durations chunkées (cas test sans segments).
  const segmentMaxEnd = segments.length
    ? Math.max(...segments.map((s) => s.end_seconds))
    : 0;
  const chunkSumDuration = chunkResults.reduce(
    (sum, r) => sum + (r.duration_seconds ?? 0),
    0,
  );
  // En multi-chunk avec overlap, la somme des duration_seconds gonfle de
  // (n_chunks - 1) * overlap. On corrige.
  const overlapCorrection =
    chunks.length > 1 ? (chunks.length - 1) * WHISPER_CHUNK_OVERLAP_SECONDS : 0;
  const correctedSum = Math.max(0, chunkSumDuration - overlapCorrection);
  const durationSeconds = Math.max(segmentMaxEnd, correctedSum);

  const fullText = segments.map((s) => s.text).join(' ').trim();
  const costUsd = (durationSeconds / 60) * WHISPER_PRICE_PER_MIN_USD;

  return {
    full_text: fullText,
    segments,
    duration_seconds: durationSeconds,
    cost_usd: Number(costUsd.toFixed(4)),
  };
}
