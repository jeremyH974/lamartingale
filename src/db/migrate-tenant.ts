import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { getConfig } from '../config';

// Migration idempotente : ajoute tenant_id à toutes les tables multi-tenant.
// Backfill = tenant_id de la config active (par défaut 'lamartingale').
// Crée les index composites (tenant_id, colonne_fréquente) sur les requêtes chaudes.
//
// Usage :
//   npx tsx src/db/migrate-tenant.ts
//   PODCAST_ID=gdiy npx tsx src/db/migrate-tenant.ts  (backfill avec tenant='gdiy' — à éviter si LM existe déjà)

const TABLES: {
  name: string;
  indexCol?: string;          // colonne pour index composite
}[] = [
  { name: 'episodes',              indexCol: 'pillar' },
  { name: 'episodes_media' },
  { name: 'episodes_enrichment' },
  { name: 'guests',                indexCol: 'name' },
  { name: 'guest_episodes' },
  { name: 'episode_links',         indexCol: 'link_type' },
  { name: 'quiz_questions',        indexCol: 'pillar' },
  { name: 'taxonomy',              indexCol: 'pillar' },
  { name: 'learning_paths' },
  { name: 'episode_similarities' },
];

async function main() {
  const cfg = getConfig();
  const tenant = cfg.database.tenantId;

  const sql = neon(process.env.DATABASE_URL!);
  console.log(`[MIGRATE-TENANT] podcast=${cfg.id} tenant=${tenant}`);

  for (const t of TABLES) {
    // 1. Ajout colonne (idempotent)
    // Utilisation de format string car les noms de tables ne sont pas paramétrables.
    // Pas de SQL injection possible — TABLES est statique.
    await sql.query(
      `ALTER TABLE ${t.name} ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT '${tenant}'`,
    );

    // 2. Backfill explicite (au cas où des rows existeraient sans default appliqué)
    const result = await sql.query(
      `UPDATE ${t.name} SET tenant_id = $1 WHERE tenant_id IS NULL OR tenant_id = ''`,
      [tenant],
    ) as any;
    const updated = result?.rowCount ?? 0;

    // 3. Index composite
    if (t.indexCol) {
      await sql.query(
        `CREATE INDEX IF NOT EXISTS idx_${t.name}_tenant_${t.indexCol} ON ${t.name} (tenant_id, ${t.indexCol})`,
      );
    } else {
      await sql.query(
        `CREATE INDEX IF NOT EXISTS idx_${t.name}_tenant ON ${t.name} (tenant_id)`,
      );
    }

    const [{ c }] = await sql.query(`SELECT count(*) as c FROM ${t.name} WHERE tenant_id = $1`, [tenant]) as any;
    console.log(`  ${t.name.padEnd(24)} : ${c} rows tenant=${tenant} ${updated ? `(backfilled ${updated})` : ''}`);
  }

  console.log('[MIGRATE-TENANT] done');
}

main().catch(e => { console.error('[MIGRATE-TENANT] FATAL', e); process.exit(1); });
