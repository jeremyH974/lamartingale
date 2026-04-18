import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL!);
(async () => {
  // Schema columns check
  const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='episodes' ORDER BY ordinal_position` as any[];
  const required = ['season','episode_type','explicit','guid','audio_url','audio_size_bytes','rss_content_encoded','episode_image_url','guest_from_title','sponsors','rss_links','cross_refs','publish_frequency_days','parent_episode_number'];
  const have = cols.map((c: any) => c.column_name);
  console.log('\n[episodes] cols check:');
  for (const c of required) console.log(`  ${have.includes(c) ? 'OK' : 'MISS'} : ${c}`);

  // podcast_metadata check
  const pmCols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='podcast_metadata' ORDER BY ordinal_position` as any[];
  console.log(`\n[podcast_metadata] ${pmCols.length ? 'exists, cols: '+pmCols.map((c:any)=>c.column_name).join(',') : 'MISSING'}`);

  // Data coverage — GDIY
  console.log('\n[GDIY coverage]');
  const [g] = await sql`
    SELECT 
      count(*)::int AS total,
      count(*) FILTER (WHERE audio_url IS NOT NULL)::int AS audio_url,
      count(*) FILTER (WHERE audio_size_bytes IS NOT NULL)::int AS audio_size,
      count(*) FILTER (WHERE episode_image_url IS NOT NULL)::int AS ep_img,
      count(*) FILTER (WHERE guid IS NOT NULL)::int AS guid,
      count(*) FILTER (WHERE rss_content_encoded IS NOT NULL)::int AS content_encoded,
      count(*) FILTER (WHERE guest_from_title IS NOT NULL)::int AS guest_from_title,
      count(*) FILTER (WHERE jsonb_array_length(COALESCE(sponsors,'[]'::jsonb)) > 0)::int AS with_sponsors,
      count(*) FILTER (WHERE jsonb_array_length(COALESCE(rss_links,'[]'::jsonb)) > 0)::int AS with_links,
      count(*) FILTER (WHERE jsonb_array_length(COALESCE(cross_refs,'[]'::jsonb)) > 0)::int AS with_crossrefs,
      count(*) FILTER (WHERE publish_frequency_days IS NOT NULL)::int AS with_freq,
      count(*) FILTER (WHERE season IS NOT NULL)::int AS with_season,
      count(*) FILTER (WHERE explicit IS NOT NULL)::int AS with_explicit
    FROM episodes WHERE tenant_id='gdiy'
  ` as any[];
  for (const [k,v] of Object.entries(g)) console.log(`  ${String(k).padEnd(20)} ${v}`);

  console.log('\n[LM coverage]');
  const [l] = await sql`
    SELECT 
      count(*)::int AS total,
      count(*) FILTER (WHERE audio_url IS NOT NULL)::int AS audio_url,
      count(*) FILTER (WHERE episode_image_url IS NOT NULL)::int AS ep_img,
      count(*) FILTER (WHERE guid IS NOT NULL)::int AS guid,
      count(*) FILTER (WHERE rss_content_encoded IS NOT NULL)::int AS content_encoded,
      count(*) FILTER (WHERE guest_from_title IS NOT NULL)::int AS guest_from_title,
      count(*) FILTER (WHERE jsonb_array_length(COALESCE(sponsors,'[]'::jsonb)) > 0)::int AS with_sponsors,
      count(*) FILTER (WHERE jsonb_array_length(COALESCE(rss_links,'[]'::jsonb)) > 0)::int AS with_links,
      count(*) FILTER (WHERE publish_frequency_days IS NOT NULL)::int AS with_freq
    FROM episodes WHERE tenant_id='lamartingale'
  ` as any[];
  for (const [k,v] of Object.entries(l)) console.log(`  ${String(k).padEnd(20)} ${v}`);

  const pm = await sql`SELECT * FROM podcast_metadata` as any[];
  console.log(`\n[podcast_metadata rows] ${pm.length}`);
  for (const r of pm) console.log(`  ${r.tenant_id}: title=${r.title} lang=${r.language} owner=${r.owner_name} contact=${r.contact_url} socials=${JSON.stringify(r.social_links||[]).slice(0,80)}`);
})();
