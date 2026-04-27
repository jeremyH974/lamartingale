import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { join } from 'path';
import { runSqlFile } from './run-sql-file';

// Migration idempotente : crée la table `editorial_events`.
// Engagement architectural 1 du brief-primitives-2026-04-28 (Phase 2).
//
// Usage :
//   npx tsx engine/db/migrate-editorial-events.ts          # apply
//   npx tsx engine/db/migrate-editorial-events.ts --dry    # dry-run only

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[MIGRATE-EDITORIAL-EVENTS] DATABASE_URL absent — abort');
    process.exit(1);
  }

  const dryRun = process.argv.includes('--dry');
  const sqlPath = join(__dirname, 'migrations', '2026-04-28-create-editorial-events.sql');

  const result = await runSqlFile({ sqlPath, dryRun });
  console.log(
    `[MIGRATE-EDITORIAL-EVENTS] ${dryRun ? 'parsed (dry)' : 'applied'} ${result.statementsExecuted}/${result.statementsParsed} statements`,
  );

  if (dryRun) {
    console.log('[MIGRATE-EDITORIAL-EVENTS] dry-run only — no DB mutation');
    return;
  }

  // Post-apply verifications
  const sql = neon(process.env.DATABASE_URL);
  const tableExists = (await sql.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'editorial_events'
     ) AS exists`,
  )) as Array<{ exists: boolean }>;
  console.log(`  editorial_events table = ${tableExists[0]?.exists ? 'ok' : 'MISSING'}`);

  const expectedIndexes = [
    'editorial_events_source_idx',
    'editorial_events_type_idx',
    'editorial_events_lens_tags_idx',
  ];
  for (const idxName of expectedIndexes) {
    const found = (await sql.query(
      `SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = $1) AS exists`,
      [idxName],
    )) as Array<{ exists: boolean }>;
    console.log(`  ${idxName} = ${found[0]?.exists ? 'ok' : 'MISSING'}`);
  }

  const rowCount = (await sql.query(
    `SELECT count(*) AS c FROM editorial_events`,
  )) as Array<{ c: string }>;
  console.log(`  editorial_events.rows = ${rowCount[0]?.c}`);

  console.log('[MIGRATE-EDITORIAL-EVENTS] done');
}

main().catch((e) => {
  console.error('[MIGRATE-EDITORIAL-EVENTS] FATAL', e);
  process.exit(1);
});
