import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL!);

(async () => {
  const rows = await sql`
    SELECT
      count(*)::int as total,
      count(guid)::int as guid,
      count(audio_url)::int as audio,
      count(episode_image_url)::int as img,
      count(season)::int as season,
      count(*) FILTER (WHERE jsonb_array_length(sponsors) > 0)::int as sponsors,
      count(*) FILTER (WHERE jsonb_array_length(rss_links) > 0)::int as links,
      count(*) FILTER (WHERE jsonb_array_length(cross_refs) > 0)::int as xrefs
    FROM episodes WHERE tenant_id = 'lamartingale'
  ` as any[];
  console.log('coverage:', rows[0]);

  const pm = await sql`SELECT title, author, owner_email, language, jsonb_array_length(categories) as ncat, array_length(keywords,1) as nkw FROM podcast_metadata WHERE tenant_id='lamartingale'` as any[];
  console.log('channel_metadata:', pm[0]);

  const sample = await sql`
    SELECT episode_number, title, duration_seconds, audio_url IS NOT NULL as has_audio,
           jsonb_array_length(sponsors) as n_sp, jsonb_array_length(rss_links) as n_lk, jsonb_array_length(cross_refs) as n_xref
    FROM episodes
    WHERE tenant_id = 'lamartingale' AND episode_number = 313
  ` as any[];
  console.log('sample #313:', sample[0]);
})();
