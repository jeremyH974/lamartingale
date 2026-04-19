/**
 * Backfill guest_from_title pour GDIY + LM : re-execute extractGuestFromTitle(title).name
 * sur tous les episodes et UPDATE. Idempotent, rejoue sans effet.
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { extractGuestFromTitle } from '@engine/scraping/rss/extractors';
const sql = neon(process.env.DATABASE_URL!);

(async () => {
  for (const t of ['gdiy', 'lamartingale']) {
    const rows = await sql`
      SELECT id, title, guest_from_title FROM episodes WHERE tenant_id=${t}
    ` as any[];
    let updated = 0, filled = 0, cleared = 0;
    for (const r of rows) {
      const g = extractGuestFromTitle(r.title || '');
      const newVal = g.name;
      const oldVal = r.guest_from_title;
      if (newVal === oldVal) continue;
      await sql`UPDATE episodes SET guest_from_title=${newVal} WHERE id=${r.id}`;
      updated++;
      if (!oldVal && newVal) filled++;
      if (oldVal && !newVal) cleared++;
    }
    const [c] = await sql`
      SELECT count(*) FILTER (WHERE guest_from_title IS NOT NULL AND guest_from_title <> '')::int as filled,
             count(*)::int as total
      FROM episodes WHERE tenant_id=${t}
    ` as any[];
    console.log(`[${t}] ${rows.length} eps · updated=${updated} (+${filled} filled, -${cleared} cleared) · final: ${c.filled}/${c.total}`);
  }
})();
