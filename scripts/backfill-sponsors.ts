/**
 * Backfill sponsors pour GDIY + LM : re-extraire depuis rss_content_encoded
 * (ou rss_description en fallback).
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { extractSponsors } from '@engine/scraping/rss/extractors';
const sql = neon(process.env.DATABASE_URL!);

(async () => {
  for (const t of ['gdiy', 'lamartingale']) {
    const rows = await sql`
      SELECT id, COALESCE(rss_content_encoded, rss_description) as desc
      FROM episodes WHERE tenant_id=${t}
    ` as any[];
    let updated = 0, addedCount = 0;
    for (const r of rows) {
      if (!r.desc) continue;
      const sponsors = extractSponsors(r.desc);
      await sql`UPDATE episodes SET sponsors=${JSON.stringify(sponsors)}::jsonb WHERE id=${r.id}`;
      if (sponsors.length) { updated++; addedCount += sponsors.length; }
    }
    const [c] = await sql`
      SELECT count(*) FILTER (WHERE jsonb_array_length(COALESCE(sponsors,'[]'::jsonb)) > 0)::int as with_s,
             count(*)::int as total
      FROM episodes WHERE tenant_id=${t}
    ` as any[];
    const top = await sql`
      SELECT lower(TRIM(s->>'name')) as name, count(*)::int as c
      FROM episodes, jsonb_array_elements(COALESCE(sponsors,'[]'::jsonb)) s
      WHERE tenant_id=${t}
      GROUP BY lower(TRIM(s->>'name')) ORDER BY c DESC LIMIT 10
    ` as any[];
    console.log(`\n[${t}] ${c.with_s}/${c.total} eps avec sponsors (${addedCount} mentions)`);
    console.log(`  top: ${top.map((r: any) => `${r.name} x${r.c}`).join(', ')}`);
  }
})();
