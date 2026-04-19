import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

// Migration idempotente : crée la table `cross_podcast_guests`
// (vue unifiée cross-tenant des invités de l'univers MS — pas scoped tenant).
// Peuplée par src/cross/match-guests.ts.
//
// Usage : npx tsx src/db/migrate-cross-podcast.ts

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  console.log('[MIGRATE-CROSS-PODCAST] creating cross_podcast_guests…');

  await sql.query(`
    CREATE TABLE IF NOT EXISTS cross_podcast_guests (
      id                  SERIAL PRIMARY KEY,
      canonical_name      TEXT NOT NULL UNIQUE,
      display_name        TEXT NOT NULL,
      bio                 TEXT,
      linkedin_url        TEXT,
      instagram_url       TEXT,
      website_url         TEXT,
      tenant_appearances  JSONB DEFAULT '[]'::jsonb,
      total_episodes      INTEGER DEFAULT 0,
      total_podcasts      INTEGER DEFAULT 0,
      is_host             BOOLEAN DEFAULT false,
      created_at          TIMESTAMP DEFAULT now(),
      updated_at          TIMESTAMP DEFAULT now()
    )
  `);

  await sql.query(`CREATE INDEX IF NOT EXISTS idx_cross_guests_canonical    ON cross_podcast_guests (canonical_name)`);
  await sql.query(`CREATE INDEX IF NOT EXISTS idx_cross_guests_total_ep     ON cross_podcast_guests (total_episodes DESC)`);
  await sql.query(`CREATE INDEX IF NOT EXISTS idx_cross_guests_total_pods   ON cross_podcast_guests (total_podcasts DESC)`);

  const [{ c }] = await sql.query(`SELECT count(*) as c FROM cross_podcast_guests`) as any;
  console.log(`  cross_podcast_guests.rows = ${c}`);
  console.log('[MIGRATE-CROSS-PODCAST] done');
}

main().catch(e => { console.error('[MIGRATE-CROSS-PODCAST] FATAL', e); process.exit(1); });
