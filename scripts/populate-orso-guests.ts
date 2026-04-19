import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { HOSTS_NORMALIZED } from '../engine/db/cross-queries';

// ============================================================================
// Populate guests table for the 4 Orso Media podcasts.
//
// Source : episodes.guest_from_title (extrait par ingest-rss.ts depuis le titre).
// Pipeline (repris de populate-gdiy-guests.ts, sans bio car article_content=0) :
//   1. Normalise guest_from_title (strip "#NNN ", skip [REDIFF], hosts, tokens trop courts).
//   2. INSERT guests (tenant, name) ON CONFLICT DO NOTHING.
//   3. INSERT guest_episodes (tenant, guest_id, episode_id) ON CONFLICT DO NOTHING.
//   4. UPDATE guests.linkedin_url depuis episode_links (link_type='linkedin', pas stefani).
//   5. UPDATE guests.episodes_count.
//
// Usage :
//   npx tsx scripts/populate-orso-guests.ts --tenant lepanier [--dry]
//   npx tsx scripts/populate-orso-guests.ts --all [--dry]
// ============================================================================

const DRY = process.argv.includes('--dry');
const TENANTS_ARG = process.argv.indexOf('--tenant');
const TENANT_FROM_ARG = TENANTS_ARG >= 0 ? process.argv[TENANTS_ARG + 1] : null;
const ALL = process.argv.includes('--all');
const ORSO_TENANTS = ['lepanier', 'finscale', 'passionpatrimoine', 'combiencagagne'];
const TENANTS = TENANT_FROM_ARG ? [TENANT_FROM_ARG] : (ALL ? ORSO_TENANTS : []);
if (!TENANTS.length) {
  console.error('Usage: --tenant <id> ou --all');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL!);

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isHost(name: string): boolean {
  const n = stripAccents(name.toLowerCase()).trim();
  return HOSTS_NORMALIZED.some(h => n.includes(h));
}

function normalizeGuestName(raw: string | null): string | null {
  if (!raw) return null;
  let n = raw.trim();
  n = n.replace(/^#\s*\d+\s*[\-–—:]*\s*/, '').trim();
  if (n.startsWith('#')) return null;
  if (n.startsWith('[')) return null;
  if (n.length < 3) return null;
  if (!n.includes(' ') && !n.includes('-') && n.length < 6) return null;
  if (/^[a-zéèêà]/.test(n)) return null;
  if (isHost(n)) return null;
  return n;
}

async function runTenant(TENANT: string): Promise<void> {
  console.log(`\n========== ${TENANT.toUpperCase()} ==========`);

  // Step 1 : Collecte + normalisation
  const eps = await sql`
    SELECT id, episode_number, guest_from_title
    FROM episodes
    WHERE tenant_id = ${TENANT}
      AND guest_from_title IS NOT NULL
      AND (episode_type = 'full' OR episode_type IS NULL)
  ` as any[];

  const guestToEpIds = new Map<string, number[]>();
  let filtered = 0;
  for (const e of eps) {
    const name = normalizeGuestName(e.guest_from_title);
    if (!name) { filtered++; continue; }
    if (!guestToEpIds.has(name)) guestToEpIds.set(name, []);
    guestToEpIds.get(name)!.push(e.id);
  }
  console.log(`[1/5] ${eps.length} eps with guest_from_title → ${guestToEpIds.size} unique guests, ${filtered} filtered`);

  if (DRY) {
    console.log('  DRY mode — sample 10:');
    Array.from(guestToEpIds.entries()).slice(0, 10).forEach(([g, ids]) => {
      console.log(`    ${g}  (${ids.length} eps)`);
    });
    return;
  }

  // Step 2 : INSERT guests
  const names = Array.from(guestToEpIds.keys());
  const CHUNK = 100;
  let insertedGuests = 0;
  for (let i = 0; i < names.length; i += CHUNK) {
    const chunk = names.slice(i, i + CHUNK);
    const r = await sql`
      INSERT INTO guests (tenant_id, name, episodes_count)
      SELECT ${TENANT}, n, 0 FROM unnest(${chunk}::text[]) AS n
      ON CONFLICT (tenant_id, name) DO NOTHING
      RETURNING id
    ` as any[];
    insertedGuests += r.length;
  }
  console.log(`[2/5] Inserted ${insertedGuests} new guests`);

  // Step 3 : Récupère les IDs guests pour populate guest_episodes
  const guestIdRows = await sql`SELECT id, name FROM guests WHERE tenant_id = ${TENANT}` as any[];
  const nameToId = new Map<string, number>(guestIdRows.map((r: any) => [r.name, r.id]));

  // Build (guest_id, ep_id) pairs
  const gids: number[] = [];
  const eids: number[] = [];
  for (const [name, ids] of guestToEpIds.entries()) {
    const gid = nameToId.get(name);
    if (!gid) continue;
    for (const eid of ids) { gids.push(gid); eids.push(eid); }
  }

  let insertedGE = 0;
  const CHUNK2 = 500;
  for (let i = 0; i < gids.length; i += CHUNK2) {
    const gSlice = gids.slice(i, i + CHUNK2);
    const eSlice = eids.slice(i, i + CHUNK2);
    const r = await sql`
      INSERT INTO guest_episodes (tenant_id, guest_id, episode_id)
      SELECT ${TENANT}, g, e FROM unnest(${gSlice}::int[], ${eSlice}::int[]) AS x(g, e)
      ON CONFLICT (guest_id, episode_id) DO NOTHING
      RETURNING guest_id
    ` as any[];
    insertedGE += r.length;
  }
  console.log(`[3/5] Inserted ${insertedGE} guest_episodes`);

  // Step 4 : Enrich LinkedIn from episode_links
  // For each guest, find the first linkedin link in their episodes (not stefani).
  const linkedinRows = await sql`
    SELECT ge.guest_id, el.url, ROW_NUMBER() OVER (PARTITION BY ge.guest_id ORDER BY el.id) AS rn
    FROM guest_episodes ge
    JOIN episode_links el ON el.episode_id = ge.episode_id AND el.tenant_id = ge.tenant_id
    WHERE ge.tenant_id = ${TENANT}
      AND el.link_type = 'linkedin'
      AND el.url NOT LIKE '%/in/stefani%'
      AND el.url NOT LIKE '%/in/matthieu-stefani%'
  ` as any[];
  const guestToLinkedin = new Map<number, string>();
  for (const r of linkedinRows) {
    if (r.rn === '1' || r.rn === 1) guestToLinkedin.set(r.guest_id, r.url);
  }
  let updatedLI = 0;
  if (guestToLinkedin.size) {
    const gids2 = Array.from(guestToLinkedin.keys());
    const urls2 = Array.from(guestToLinkedin.values());
    const CHUNK3 = 200;
    for (let i = 0; i < gids2.length; i += CHUNK3) {
      const gS = gids2.slice(i, i + CHUNK3);
      const uS = urls2.slice(i, i + CHUNK3);
      const r = await sql`
        UPDATE guests g
        SET linkedin_url = x.url
        FROM unnest(${gS}::int[], ${uS}::text[]) AS x(id, url)
        WHERE g.id = x.id AND (g.linkedin_url IS NULL OR g.linkedin_url = '')
        RETURNING g.id
      ` as any[];
      updatedLI += r.length;
    }
  }
  console.log(`[4/5] Enriched ${updatedLI} guests with LinkedIn`);

  // Step 5 : episodes_count
  await sql`
    UPDATE guests g SET episodes_count = sub.n
    FROM (
      SELECT guest_id, COUNT(*)::int AS n
      FROM guest_episodes WHERE tenant_id = ${TENANT}
      GROUP BY guest_id
    ) sub
    WHERE g.id = sub.guest_id AND g.tenant_id = ${TENANT}
  `;
  const [final] = (await sql`SELECT COUNT(*)::int as guests, SUM(episodes_count)::int as total_eps FROM guests WHERE tenant_id = ${TENANT}`) as any[];
  console.log(`[5/5] Total : ${final.guests} guests, ${final.total_eps} total guest_episodes`);
}

async function main() {
  for (const t of TENANTS) await runTenant(t);
}
main().catch(e => { console.error(e); process.exit(1); });
