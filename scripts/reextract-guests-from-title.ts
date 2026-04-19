// Ré-extraction guest_from_title depuis les titres en BDD, sans reingest RSS.
// Met à jour episodes.guest_from_title (et guest si vide) pour un tenant donné.
// Usage: PODCAST_ID=combiencagagne npx tsx scripts/reextract-guests-from-title.ts [--dry]
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { extractGuestFromTitle } from '../engine/scraping/rss/extractors';

const DRY = process.argv.includes('--dry');
const TENANT = (process.env.PODCAST_ID || 'lamartingale').trim().toLowerCase();
const sql = neon(process.env.DATABASE_URL!);

(async () => {
  console.log(`[reextract-guests] tenant=${TENANT}${DRY ? ' DRY' : ''}`);
  const rows: any = await sql`SELECT id, title, guest, guest_from_title FROM episodes WHERE tenant_id = ${TENANT} ORDER BY id`;
  let updatedGft = 0, updatedGuest = 0, cleared = 0;
  for (const r of rows) {
    const g = extractGuestFromTitle(r.title || '');
    const newGft = g.name;
    const newGuest = r.guest && r.guest.trim() ? r.guest : newGft;
    const gftChanged = (r.guest_from_title || null) !== (newGft || null);
    const guestChanged = !r.guest && newGuest;
    if (!gftChanged && !guestChanged) continue;
    if (r.guest_from_title && !newGft) cleared++;
    if (DRY) {
      console.log(`  #${r.id} title="${(r.title||'').substring(0,60)}" old_gft="${r.guest_from_title||''}" new_gft="${newGft||''}"`);
      continue;
    }
    await sql`UPDATE episodes SET guest_from_title = ${newGft}, guest = COALESCE(NULLIF(guest,''), ${newGft}) WHERE id = ${r.id}`;
    if (gftChanged) updatedGft++;
    if (guestChanged) updatedGuest++;
  }
  console.log(`  rows=${rows.length} gft_updated=${updatedGft} guest_filled=${updatedGuest} cleared=${cleared}`);
})();
