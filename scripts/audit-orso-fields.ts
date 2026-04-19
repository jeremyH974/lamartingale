import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const tenants = ['lepanier', 'finscale', 'passionpatrimoine', 'combiencagagne'];
  for (const t of tenants) {
    const [r] = (await sql`
      SELECT
        COUNT(*)::int as total,
        COUNT(guest_from_title)::int as has_guest_from_title,
        COUNT(guest)::int as has_guest,
        COUNT(article_url)::int as has_article_url,
        COUNT(article_content)::int as has_article_content,
        COUNT(rss_description)::int as has_rss_desc,
        COUNT(rss_content_encoded)::int as has_rss_content,
        COALESCE(AVG(LENGTH(rss_description))::int, 0) as avg_rss_desc_len,
        COALESCE(AVG(LENGTH(rss_content_encoded))::int, 0) as avg_rss_content_len
      FROM episodes WHERE tenant_id = ${t}
    `) as any[];
    const [g] = (await sql`SELECT COUNT(*)::int as n FROM guests WHERE tenant_id = ${t}`) as any[];
    const [gl] = (await sql`SELECT COUNT(*)::int as n FROM guest_episodes WHERE tenant_id = ${t}`) as any[];
    const [l] = (await sql`SELECT COUNT(*)::int as n FROM episode_links WHERE tenant_id = ${t}`) as any[];
    console.log(`\n[${t}]`);
    console.log(`  Episodes: ${r.total}`);
    console.log(`  guest_from_title: ${r.has_guest_from_title} / guest: ${r.has_guest}`);
    console.log(`  article_url: ${r.has_article_url} / article_content: ${r.has_article_content}`);
    console.log(`  rss_description: ${r.has_rss_desc} (avg ${r.avg_rss_desc_len}c) / rss_content_encoded: ${r.has_rss_content} (avg ${r.avg_rss_content_len}c)`);
    const [e] = (await sql`SELECT COUNT(*)::int as n FROM episodes_enrichment WHERE tenant_id = ${t} AND embedding IS NOT NULL`) as any[];
    console.log(`  embeddings: ${e.n}`);
    console.log(`  guests table: ${g.n} / guest_episodes: ${gl.n} / episode_links: ${l.n}`);
  }
  // Sample title+guest_from_title for lepanier
  const sample = await sql`SELECT title, guest_from_title, substring(rss_description, 1, 200) as rss FROM episodes WHERE tenant_id='lepanier' ORDER BY published_at DESC LIMIT 3`;
  console.log('\n[SAMPLE lepanier]');
  console.log(sample);
}
main();
