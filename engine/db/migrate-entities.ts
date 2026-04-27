import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { join } from 'path';
import { runSqlFile } from './run-sql-file';

// Migration idempotente : crée la table `entities`
// (généralisation polymorphe de `cross_podcast_guests`,
// préparation architecturale Sillon couche primitives).
//
// `cross_podcast_guests` reste 100% fonctionnelle en parallèle.
// La migration progressive des données se fera post-pilote.
//
// Usage : npx tsx engine/db/migrate-entities.ts
//
// HISTORIQUE
// ──────────
// 2026-04-28 : refactor pour utiliser `run-sql-file.ts` (parser SQL corrigé,
// cf. docs/DETTE.md "Phase 2 architecturale"). Avant ce refactor, le parser
// ad-hoc skippait silencieusement le 1er statement à cause du filtre
// `!stmt.startsWith('--')` appliqué après split — la migration a dû passer
// via un one-shot `npx tsx -e` lors de son application initiale.

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[MIGRATE-ENTITIES] DATABASE_URL absent — abort');
    process.exit(1);
  }

  const sqlPath = join(__dirname, 'migrations', '2026-04-27-create-entities.sql');
  const result = await runSqlFile({ sqlPath });
  console.log(
    `[MIGRATE-ENTITIES] applied ${result.statementsExecuted}/${result.statementsParsed} statements`,
  );

  // Verify post-application state
  const sql = neon(process.env.DATABASE_URL);
  const rowCount = (await sql.query(`SELECT count(*) AS c FROM entities`)) as Array<{ c: string }>;
  console.log(`  entities.rows = ${rowCount[0]?.c}`);

  const typeIdxRows = (await sql.query(
    `SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'entities_type_idx') AS exists`,
  )) as Array<{ exists: boolean }>;
  const slugIdxRows = (await sql.query(
    `SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'entities_slug_idx') AS exists`,
  )) as Array<{ exists: boolean }>;
  console.log(`  entities_type_idx = ${typeIdxRows[0]?.exists ? 'ok' : 'MISSING'}`);
  console.log(`  entities_slug_idx = ${slugIdxRows[0]?.exists ? 'ok' : 'MISSING'}`);

  console.log('[MIGRATE-ENTITIES] done');
}

main().catch((e) => {
  console.error('[MIGRATE-ENTITIES] FATAL', e);
  process.exit(1);
});
