#!/usr/bin/env tsx
/**
 * CLI pour générer un brief invité via persistGuestBrief.
 *
 * Usage :
 *   npx tsx scripts/run-guest-brief.ts --guest-id 434 --dry
 *   npx tsx scripts/run-guest-brief.ts --guest-id 434 --write
 *   npx tsx scripts/run-guest-brief.ts --guest-id 434 --model haiku --write
 *   npx tsx scripts/run-guest-brief.ts --guest-id 434 --max-episodes 5 --dry
 *
 * Defaults: --dry (pas de write), --model sonnet, --max-episodes 10.
 * Le mode --write est strictement opt-in (cf sandbox policy CLAUDE.md).
 */
import 'dotenv/config';
import { Command } from 'commander';
import { persistGuestBrief } from '../engine/agents/wrappers/persistGuestBrief';

const program = new Command();
program
  .requiredOption('--guest-id <id>', 'cross_podcast_guests.id', (v) => parseInt(v, 10))
  .option('--model <model>', 'sonnet | haiku', 'sonnet')
  .option('--max-episodes <n>', 'cap nb épisodes', (v) => parseInt(v, 10), 10)
  .option('--dry', 'dry-run sans UPDATE DB (default)')
  .option('--write', 'écriture DB explicite (opt-in)');

program.parse(process.argv);
const opts = program.opts<{
  guestId: number;
  model: 'sonnet' | 'haiku';
  maxEpisodes: number;
  dry?: boolean;
  write?: boolean;
}>();

if (!['sonnet', 'haiku'].includes(opts.model)) {
  console.error(`Invalid model: ${opts.model}. Expected 'sonnet' or 'haiku'.`);
  process.exit(1);
}

// dryRun par défaut, sauf si --write explicite
const dryRun = !opts.write;

(async () => {
  console.error(
    `\n[run-guest-brief] guestId=${opts.guestId} model=${opts.model} maxEpisodes=${opts.maxEpisodes} ${dryRun ? 'DRY-RUN' : 'WRITE'}\n`,
  );

  const result = await persistGuestBrief({
    guestId: opts.guestId,
    llmModel: opts.model,
    maxEpisodes: opts.maxEpisodes,
    dryRun,
  });

  console.log(JSON.stringify(result, null, 2));
  console.error(
    `\n[run-guest-brief] done: ${result.episodesUsed}/${result.totalEpisodesAvailable} eps · cost ≈ ${result.costEstimateCents.toFixed(2)} cents · ${result.durationMs}ms · persisted=${result.persisted}\n`,
  );
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
