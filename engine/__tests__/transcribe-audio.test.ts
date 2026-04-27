import { describe, it, expect, vi } from 'vitest';
import {
  transcribeAudio,
  buildWhisperPrompt,
  mergeTranscribedChunks,
  WHISPER_MAX_FILE_BYTES,
  WHISPER_CHUNK_OVERLAP_SECONDS,
  type TranscribeAudioDeps,
  type AudioChunk,
  type WhisperResponse,
} from '@engine/primitives/transcribeAudio';

// Helpers ---------------------------------------------------------------------

function makeBuffer(sizeBytes: number): Buffer {
  return Buffer.alloc(sizeBytes, 0);
}

function makeDeps(overrides?: Partial<TranscribeAudioDeps>): TranscribeAudioDeps {
  return {
    fetchAudioFn: vi.fn(async (_url: string) => ({
      buffer: makeBuffer(1024),
      sizeBytes: 1024,
    })),
    splitAudioFn: vi.fn(async () => []),
    whisperFn: vi.fn(async () => ({
      text: 'mock',
      segments: [{ start_seconds: 0, end_seconds: 10, text: 'mock' }],
      duration_seconds: 10,
    })),
    ...overrides,
  };
}

// Tests -----------------------------------------------------------------------

describe('buildWhisperPrompt', () => {
  it('returns base prompt when guestName missing', () => {
    expect(buildWhisperPrompt()).toContain('Podcast français');
    expect(buildWhisperPrompt()).not.toContain('Invité');
  });

  it('returns base prompt when guestName is empty/whitespace', () => {
    expect(buildWhisperPrompt('')).not.toContain('Invité');
    expect(buildWhisperPrompt('   ')).not.toContain('Invité');
  });

  it('injects guestName when provided (finding Inoxtag)', () => {
    const prompt = buildWhisperPrompt('Frédéric Plais');
    expect(prompt).toContain('Frédéric Plais');
    expect(prompt).toContain('Invité');
  });

  it('injects companyName when provided (finding Stoïk → Stoic)', () => {
    const prompt = buildWhisperPrompt('Jules Veyrat', 'Stoïk');
    expect(prompt).toContain('Jules Veyrat');
    expect(prompt).toContain('Stoïk');
    expect(prompt).toContain('Entreprise');
  });

  it('omits companyName mention when missing/empty', () => {
    expect(buildWhisperPrompt('Plais')).not.toContain('Entreprise');
    expect(buildWhisperPrompt('Plais', '')).not.toContain('Entreprise');
    expect(buildWhisperPrompt('Plais', '   ')).not.toContain('Entreprise');
  });

  it('accepts companyName without guestName (degraded but valid)', () => {
    const prompt = buildWhisperPrompt(undefined, 'Stoïk');
    expect(prompt).toContain('Stoïk');
    expect(prompt).not.toContain('Invité');
  });
});

describe('mergeTranscribedChunks', () => {
  it('merges single chunk verbatim with offset 0', () => {
    const chunks: AudioChunk[] = [
      { buffer: makeBuffer(1), sizeBytes: 1, startOffsetSeconds: 0, durationSeconds: 60 },
    ];
    const results: WhisperResponse[] = [
      {
        text: 'hello',
        segments: [
          { start_seconds: 0, end_seconds: 5, text: 'hello' },
          { start_seconds: 5, end_seconds: 10, text: 'world' },
        ],
        duration_seconds: 10,
      },
    ];
    const merged = mergeTranscribedChunks(results, chunks);
    expect(merged).toHaveLength(2);
    expect(merged[0].text).toBe('hello');
    expect(merged[1].end_seconds).toBe(10);
  });

  it('positions chunks at absolute offset and dedupes overlap', () => {
    const chunks: AudioChunk[] = [
      { buffer: makeBuffer(1), sizeBytes: 1, startOffsetSeconds: 0, durationSeconds: 100 },
      { buffer: makeBuffer(1), sizeBytes: 1, startOffsetSeconds: 95, durationSeconds: 100 },
    ];
    const results: WhisperResponse[] = [
      {
        text: 'a b',
        segments: [
          { start_seconds: 90, end_seconds: 100, text: 'tail of chunk1' },
        ],
        duration_seconds: 100,
      },
      {
        text: 'b c',
        // chunk2 starts at offset 95, so its local 0..5 = absolute 95..100
        // should be deduped vs chunk1 last end_seconds=100
        segments: [
          { start_seconds: 0, end_seconds: 5, text: 'overlap segment' },
          { start_seconds: 5, end_seconds: 15, text: 'fresh content' },
        ],
        duration_seconds: 100,
      },
    ];
    const merged = mergeTranscribedChunks(results, chunks);
    expect(merged.map((s) => s.text)).toEqual([
      'tail of chunk1',
      'fresh content',
    ]);
    // fresh content should be at absolute 100..110 (offset 95 + local 5..15)
    expect(merged[1].start_seconds).toBe(100);
    expect(merged[1].end_seconds).toBe(110);
  });

  it('throws if chunkResults length mismatches chunks length', () => {
    const chunks: AudioChunk[] = [
      { buffer: makeBuffer(1), sizeBytes: 1, startOffsetSeconds: 0, durationSeconds: 0 },
    ];
    expect(() => mergeTranscribedChunks([], chunks)).toThrow(/length/);
  });
});

describe('transcribeAudio (primitive)', () => {
  it('throws if audioUrl is empty', async () => {
    await expect(
      transcribeAudio('', {}, makeDeps()),
    ).rejects.toThrow(/audioUrl is required/);
  });

  it('skips split when audio <= 25 MB (1 chunk)', async () => {
    const deps = makeDeps({
      fetchAudioFn: vi.fn(async () => ({
        buffer: makeBuffer(1024 * 1024), // 1 MB
        sizeBytes: 1024 * 1024,
      })),
      whisperFn: vi.fn(async () => ({
        text: 'short audio',
        segments: [{ start_seconds: 0, end_seconds: 60, text: 'short audio' }],
        duration_seconds: 60,
      })),
    });
    const result = await transcribeAudio('https://x/audio.mp3', {}, deps);
    expect(deps.splitAudioFn).not.toHaveBeenCalled();
    expect(deps.whisperFn).toHaveBeenCalledTimes(1);
    expect(result.duration_seconds).toBe(60);
    expect(result.full_text).toBe('short audio');
  });

  it('splits audio when > 25 MB and merges chunks', async () => {
    const bigSize = WHISPER_MAX_FILE_BYTES + 1;
    const splitChunks: AudioChunk[] = [
      {
        buffer: makeBuffer(1024),
        sizeBytes: 1024,
        startOffsetSeconds: 0,
        durationSeconds: 1500,
      },
      {
        buffer: makeBuffer(1024),
        sizeBytes: 1024,
        startOffsetSeconds: 1500 - WHISPER_CHUNK_OVERLAP_SECONDS,
        durationSeconds: 1200,
      },
    ];
    const deps = makeDeps({
      fetchAudioFn: vi.fn(async () => ({
        buffer: makeBuffer(bigSize),
        sizeBytes: bigSize,
      })),
      splitAudioFn: vi.fn(async () => splitChunks),
      whisperFn: vi
        .fn()
        .mockResolvedValueOnce({
          text: 'chunk1',
          segments: [{ start_seconds: 0, end_seconds: 1500, text: 'chunk1' }],
          duration_seconds: 1500,
        })
        .mockResolvedValueOnce({
          text: 'chunk2',
          segments: [
            { start_seconds: 0, end_seconds: 5, text: 'overlap' },
            { start_seconds: 5, end_seconds: 1200, text: 'chunk2' },
          ],
          duration_seconds: 1200,
        }),
    });
    const result = await transcribeAudio('https://x/big.mp3', {}, deps);
    expect(deps.splitAudioFn).toHaveBeenCalledOnce();
    expect(deps.whisperFn).toHaveBeenCalledTimes(2);
    // Overlap 'overlap' (95..100 absolute = 1500..1505) is BEFORE last_end=1500? no, equal.
    // start_seconds=1495 (1500-5+0) < 1500 → deduped
    // chunk2 'chunk2' segment local 5..1200 → absolute 1500..2695 → kept
    const texts = result.segments.map((s) => s.text);
    expect(texts).toContain('chunk1');
    expect(texts).toContain('chunk2');
    expect(texts).not.toContain('overlap');
  });

  it('passes guestName via prompt to whisperFn (finding Inoxtag)', async () => {
    const whisperFn = vi.fn(async () => ({
      text: 't',
      segments: [{ start_seconds: 0, end_seconds: 1, text: 't' }],
      duration_seconds: 1,
    }));
    await transcribeAudio(
      'https://x/audio.mp3',
      { guestName: 'Inoxtag' },
      makeDeps({ whisperFn }),
    );
    const callArgs = whisperFn.mock.calls[0][0];
    expect(callArgs.prompt).toContain('Inoxtag');
  });

  it('passes companyName via prompt to whisperFn (finding Stoïk→Stoic)', async () => {
    const whisperFn = vi.fn(async () => ({
      text: 't',
      segments: [{ start_seconds: 0, end_seconds: 1, text: 't' }],
      duration_seconds: 1,
    }));
    await transcribeAudio(
      'https://x/audio.mp3',
      { guestName: 'Jules Veyrat', companyName: 'Stoïk' },
      makeDeps({ whisperFn }),
    );
    const callArgs = whisperFn.mock.calls[0][0];
    expect(callArgs.prompt).toContain('Jules Veyrat');
    expect(callArgs.prompt).toContain('Stoïk');
  });

  it('uses default prompt (no guestName) when omitted', async () => {
    const whisperFn = vi.fn(async () => ({
      text: 't',
      segments: [{ start_seconds: 0, end_seconds: 1, text: 't' }],
      duration_seconds: 1,
    }));
    await transcribeAudio(
      'https://x/audio.mp3',
      {},
      makeDeps({ whisperFn }),
    );
    const callArgs = whisperFn.mock.calls[0][0];
    expect(callArgs.prompt).not.toContain('Invité');
    expect(callArgs.prompt).toContain('Podcast français');
  });

  it('computes cost at $0.006/min on absolute duration', async () => {
    // 600 seconds = 10 minutes → cost = 10 * 0.006 = $0.06
    const deps = makeDeps({
      fetchAudioFn: vi.fn(async () => ({
        buffer: makeBuffer(1024),
        sizeBytes: 1024,
      })),
      whisperFn: vi.fn(async () => ({
        text: 't',
        segments: [{ start_seconds: 0, end_seconds: 600, text: 't' }],
        duration_seconds: 600,
      })),
    });
    const result = await transcribeAudio('https://x/audio.mp3', {}, deps);
    expect(result.cost_usd).toBeCloseTo(0.06, 4);
  });

  it('passes language and model defaults (fr, whisper-1)', async () => {
    const whisperFn = vi.fn(async () => ({
      text: 't',
      segments: [{ start_seconds: 0, end_seconds: 1, text: 't' }],
      duration_seconds: 1,
    }));
    await transcribeAudio('https://x/a.mp3', {}, makeDeps({ whisperFn }));
    const args = whisperFn.mock.calls[0][0];
    expect(args.language).toBe('fr');
    expect(args.model).toBe('whisper-1');
  });

  it('throws if splitAudioFn returns 0 chunks for big audio', async () => {
    const bigSize = WHISPER_MAX_FILE_BYTES + 1;
    const deps = makeDeps({
      fetchAudioFn: vi.fn(async () => ({
        buffer: makeBuffer(bigSize),
        sizeBytes: bigSize,
      })),
      splitAudioFn: vi.fn(async () => []),
    });
    await expect(
      transcribeAudio('https://x/big.mp3', {}, deps),
    ).rejects.toThrow(/0 chunks/);
  });
});
