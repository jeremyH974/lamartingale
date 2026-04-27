/**
 * transcribeAudioFactory — Implémentations de production des dépendances
 * `fetchAudioFn`, `splitAudioFn`, `whisperFn` consommées par la primitive
 * pure `transcribeAudio` (engine/primitives/transcribeAudio.ts).
 *
 * Discipline :
 * - La primitive reste pure (deps injectées). Cette factory vit dans un
 *   fichier séparé pour ne pas polluer la primitive avec des imports
 *   `node:fs`, `child_process`, `https`, OpenAI SDK.
 * - Tous les binaires (ffmpeg) sont fournis via le package npm
 *   `ffmpeg-static` — pas de dépendance système. Cf. brief-primitives
 *   2026-04-28 finding F1 Étape 1 (autorisation explicite Jérémy).
 *
 * Phase 4 V3 / Étape 1.
 */

import https from 'https';
import { promises as fs } from 'fs';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import OpenAI from 'openai';
import ffmpegStatic from 'ffmpeg-static';
import type {
  AudioChunk,
  FetchAudioResult,
  TranscribeAudioDeps,
  WhisperParams,
  WhisperResponse,
} from './transcribeAudio';

const FFMPEG_PATH = (ffmpegStatic as unknown as string) ?? 'ffmpeg';

// ─────────────────────────────────────────────────────────────────────────────
// fetchAudioFn — download HTTP(S) → Buffer
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchAudio(url: string, depth = 0): Promise<FetchAudioResult> {
  if (depth > 5) throw new Error('fetchAudio: too many redirects');
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    https
      .get(
        {
          host: u.hostname,
          path: u.pathname + u.search,
          headers: { 'User-Agent': 'Mozilla/5.0 SillonAudioFetch' },
        },
        (res) => {
          const status = res.statusCode ?? 0;
          if (status >= 300 && status < 400 && res.headers.location) {
            const loc = new URL(res.headers.location, url).toString();
            res.resume();
            fetchAudio(loc, depth + 1).then(resolve, reject);
            return;
          }
          if (status !== 200) {
            res.resume();
            reject(new Error(`fetchAudio: HTTP ${status} on ${url}`));
            return;
          }
          const chunks: Buffer[] = [];
          let total = 0;
          res.on('data', (c: Buffer) => {
            chunks.push(c);
            total += c.length;
          });
          res.on('end', () =>
            resolve({ buffer: Buffer.concat(chunks), sizeBytes: total }),
          );
          res.on('error', reject);
        },
      )
      .on('error', reject);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ffprobe duration
// ─────────────────────────────────────────────────────────────────────────────

function runFfmpegProbeDuration(inputPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    // We use ffmpeg itself (which embeds ffprobe-like behaviour via -i + parse stderr)
    // Avoids an extra ffprobe-static dep.
    const proc = spawn(FFMPEG_PATH, ['-i', inputPath, '-f', 'null', '-']);
    let stderr = '';
    proc.stderr.on('data', (c) => (stderr += c.toString('utf8')));
    proc.on('error', reject);
    proc.on('close', () => {
      // Parse "Duration: HH:MM:SS.xx"
      const m = stderr.match(/Duration:\s+(\d+):(\d+):([\d.]+)/);
      if (!m) {
        reject(new Error(`ffmpeg probe: cannot parse duration from stderr (got ${stderr.length}c)`));
        return;
      }
      const h = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      const s = parseFloat(m[3]);
      resolve(h * 3600 + min * 60 + s);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// splitAudioFn — découpe en chunks ~targetBytes avec overlap mid-phrase
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Découpe un audio MP3 buffer en chunks ~targetBytes, avec overlap de
 * `overlapSeconds` entre chunks consécutifs. Utilise ffmpeg pour des
 * coupes time-based (pas byte-based) qui préservent la cohérence audio.
 *
 * Algo :
 *   1. Écrire le buffer dans un fichier temp.
 *   2. ffprobe → durée totale (Tt).
 *   3. Estimer bitrate ≈ sizeBytes / Tt → durée par chunk pour ~targetBytes.
 *   4. Pour chaque chunk i : ffmpeg -ss start_i -t length_i (avec overlap).
 *   5. startOffsetSeconds reflète le point d'insertion absolu (le caller
 *      utilise ça pour mergeTranscribedChunks).
 *   6. Cleanup fichiers temp.
 */
export async function splitAudio(
  buffer: Buffer,
  opts: { targetBytes: number; overlapSeconds: number },
): Promise<AudioChunk[]> {
  const tmpDir = await fs.mkdtemp(join(tmpdir(), 'sillon-split-'));
  const inputPath = join(tmpDir, 'input.mp3');
  await fs.writeFile(inputPath, buffer);

  try {
    const totalDuration = await runFfmpegProbeDuration(inputPath);
    if (totalDuration <= 0 || !Number.isFinite(totalDuration)) {
      throw new Error(`splitAudio: invalid total duration ${totalDuration}`);
    }
    const sizeBytes = buffer.length;
    const bytesPerSecond = sizeBytes / totalDuration;
    if (bytesPerSecond <= 0) {
      throw new Error('splitAudio: cannot estimate bitrate');
    }
    const chunkDurationSeconds = Math.floor(opts.targetBytes / bytesPerSecond);
    // Sanity check: a chunk shorter than 10s is unlikely to be useful for
    // Whisper transcription. We don't enforce 30s+ as policy because tests
    // and very-low-bitrate sources may legitimately produce smaller chunks.
    if (chunkDurationSeconds < 10) {
      throw new Error(
        `splitAudio: chunk duration too small (${chunkDurationSeconds}s) — bitrate ${bytesPerSecond}b/s vs target ${opts.targetBytes}b`,
      );
    }

    const chunks: AudioChunk[] = [];
    let cursor = 0;
    let idx = 0;
    while (cursor < totalDuration) {
      const length = Math.min(chunkDurationSeconds, totalDuration - cursor);
      const outPath = join(tmpDir, `chunk-${idx}.mp3`);
      await runFfmpegSlice(inputPath, outPath, cursor, length);
      const out = await fs.readFile(outPath);
      chunks.push({
        buffer: out,
        sizeBytes: out.length,
        startOffsetSeconds: cursor,
        durationSeconds: length,
      });
      const chunkEnd = cursor + length;
      // If this chunk reaches the end of the audio, we're done — no need
      // to emit another chunk just to cover the overlap region.
      if (chunkEnd >= totalDuration) break;
      // Next chunk starts `overlapSeconds` BEFORE the end of this one,
      // so consecutive chunks overlap by overlapSeconds (Inoxtag finding).
      const advance = length - opts.overlapSeconds;
      if (advance <= 0) break;
      cursor += advance;
      idx++;
    }
    return chunks;
  } finally {
    // Best-effort cleanup
    try {
      const entries = await fs.readdir(tmpDir);
      await Promise.all(entries.map((e) => fs.unlink(join(tmpDir, e))));
      await fs.rmdir(tmpDir);
    } catch {
      /* swallow cleanup errors */
    }
  }
}

function runFfmpegSlice(
  input: string,
  output: string,
  startSeconds: number,
  durationSeconds: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // -ss before -i = fast seek (less precise but acceptable for podcast splits).
    // -c copy to avoid re-encoding (faster + preserves quality).
    const args = [
      '-y',
      '-ss',
      startSeconds.toString(),
      '-t',
      durationSeconds.toString(),
      '-i',
      input,
      '-c',
      'copy',
      output,
    ];
    const proc = spawn(FFMPEG_PATH, args);
    let stderr = '';
    proc.stderr.on('data', (c) => (stderr += c.toString('utf8')));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg slice exit ${code}: ${stderr.slice(-500)}`));
        return;
      }
      resolve();
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// whisperFn — OpenAI Whisper API
// ─────────────────────────────────────────────────────────────────────────────

export async function callWhisper(params: WhisperParams): Promise<WhisperResponse> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('callWhisper: OPENAI_API_KEY is not set');
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // OpenAI SDK accepte File ou Blob ; Node 18+ a File natif.
  // On utilise toFile() helper du SDK.
  const file = await OpenAI.toFile(params.audioBuffer, 'chunk.mp3', {
    type: 'audio/mpeg',
  });

  const result = await client.audio.transcriptions.create({
    file,
    model: params.model ?? 'whisper-1',
    language: params.language ?? 'fr',
    prompt: params.prompt,
    response_format: 'verbose_json',
    timestamp_granularities: ['segment'],
  });

  // verbose_json returns { text, segments: [{ start, end, text }, ...], duration, ... }
  // SDK type is loose; we narrow defensively.
  const obj = result as unknown as {
    text: string;
    duration?: number;
    segments?: Array<{ start: number; end: number; text: string }>;
  };
  return {
    text: obj.text,
    duration_seconds: obj.duration ?? 0,
    segments: (obj.segments ?? []).map((s) => ({
      start_seconds: s.start,
      end_seconds: s.end,
      text: s.text,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createTranscribeAudioDeps(): TranscribeAudioDeps {
  return {
    fetchAudioFn: fetchAudio,
    splitAudioFn: splitAudio,
    whisperFn: callWhisper,
  };
}
