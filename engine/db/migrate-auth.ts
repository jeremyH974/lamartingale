import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

/**
 * Migration idempotente — Phase E auth passwordless.
 *
 * Crée 2 tables :
 *   - podcast_access(email, tenant_id, role, created_at) avec UNIQUE(email, tenant_id)
 *   - magic_link(token PK, email, expires_at, consumed, created_at)
 *
 * Convention root : une ligne podcast_access avec tenant_id='*' et role='root'
 * signifie "accès à tous les tenants". Le middleware bypass le filtre pour ces users.
 *
 * Usage :
 *   npx tsx engine/db/migrate-auth.ts          (dry = print SQL + check)
 *   npx tsx engine/db/migrate-auth.ts --write  (exécute CREATE TABLE IF NOT EXISTS)
 */

const STATEMENTS: { label: string; sql: string }[] = [
  {
    label: 'podcast_access',
    sql: `
      CREATE TABLE IF NOT EXISTS podcast_access (
        id serial PRIMARY KEY,
        email text NOT NULL,
        tenant_id text NOT NULL,
        role text NOT NULL DEFAULT 'viewer',
        created_at timestamp DEFAULT now(),
        CONSTRAINT uq_podcast_access_email_tenant UNIQUE (email, tenant_id)
      );
    `,
  },
  {
    label: 'idx_podcast_access_email',
    sql: `CREATE INDEX IF NOT EXISTS idx_podcast_access_email ON podcast_access(email);`,
  },
  {
    label: 'magic_link',
    sql: `
      CREATE TABLE IF NOT EXISTS magic_link (
        token text PRIMARY KEY,
        email text NOT NULL,
        expires_at timestamp NOT NULL,
        consumed boolean NOT NULL DEFAULT false,
        created_at timestamp DEFAULT now()
      );
    `,
  },
  {
    label: 'idx_magic_link_email',
    sql: `CREATE INDEX IF NOT EXISTS idx_magic_link_email ON magic_link(email);`,
  },
];

async function main() {
  const write = process.argv.includes('--write');
  if (!process.env.DATABASE_URL) {
    console.error('[migrate-auth] DATABASE_URL required');
    process.exit(1);
  }
  const sql = neon(process.env.DATABASE_URL);

  console.log(`[migrate-auth] mode=${write ? 'WRITE' : 'DRY'}`);
  for (const s of STATEMENTS) {
    console.log(`[migrate-auth] → ${s.label}`);
    if (!write) {
      console.log(s.sql.trim());
      continue;
    }
    await sql.query(s.sql);
  }

  if (write) {
    const counts = await sql`
      SELECT
        (SELECT count(*)::int FROM podcast_access) AS podcast_access,
        (SELECT count(*)::int FROM magic_link)     AS magic_link
    ` as any[];
    console.log('[migrate-auth] counts:', counts[0]);
  }
  console.log('[migrate-auth] done.');
}

main().catch((e) => { console.error(e); process.exit(1); });
