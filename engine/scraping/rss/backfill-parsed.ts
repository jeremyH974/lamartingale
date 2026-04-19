/**
 * Backfill — parse les rss_description / rss_content_encoded déjà en BDD
 * et remplit les colonnes rss_topic, rss_discover, etc.
 *
 * Usage :
 *   PODCAST_ID=lamartingale npx tsx src/rss/backfill-parsed.ts
 *   PODCAST_ID=gdiy         npx tsx src/rss/backfill-parsed.ts
 *
 * Idempotent : ré-écrase systématiquement (les parsers sont déterministes).
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { getConfig } from '@engine/config';
import { parseRssDescription } from './parse-description';

const sql = neon(process.env.DATABASE_URL!);
const cfg = getConfig();
const TENANT = cfg.database.tenantId;

async function main() {
  console.log(`[BACKFILL-PARSED] tenant=${TENANT} — start`);

  const rows = (await sql`
    SELECT id, episode_number, rss_description, rss_content_encoded
    FROM episodes
    WHERE tenant_id = ${TENANT}
      AND (rss_description IS NOT NULL OR rss_content_encoded IS NOT NULL)
    ORDER BY episode_number DESC
  `) as { id: number; episode_number: number | null; rss_description: string | null; rss_content_encoded: string | null }[];

  console.log(`  ${rows.length} episodes à parser`);

  const stats = {
    topic: 0, guestIntro: 0, discover: 0, references: 0,
    crossEpisodes: 0, promo: 0, chapters: 0, youtube: 0, crossPromo: 0,
  };

  let updated = 0;
  for (const row of rows) {
    const src = row.rss_content_encoded || row.rss_description;
    const parsed = parseRssDescription(src, { tenantId: TENANT });

    if (parsed.topic) stats.topic++;
    if (parsed.guestIntro) stats.guestIntro++;
    if (parsed.discover.length) stats.discover++;
    if (parsed.references.length) stats.references++;
    if (parsed.crossEpisodes.length) stats.crossEpisodes++;
    if (parsed.promo) stats.promo++;
    if (parsed.chapters.length) stats.chapters++;
    if (parsed.youtubeUrl) stats.youtube++;
    if (parsed.crossPromo) stats.crossPromo++;

    await sql`
      UPDATE episodes SET
        rss_topic          = ${parsed.topic},
        rss_guest_intro    = ${parsed.guestIntro},
        rss_discover       = ${JSON.stringify(parsed.discover)}::jsonb,
        rss_references     = ${JSON.stringify(parsed.references)}::jsonb,
        rss_cross_episodes = ${JSON.stringify(parsed.crossEpisodes)}::jsonb,
        rss_promo          = ${parsed.promo ? JSON.stringify(parsed.promo) : null}::jsonb,
        rss_chapters_ts    = ${JSON.stringify(parsed.chapters)}::jsonb,
        youtube_url        = ${parsed.youtubeUrl},
        cross_promo        = ${parsed.crossPromo}
      WHERE id = ${row.id}
    `;
    updated++;
  }

  const total = rows.length || 1;
  const pct = (n: number) => `${n}/${rows.length} (${Math.round((n / total) * 100)}%)`;

  console.log(`\n[BACKFILL-PARSED] done — updated ${updated}/${rows.length}`);
  console.log(`  topic            : ${pct(stats.topic)}`);
  console.log(`  guest_intro      : ${pct(stats.guestIntro)}`);
  console.log(`  discover         : ${pct(stats.discover)}`);
  console.log(`  references       : ${pct(stats.references)}`);
  console.log(`  cross_episodes   : ${pct(stats.crossEpisodes)}`);
  console.log(`  promo            : ${pct(stats.promo)}`);
  console.log(`  chapters_ts      : ${pct(stats.chapters)}`);
  console.log(`  youtube_url      : ${pct(stats.youtube)}`);
  console.log(`  cross_promo      : ${pct(stats.crossPromo)}`);
}

main().catch((e) => { console.error('[BACKFILL-PARSED] fatal', e); process.exit(1); });
