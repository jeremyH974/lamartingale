/**
 * Smoke runPack RÉEL — Phase Alpha S2 T2.2 complément 29/04 PM.
 *
 * Lance pack-stefani-l1-l5 sur l'épisode pilote Boissenot LM #174 avec
 * les wrappers réels (L1+L2 = appels Sonnet réels) et stubs (L3-L5 =
 * placeholders deferred). Vérifie que runPack peut générer un pack
 * RÉEL bout-en-bout, prouvant l'industrialisation minimale demandée.
 *
 * Cap budget : $1 (100 cents) — coût estimé ~$0.30 sur L1+L2.
 *
 * Usage : ANTHROPIC_API_KEY=... npx tsx scripts/smoke-runpack-real.ts
 *
 * Le script ne mute aucune DB ni aucun fichier (sauf le rapport stdout
 * et un résumé JSON optionnel). Idempotent.
 */

import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';
import { runPack } from '../engine/pipelines/runPack';
import { createDefaultRegistry } from '../engine/pipelines/defaultRegistry';
import { packStefaniL1L5 } from '../engine/pipelines/packs/stefaniL1L5';
import { createSonnetLlm } from '../engine/agents/wrappers/sonnetLlmFactory';
import type { TranscriptResult } from '../engine/primitives/transcribeAudio';
import type { ClientConfig } from '../engine/types/client-config';
import type { PodcastContext } from '../engine/primitives/types';

const TRANSCRIPT_PATH = path.join(
  __dirname,
  '..',
  'experiments',
  'autonomy-session-2026-04-28',
  'transcripts',
  'lamartingale-174.json',
);

const BUDGET_CAP_CENTS = 100; // $1 cap T2.2 complément

const podcastContext: PodcastContext = {
  podcast_id: 'lamartingale',
  podcast_name: 'La Martingale',
  editorial_focus: 'finance personnelle, investissement, gestion patrimoine',
  host_name: 'Matthieu Stefani',
};

const clientConfig: ClientConfig = {
  client_id: 'stefani-orso',
  display_name: 'Stefani × Orso Media',
  tenants: ['lamartingale', 'gdiy', 'lepanier', 'finscale', 'passionpatrimoine', 'combiencagagne'],
  tone_profile: {
    description: 'Direct, ancré, anti-cliché.',
    forbidden_patterns: ['plongez dans', 'fascinant', 'incontournable', 'révolutionnaire'],
    style_examples: [],
  },
  lenses: [],
  sensitive_topics: [],
  active_packs: ['pack-stefani-l1-l5'],
  notification_email: 'jeremyhenry974@gmail.com',
};

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('SMOKE: ANTHROPIC_API_KEY missing — abort');
    process.exit(1);
  }

  console.log('=== SMOKE runPack RÉEL — Boissenot LM #174 ===\n');

  // 1. Charger transcript pré-existant
  const raw = fs.readFileSync(TRANSCRIPT_PATH, 'utf-8');
  const data = JSON.parse(raw);
  const transcript: TranscriptResult = {
    full_text: data.full_text,
    segments: data.segments,
    duration_seconds: data.duration_seconds,
    cost_usd: data.cost_usd ?? 0,
  };
  console.log(
    `Transcript chargé : ${transcript.full_text.length} chars, ${transcript.segments.length} segments, ${(transcript.duration_seconds / 60).toFixed(1)} min\n`,
  );

  // 2. Préparer LLMFn Sonnet avec compteur partagé + cap
  const tracker = { totalCents: 0, calls: 0 };
  const llmFn = createSonnetLlm({ costTracker: tracker, budgetCapCents: BUDGET_CAP_CENTS });

  // 3. Construire le registry par défaut (L1/L2 réels + L3-L5 stubs)
  const registry = createDefaultRegistry({ llmFn, costTracker: tracker });

  // 4. Préparer configOverrides communs aux 2 steps réels
  const sharedOverrides = {
    transcript,
    guestName: 'Stéphane Boissenot',
    hostName: 'Matthieu Stefani',
    podcastContext,
    maxMoments: 5,
    maxQuotes: 5,
  };
  const packWithInputs = {
    ...packStefaniL1L5,
    steps: packStefaniL1L5.steps.map((s) => ({
      ...s,
      config_overrides: sharedOverrides,
    })),
  };

  // 5. RUN
  const t0 = Date.now();
  const out = await runPack(
    packWithInputs,
    'lamartingale-174',
    clientConfig,
    registry,
    { budgetCapCents: BUDGET_CAP_CENTS },
  );
  const wall = Date.now() - t0;

  // 6. Reporting
  console.log('=== STEPS RESULTS ===');
  for (const sr of out.steps_results) {
    console.log(
      `  [${sr.step_id}] ${sr.agent_id} → ${sr.status} (${sr.duration_ms}ms${sr.cost_estimate_cents ? `, ${sr.cost_estimate_cents}c` : ''})`,
    );
    if (sr.status === 'failed') {
      console.log(`    error: ${sr.error}`);
    } else if (sr.status === 'success') {
      const o = sr.output as any;
      if (sr.step_id === 'L1') {
        console.log(`    → ${o.moments?.length ?? 0} moments extracted, ${o.warnings?.length ?? 0} warnings`);
        if (o.moments?.[0]) console.log(`    sample: "${o.moments[0].title}"`);
      } else if (sr.step_id === 'L2') {
        console.log(`    → ${o.quotes?.length ?? 0} quotes extracted, ${o.warnings?.length ?? 0} warnings`);
        if (o.quotes?.[0]) console.log(`    sample: "${o.quotes[0].text?.slice(0, 80)}…"`);
      } else {
        console.log(`    output: ${JSON.stringify(o).slice(0, 200)}`);
      }
    }
  }
  console.log('\n=== METADATA ===');
  console.log(`  pack_id: ${out.pack_id}`);
  console.log(`  client_id: ${out.client_id}`);
  console.log(`  source_id: ${out.source_id}`);
  console.log(`  total_duration_ms: ${out.metadata.total_duration_ms}`);
  console.log(`  total_cost_estimate_cents: ${out.metadata.total_cost_estimate_cents}`);
  console.log(`  wall clock: ${wall}ms`);

  console.log('\n=== LLM TRACKER ===');
  console.log(`  Sonnet calls: ${tracker.calls}`);
  console.log(`  Total cost (cents): ${tracker.totalCents.toFixed(4)}`);
  console.log(`  Total cost (USD): $${(tracker.totalCents / 100).toFixed(4)}`);
  console.log(`  Budget cap: $${(BUDGET_CAP_CENTS / 100).toFixed(2)}`);
  console.log(
    `  Status: ${tracker.totalCents <= BUDGET_CAP_CENTS ? '✅ under cap' : '⚠ OVER CAP'}`,
  );
}

main().catch((e) => {
  console.error('SMOKE FATAL:', e);
  process.exit(1);
});
