/**
 * Migration schema — pipeline deep content scraping.
 *
 * Ajoute :
 *   - episodes.article_html       (HTML brut de l'article)
 *   - episodes.chapters            (jsonb, titres H2)
 *   - episodes.duration_seconds    (depuis RSS Audiomeans)
 *   - episodes.rss_description     (depuis RSS)
 *   - episode_links (table)        (liens extraits, classifiés)
 *   - guests.linkedin_url          (profil LinkedIn invité)
 *
 * NB : episodes.article_content existe déjà (199/310 remplies) — non touché.
 *
 * Idempotent : utilise IF NOT EXISTS partout.
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function run(label: string, query: () => Promise<unknown>) {
  process.stdout.write(`  • ${label} ... `);
  try {
    await query();
    console.log('OK');
  } catch (e: any) {
    console.log('FAIL');
    throw e;
  }
}

async function main() {
  console.log('[MIGRATION] Deep scraping schema — start');

  console.log('\n[1/3] ALTER episodes — 4 new columns');
  await run('article_html TEXT', () => sql`
    ALTER TABLE episodes ADD COLUMN IF NOT EXISTS article_html TEXT
  `);
  await run(`chapters JSONB DEFAULT '[]'`, () => sql`
    ALTER TABLE episodes ADD COLUMN IF NOT EXISTS chapters JSONB DEFAULT '[]'::jsonb
  `);
  await run('duration_seconds INTEGER', () => sql`
    ALTER TABLE episodes ADD COLUMN IF NOT EXISTS duration_seconds INTEGER
  `);
  await run('rss_description TEXT', () => sql`
    ALTER TABLE episodes ADD COLUMN IF NOT EXISTS rss_description TEXT
  `);

  console.log('\n[2/3] CREATE TABLE episode_links');
  await run('episode_links', () => sql`
    CREATE TABLE IF NOT EXISTS episode_links (
      id SERIAL PRIMARY KEY,
      episode_id INTEGER REFERENCES episodes(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      label TEXT,
      link_type TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(episode_id, url)
    )
  `);
  await run('idx_episode_links_episode', () => sql`
    CREATE INDEX IF NOT EXISTS idx_episode_links_episode ON episode_links(episode_id)
  `);
  await run('idx_episode_links_type', () => sql`
    CREATE INDEX IF NOT EXISTS idx_episode_links_type ON episode_links(link_type)
  `);

  console.log('\n[3/3] ALTER guests — linkedin_url');
  await run('linkedin_url TEXT', () => sql`
    ALTER TABLE guests ADD COLUMN IF NOT EXISTS linkedin_url TEXT
  `);

  // Vérification
  console.log('\n[VERIFY] post-migration state');
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='episodes'
      AND column_name IN ('article_html','chapters','duration_seconds','rss_description')
  `;
  const linksTable = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name='episode_links'
  `;
  const linkedin = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='guests' AND column_name='linkedin_url'
  `;

  console.log(`  episodes new cols : ${cols.map((c: any) => c.column_name).sort().join(', ')}`);
  console.log(`  episode_links table: ${linksTable.length ? 'EXISTS' : 'MISSING'}`);
  console.log(`  guests.linkedin_url: ${linkedin.length ? 'EXISTS' : 'MISSING'}`);

  if (cols.length !== 4 || linksTable.length !== 1 || linkedin.length !== 1) {
    console.error('\n❌ Migration incomplete');
    process.exit(1);
  }

  console.log('\n✅ Migration OK');
}

main().catch((e) => {
  console.error('[MIGRATION] FAIL', e);
  process.exit(1);
});
