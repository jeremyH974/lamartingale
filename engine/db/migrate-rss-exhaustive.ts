import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { getConfig } from '../config';

// Migration idempotente RSS exhaustive :
//  1. +12 colonnes `episodes` (season, episode_type, explicit, guid, audio_url,
//     audio_size_bytes, rss_content_encoded, episode_image_url,
//     guest_from_title, sponsors JSONB, rss_links JSONB, cross_refs JSONB,
//     publish_frequency_days)
//  2. Table `podcast_metadata` (channel-level RSS : author, image, categories,
//     owner, contacts, social_links, …) — 1 ligne par tenant.
//  3. Swap uniques mono-tenant → composites (tenant_id, X) :
//       episodes.episode_number → (tenant_id, episode_number)
//       guests.name             → (tenant_id, name)
//       taxonomy.pillar         → (tenant_id, pillar)
//       learning_paths.path_id  → (tenant_id, path_id)
//
// "Capturer maintenant, exploiter plus tard" — aucune colonne n'est NOT NULL
// hormis guid (qui sera backfillé côté scraper avant contrainte).
//
// Usage : npx tsx src/db/migrate-rss-exhaustive.ts

type ColDef = { name: string; ddl: string };

const EPISODE_COLS: ColDef[] = [
  { name: 'season',                ddl: 'INTEGER' },
  { name: 'episode_type',          ddl: "TEXT" },                    // full|trailer|bonus
  { name: 'explicit',              ddl: 'BOOLEAN' },
  { name: 'guid',                  ddl: 'TEXT' },                    // itunes GUID canonique
  { name: 'audio_url',             ddl: 'TEXT' },
  { name: 'audio_size_bytes',      ddl: 'BIGINT' },
  { name: 'rss_content_encoded',   ddl: 'TEXT' },                    // content:encoded brut
  { name: 'episode_image_url',     ddl: 'TEXT' },                    // itunes:image @ item
  { name: 'guest_from_title',      ddl: 'TEXT' },                    // parsé "#123 - X (Company)"
  { name: 'sponsors',              ddl: "JSONB DEFAULT '[]'::jsonb" },
  { name: 'rss_links',             ddl: "JSONB DEFAULT '[]'::jsonb" },
  { name: 'cross_refs',            ddl: "JSONB DEFAULT '[]'::jsonb" }, // mentions d'autres podcasts
  { name: 'publish_frequency_days', ddl: 'REAL' },                   // écart moyen entre pubDate
];

type UniqueSwap = {
  table: string;
  column: string;
  oldConstraint: string;
};

const UNIQUE_SWAPS: UniqueSwap[] = [
  { table: 'episodes',       column: 'episode_number', oldConstraint: 'episodes_episode_number_unique' },
  { table: 'guests',         column: 'name',           oldConstraint: 'guests_name_unique' },
  { table: 'taxonomy',       column: 'pillar',         oldConstraint: 'taxonomy_pillar_unique' },
  { table: 'learning_paths', column: 'path_id',        oldConstraint: 'learning_paths_path_id_unique' },
];

async function main() {
  const cfg = getConfig();
  const sql = neon(process.env.DATABASE_URL!);
  console.log(`[MIGRATE-RSS-EXHAUSTIVE] podcast=${cfg.id} tenant=${cfg.database.tenantId}`);

  // ---------------------------------------------------------------
  // 1. +12 colonnes `episodes`
  // ---------------------------------------------------------------
  console.log('\n[1/3] Adding 13 new columns on episodes…');
  for (const col of EPISODE_COLS) {
    await sql.query(
      `ALTER TABLE episodes ADD COLUMN IF NOT EXISTS ${col.name} ${col.ddl}`,
    );
    console.log(`  + episodes.${col.name.padEnd(24)} ${col.ddl}`);
  }

  // Index utiles pour recherche/jointure.
  await sql.query(`CREATE INDEX IF NOT EXISTS idx_episodes_guid         ON episodes (guid)`);
  await sql.query(`CREATE INDEX IF NOT EXISTS idx_episodes_tenant_guid  ON episodes (tenant_id, guid)`);
  await sql.query(`CREATE INDEX IF NOT EXISTS idx_episodes_season       ON episodes (tenant_id, season)`);

  // ---------------------------------------------------------------
  // 2. Table podcast_metadata (1 ligne / tenant)
  // ---------------------------------------------------------------
  console.log('\n[2/3] Creating podcast_metadata table…');
  await sql.query(`
    CREATE TABLE IF NOT EXISTS podcast_metadata (
      id                SERIAL PRIMARY KEY,
      tenant_id         TEXT NOT NULL UNIQUE,
      title             TEXT,
      subtitle          TEXT,
      description       TEXT,
      author            TEXT,
      owner_name        TEXT,
      owner_email       TEXT,
      managing_editor   TEXT,
      language          TEXT,
      copyright         TEXT,
      explicit          BOOLEAN,
      podcast_type      TEXT,
      image_url         TEXT,
      itunes_image_url  TEXT,
      link              TEXT,
      new_feed_url      TEXT,
      categories        JSONB DEFAULT '[]'::jsonb,
      keywords          TEXT[],
      social_links      JSONB DEFAULT '[]'::jsonb,
      contact_emails    TEXT[],
      last_build_date   TIMESTAMP,
      generator         TEXT,
      raw_channel_xml   TEXT,
      created_at        TIMESTAMP DEFAULT now(),
      updated_at        TIMESTAMP DEFAULT now()
    )
  `);
  console.log('  + podcast_metadata (PK id, UNIQUE tenant_id)');

  // ---------------------------------------------------------------
  // 3. Swap uniques mono-tenant → composites (tenant_id, X)
  // ---------------------------------------------------------------
  console.log('\n[3/3] Swapping unique constraints → composite (tenant_id, X)…');
  for (const s of UNIQUE_SWAPS) {
    const newConstraint = `uq_${s.table}_tenant_${s.column}`;

    // A. Drop ancienne contrainte si encore présente
    const existing = await sql.query(
      `SELECT conname
         FROM pg_constraint
        WHERE conrelid = $1::regclass
          AND contype  = 'u'
          AND conname  = $2`,
      [s.table, s.oldConstraint],
    ) as any[];

    if (existing.length > 0) {
      await sql.query(`ALTER TABLE ${s.table} DROP CONSTRAINT ${s.oldConstraint}`);
      console.log(`  - DROP  ${s.oldConstraint}`);
    } else {
      console.log(`  ~ skip  ${s.oldConstraint} (absent)`);
    }

    // B. Create composite (idempotent)
    const already = await sql.query(
      `SELECT conname
         FROM pg_constraint
        WHERE conrelid = $1::regclass
          AND conname  = $2`,
      [s.table, newConstraint],
    ) as any[];

    if (already.length === 0) {
      await sql.query(
        `ALTER TABLE ${s.table}
           ADD CONSTRAINT ${newConstraint}
           UNIQUE (tenant_id, ${s.column})`,
      );
      console.log(`  + ADD   ${newConstraint} UNIQUE(tenant_id, ${s.column})`);
    } else {
      console.log(`  ~ keep  ${newConstraint} (déjà en place)`);
    }
  }

  // ---------------------------------------------------------------
  // Sanity summary
  // ---------------------------------------------------------------
  console.log('\n[SUMMARY]');
  const [{ c: epCols }] = await sql.query(
    `SELECT count(*) as c FROM information_schema.columns WHERE table_name = 'episodes'`,
  ) as any;
  const [{ c: pmRows }] = await sql.query(`SELECT count(*) as c FROM podcast_metadata`) as any;
  console.log(`  episodes.columns        = ${epCols}`);
  console.log(`  podcast_metadata.rows   = ${pmRows}`);

  console.log('\n[MIGRATE-RSS-EXHAUSTIVE] done');
}

main().catch(e => { console.error('[MIGRATE-RSS-EXHAUSTIVE] FATAL', e); process.exit(1); });
