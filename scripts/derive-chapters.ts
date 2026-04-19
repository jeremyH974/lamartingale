// Copie rss_chapters_ts → chapters quand rss_chapters_ts est non-vide.
// Prioritise les chapitres horodatés RSS (fiables, issus directement du feed)
// aux chapitres possiblement extraits depuis la description (qualité médiocre).
// Usage : npx tsx scripts/derive-chapters.ts [--dry] [--tenant=gdiy,lepanier]
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);
const DRY = process.argv.includes('--dry');
const tenantArg = process.argv.find(a => a.startsWith('--tenant='))?.split('=')[1];
const TENANTS = tenantArg ? tenantArg.split(',') : ['gdiy', 'lepanier'];

(async () => {
  for (const tenant of TENANTS) {
    console.log(`\n=== ${tenant} ===`);
    const rows = await sql`
      SELECT id, episode_number, rss_chapters_ts, chapters
      FROM episodes
      WHERE tenant_id = ${tenant}
        AND rss_chapters_ts IS NOT NULL
        AND jsonb_array_length(rss_chapters_ts) > 0
    ` as any[];
    console.log(`  candidates: ${rows.length}`);

    let replaced = 0;
    let filled = 0;
    for (const r of rows) {
      const hadChapters = r.chapters && r.chapters.length > 0;
      if (DRY) {
        if (hadChapters) replaced++; else filled++;
        continue;
      }
      await sql`
        UPDATE episodes
        SET chapters = rss_chapters_ts
        WHERE id = ${r.id}
      `;
      if (hadChapters) replaced++; else filled++;
    }
    console.log(`  filled (chapters was empty): ${filled}`);
    console.log(`  replaced (chapters had other data): ${replaced}${DRY ? ' (DRY)' : ''}`);
  }
})();
