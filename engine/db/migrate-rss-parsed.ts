/**
 * Migration M4 — ajoute les colonnes pour les blocs RSS parsés.
 * Idempotente (IF NOT EXISTS). Cross-tenant (touche la table globale).
 *
 * Usage : npx tsx src/db/migrate-rss-parsed.ts
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log('[MIGRATE-RSS-PARSED] start');

  const statements = [
    `ALTER TABLE episodes ADD COLUMN IF NOT EXISTS rss_topic TEXT`,
    `ALTER TABLE episodes ADD COLUMN IF NOT EXISTS rss_guest_intro TEXT`,
    `ALTER TABLE episodes ADD COLUMN IF NOT EXISTS rss_discover JSONB DEFAULT '[]'::jsonb`,
    `ALTER TABLE episodes ADD COLUMN IF NOT EXISTS rss_references JSONB DEFAULT '[]'::jsonb`,
    `ALTER TABLE episodes ADD COLUMN IF NOT EXISTS rss_cross_episodes JSONB DEFAULT '[]'::jsonb`,
    `ALTER TABLE episodes ADD COLUMN IF NOT EXISTS rss_promo JSONB`,
    `ALTER TABLE episodes ADD COLUMN IF NOT EXISTS rss_chapters_ts JSONB DEFAULT '[]'::jsonb`,
    `ALTER TABLE episodes ADD COLUMN IF NOT EXISTS youtube_url TEXT`,
    `ALTER TABLE episodes ADD COLUMN IF NOT EXISTS cross_promo TEXT`,
  ];

  for (const stmt of statements) {
    const label = stmt.replace(/^ALTER TABLE episodes ADD COLUMN IF NOT EXISTS /, '').split(' ')[0];
    await sql.query(stmt);
    console.log(`  ✓ ${label}`);
  }

  const [cols] = (await sql`
    SELECT count(*)::int AS c FROM information_schema.columns
    WHERE table_name = 'episodes'
      AND column_name IN ('rss_topic','rss_guest_intro','rss_discover','rss_references',
                          'rss_cross_episodes','rss_promo','rss_chapters_ts','youtube_url','cross_promo')
  `) as any[];
  console.log(`\n[MIGRATE-RSS-PARSED] done — ${cols.c}/9 colonnes présentes`);
}

main().catch((e) => { console.error('[MIGRATE-RSS-PARSED] fatal', e); process.exit(1); });
