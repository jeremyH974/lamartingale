import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from project root with override
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });

const KEY = process.env.OPENAI_API_KEY;
if (!KEY) { console.error('OPENAI_API_KEY missing'); process.exit(1); }

const chunks = fs.readdirSync(__dirname).filter(f => /^chunk_\d+\.mp3$/.test(f)).sort();
console.log('chunks:', chunks);

// Probe durations via ffmpeg-static
import { execFileSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';

function probeDuration(file) {
  const out = execFileSync(ffmpegPath, ['-i', file], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).toString() +
    (() => { try { execFileSync(ffmpegPath, ['-i', file], { stdio: ['ignore','pipe','pipe'] }); } catch (e) { return e.stderr?.toString() || ''; } return ''; })();
  return null;
}

// Better: parse from already-known durations
const DURATIONS = {
  'chunk_000.mp3': 1080.01,
  'chunk_001.mp3': 1080.01,
  'chunk_002.mp3': 1080.01,
  'chunk_003.mp3': 1079.98,
  'chunk_004.mp3': 1080.01,
  'chunk_005.mp3': 1080.01,
  'chunk_006.mp3': 1080.01,
  'chunk_007.mp3': 1005.98,
};

const totalDuration = Object.values(DURATIONS).reduce((a,b)=>a+b,0);
console.log('total duration (computed):', totalDuration.toFixed(2), 'seconds');

const allSegments = [];
let offset = 0;
const t0 = Date.now();
let totalApiSeconds = 0;

for (const chunk of chunks) {
  const filePath = path.join(__dirname, chunk);
  const stat = fs.statSync(filePath);
  console.log(`\n[${chunk}] size=${(stat.size/1024/1024).toFixed(1)}MB offset=${offset.toFixed(2)}s`);

  const fd = new FormData();
  const buf = fs.readFileSync(filePath);
  fd.append('file', new Blob([buf], { type: 'audio/mpeg' }), chunk);
  fd.append('model', 'whisper-1');
  fd.append('response_format', 'verbose_json');
  fd.append('language', 'fr');

  const tStart = Date.now();
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${KEY}` },
    body: fd,
  });
  const elapsed = (Date.now() - tStart)/1000;
  totalApiSeconds += elapsed;

  if (!res.ok) {
    const txt = await res.text();
    console.error('whisper error', res.status, txt.slice(0,500));
    process.exit(2);
  }
  const json = await res.json();
  console.log(`  ok ${elapsed.toFixed(1)}s · lang=${json.language} · segments=${json.segments?.length||0} · audio_dur=${json.duration?.toFixed(1)||'?'}s`);

  // Append segments with cumulative offset
  for (const seg of (json.segments || [])) {
    allSegments.push({
      start: +(seg.start + offset).toFixed(3),
      end: +(seg.end + offset).toFixed(3),
      text: seg.text,
      chunk_idx: chunks.indexOf(chunk),
    });
  }
  offset += DURATIONS[chunk];
}

const totalElapsed = (Date.now() - t0)/1000;

// Cost: Whisper API = $0.006 per minute = 0.01 cents/s
const audioMinutes = totalDuration / 60;
const costUsd = audioMinutes * 0.006;

const out = {
  episode_id: 2017,
  podcast: 'gdiy',
  episode_number: 422,
  episode_title: '#422 - Inoxtag - Vidéaste - Casser YouTube et rebattre les cartes de l\'audiovisuel',
  total_duration_seconds: totalDuration,
  language: 'fr',
  segments: allSegments,
  metadata: {
    whisper_model: 'whisper-1',
    total_cost_usd: +costUsd.toFixed(4),
    total_chunks: chunks.length,
    chunk_durations_seconds: DURATIONS,
    api_total_seconds: +totalApiSeconds.toFixed(1),
    pipeline_total_seconds: +totalElapsed.toFixed(1),
    chunking_strategy: 'fixed-1080s-no-overlap',
  },
};

fs.writeFileSync(path.join(__dirname, '01-transcript-raw.json'), JSON.stringify(out, null, 2));
console.log(`\n=== DONE ===`);
console.log(`segments=${allSegments.length} · last_end=${allSegments[allSegments.length-1].end.toFixed(2)}s · target=${totalDuration.toFixed(2)}s · diff=${(totalDuration - allSegments[allSegments.length-1].end).toFixed(2)}s`);
console.log(`cost=$${costUsd.toFixed(4)} · api_time=${totalApiSeconds.toFixed(1)}s · pipeline=${totalElapsed.toFixed(1)}s`);
console.log(`saved: 01-transcript-raw.json`);
