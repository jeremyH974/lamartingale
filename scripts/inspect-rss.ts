import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { parseRssDescription } from '@engine/scraping/rss/parse-description';

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const epNum = parseInt(process.argv[2] || '313', 10);
  const tenant = process.env.PODCAST_ID || 'lamartingale';
  const rows = await sql`
    SELECT episode_number, title, rss_description, rss_content_encoded,
           rss_topic, rss_guest_intro, rss_discover, rss_chapters_ts
    FROM episodes
    WHERE tenant_id = ${tenant} AND episode_number = ${epNum}
    LIMIT 1
  `;
  if (!rows.length) { console.log('No episode'); return; }
  const row = rows[0] as any;
  const src = row.rss_content_encoded || row.rss_description || '';
  console.log(`=== Ep #${row.episode_number} — ${row.title}`);
  console.log(`rss_description length: ${(row.rss_description || '').length}`);
  console.log(`rss_content_encoded length: ${(row.rss_content_encoded || '').length}`);
  console.log('\n--- RAW SOURCE (first 3000) ---');
  console.log(src.substring(0, 3000));
  console.log('\n--- PARSED (live) ---');
  console.log(JSON.stringify(parseRssDescription(src), null, 2).substring(0, 2000));
  console.log('\n--- DB STORED ---');
  console.log('topic:', row.rss_topic);
  console.log('guest_intro:', row.rss_guest_intro);
  console.log('discover:', JSON.stringify(row.rss_discover));
  console.log('chapters_ts:', JSON.stringify(row.rss_chapters_ts).substring(0, 300));
}

main().catch(console.error);
