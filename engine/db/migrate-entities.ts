import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { join } from 'path';

// Migration idempotente : crée la table `entities`
// (généralisation polymorphe de `cross_podcast_guests`,
// préparation architecturale Sillon couche primitives).
//
// `cross_podcast_guests` reste 100% fonctionnelle en parallèle.
// La migration progressive des données se fera post-pilote.
//
// Usage : npx tsx engine/db/migrate-entities.ts

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[MIGRATE-ENTITIES] DATABASE_URL absent — abort');
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);
  console.log('[MIGRATE-ENTITIES] applying 2026-04-27-create-entities.sql…');

  const sqlPath = join(__dirname, 'migrations', '2026-04-27-create-entities.sql');
  const sqlContent = readFileSync(sqlPath, 'utf-8');

  const statements = sqlContent
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  for (const stmt of statements) {
    const cleaned = stmt
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n')
      .trim();
    if (!cleaned) continue;
    await sql.query(cleaned);
  }

  const [{ c }] = (await sql.query(`SELECT count(*) as c FROM entities`)) as any;
  console.log(`  entities.rows = ${c}`);

  const [{ exists: typeIdxOk }] = (await sql.query(`
    SELECT EXISTS (
      SELECT 1 FROM pg_indexes WHERE indexname = 'entities_type_idx'
    ) as exists
  `)) as any;
  const [{ exists: slugIdxOk }] = (await sql.query(`
    SELECT EXISTS (
      SELECT 1 FROM pg_indexes WHERE indexname = 'entities_slug_idx'
    ) as exists
  `)) as any;
  console.log(`  entities_type_idx = ${typeIdxOk ? 'ok' : 'MISSING'}`);
  console.log(`  entities_slug_idx = ${slugIdxOk ? 'ok' : 'MISSING'}`);

  console.log('[MIGRATE-ENTITIES] done');
}

main().catch(e => {
  console.error('[MIGRATE-ENTITIES] FATAL', e);
  process.exit(1);
});
