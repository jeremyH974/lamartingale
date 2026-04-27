import { describe, it, expect, vi } from 'vitest';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import ffmpegStatic from 'ffmpeg-static';
import { splitAudio } from '@engine/primitives/transcribeAudioFactory';

const FFMPEG = (ffmpegStatic as unknown as string) ?? 'ffmpeg';

/**
 * Generate a synthetic MP3 of `seconds` seconds via ffmpeg test source.
 * Returns the file buffer (in-memory).
 */
async function makeSyntheticMp3(seconds: number): Promise<Buffer> {
  const out = join(tmpdir(), `sillon-test-${Date.now()}-${Math.random()}.mp3`);
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(FFMPEG, [
      '-y',
      '-f', 'lavfi',
      '-i', `sine=frequency=440:duration=${seconds}`,
      '-acodec', 'libmp3lame',
      '-b:a', '64k',
      out,
    ]);
    let err = '';
    proc.stderr.on('data', (c) => (err += c.toString('utf8')));
    proc.on('error', reject);
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg gen exit ${code}: ${err.slice(-300)}`)),
    );
  });
  const buf = await fs.readFile(out);
  await fs.unlink(out).catch(() => {});
  return buf;
}

describe('splitAudio (ffmpeg real)', () => {
  it('produces 1 chunk when audio fits in target bytes', async () => {
    // 6 seconds @ 64kbps ≈ 48 KB. Target 1 MB → fits in 1 chunk.
    const buf = await makeSyntheticMp3(6);
    const chunks = await splitAudio(buf, {
      targetBytes: 1 * 1024 * 1024,
      overlapSeconds: 5,
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].startOffsetSeconds).toBe(0);
    expect(chunks[0].sizeBytes).toBeGreaterThan(0);
  }, 30000);

  it('splits 60s audio into multiple chunks with 5s overlap', async () => {
    // 60s @ 64kbps ≈ 480 KB. Target 160 KB → ~20s per chunk → expect 3+ chunks
    // each ≥10s (above the sanity-check threshold).
    const buf = await makeSyntheticMp3(60);
    const chunks = await splitAudio(buf, {
      targetBytes: 160 * 1024,
      overlapSeconds: 5,
    });
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // Each subsequent chunk must start before the previous one ended (overlap)
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1];
      const cur = chunks[i];
      const prevEnd = prev.startOffsetSeconds + prev.durationSeconds;
      // current chunk starts at prevEnd - overlap (within rounding tolerance)
      expect(cur.startOffsetSeconds).toBeLessThan(prevEnd);
      expect(cur.startOffsetSeconds).toBeGreaterThanOrEqual(prevEnd - 6); // 5s overlap ± rounding
    }
    // All chunks have non-empty buffers
    for (const c of chunks) {
      expect(c.sizeBytes).toBeGreaterThan(0);
    }
  }, 60000);

  it('coverage: union of chunks covers the entire audio duration', async () => {
    const seconds = 60;
    const buf = await makeSyntheticMp3(seconds);
    const chunks = await splitAudio(buf, {
      targetBytes: 160 * 1024,
      overlapSeconds: 5,
    });
    const last = chunks[chunks.length - 1];
    const totalCovered = last.startOffsetSeconds + last.durationSeconds;
    // Coverage should approach the audio duration (within 1s tolerance)
    expect(totalCovered).toBeGreaterThanOrEqual(seconds - 1);
  }, 60000);

  it('throws when bitrate cannot fit target chunk', async () => {
    // Tiny target (1 KB) → chunk would be ~0.1s, below 10s sanity floor.
    const buf = await makeSyntheticMp3(10);
    await expect(
      splitAudio(buf, { targetBytes: 1024, overlapSeconds: 5 }),
    ).rejects.toThrow(/chunk duration too small|bitrate/);
  }, 30000);
});
