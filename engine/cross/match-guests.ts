import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { TENANTS, TENANT_META, HOSTS_NORMALIZED, ensureUniverseInit } from '../db/cross-queries';

// ============================================================================
// Match & merge guests cross-tenant.
//
// 1. Pour chaque tenant, ramasse les apparitions d'invités (episodes.guest
//    ou guest_from_title en fallback) + métadonnées de guests.
// 2. Normalise (lowercase + remove diacritics + trim).
// 3. Matching exact sur la clé normalisée (Levenshtein pourra venir plus tard
//    si on observe de la dérive — en pratique, la BDD LM a déjà des bios
//    canonical, GDIY est en cours de denorm).
// 4. Merge bios (garde la plus longue), linkedin/instagram/website (premier
//    non-null), total_episodes, total_podcasts.
// 5. Flag is_host pour Matthieu Stefani / Amaury de Tonquédec.
// 6. Upsert sur `canonical_name` (UNIQUE).
//
// Bonus : denormalise les linkedin_url extraits via episode_links (link_type
// = 'linkedin') vers guests.linkedin_url quand cette dernière est NULL.
//
// Usage : npx tsx src/cross/match-guests.ts [--dry]
// ============================================================================

const DRY = process.argv.includes('--dry');

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function isHost(normName: string): boolean {
  return HOSTS_NORMALIZED.some(h => normName.includes(h));
}

type AppearanceRow = {
  tenant_id: string;
  episode_number: number | null;
  guest_raw: string;
  bio: string | null;
  linkedin_url: string | null;
};

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  await ensureUniverseInit();
  const tenants = [...TENANTS];
  if (!tenants.length) {
    console.error('[MATCH-GUESTS] aucun tenant trouvé dans podcast_metadata — abort');
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Étape 0 : denorm GDIY linkedin_url (episode_links → guests) si manquant
  // --------------------------------------------------------------------------
  console.log('[0/4] Denormalizing linkedin_url from episode_links → guests…');
  const denormStats = await sql`
    WITH candidates AS (
      SELECT DISTINCT ON (g.id)
        g.id AS guest_id,
        el.url AS linkedin_url
      FROM guests g
      JOIN guest_episodes ge ON ge.guest_id = g.id
      JOIN episode_links el ON el.episode_id = ge.episode_id
        AND el.tenant_id = g.tenant_id
      WHERE g.linkedin_url IS NULL
        AND el.link_type = 'linkedin'
        AND el.url IS NOT NULL
        AND el.url ILIKE '%linkedin.com%'
      ORDER BY g.id, el.id
    )
    UPDATE guests SET linkedin_url = c.linkedin_url
    FROM candidates c
    WHERE guests.id = c.guest_id
      ${DRY ? sql`AND false` : sql``}
    RETURNING guests.id
  ` as any[];
  console.log(`  denorm: ${denormStats.length} guests rows updated${DRY ? ' (DRY)' : ''}`);

  // --------------------------------------------------------------------------
  // Étape 1 : pull toutes les apparitions
  // --------------------------------------------------------------------------
  console.log('\n[1/4] Pulling guest appearances across tenants…');
  const rows = await sql`
    SELECT
      e.tenant_id,
      e.episode_number,
      COALESCE(NULLIF(e.guest, ''), e.guest_from_title) AS guest_raw,
      g.bio,
      g.linkedin_url
    FROM episodes e
    LEFT JOIN guests g ON g.tenant_id = e.tenant_id
      AND lower(trim(g.name)) = lower(trim(COALESCE(NULLIF(e.guest, ''), e.guest_from_title)))
    WHERE e.tenant_id = ANY(${tenants})
      AND COALESCE(NULLIF(e.guest, ''), e.guest_from_title) IS NOT NULL
      AND (e.episode_type = 'full' OR e.episode_type IS NULL)
  ` as AppearanceRow[];
  console.log(`  ${rows.length} appearances fetched`);

  // --------------------------------------------------------------------------
  // Étape 2 : group + merge
  // --------------------------------------------------------------------------
  console.log('\n[2/4] Grouping by canonical name & merging metadata…');

  type Acc = {
    displayName: string;
    bio: string | null;
    linkedin: string | null;
    byTenant: Map<string, Set<number>>;
    isHost: boolean;
  };

  const byCanon = new Map<string, Acc>();

  for (const r of rows) {
    const raw = (r.guest_raw || '').trim();
    if (!raw) continue;
    const canon = normalizeName(raw);
    if (canon.length < 3) continue;

    let entry = byCanon.get(canon);
    if (!entry) {
      entry = {
        displayName: raw,
        bio: null,
        linkedin: null,
        byTenant: new Map(),
        isHost: isHost(canon),
      };
      byCanon.set(canon, entry);
    }

    // Bio : garder la plus longue
    if (r.bio && typeof r.bio === 'string') {
      if (!entry.bio || r.bio.length > entry.bio.length) entry.bio = r.bio;
    }
    // LinkedIn : premier non-null
    if (r.linkedin_url && !entry.linkedin) entry.linkedin = r.linkedin_url;

    if (r.episode_number != null) {
      let set = entry.byTenant.get(r.tenant_id);
      if (!set) { set = new Set(); entry.byTenant.set(r.tenant_id, set); }
      set.add(r.episode_number);
    }
  }

  console.log(`  ${byCanon.size} unique canonical names`);
  const hostsCount = Array.from(byCanon.values()).filter(a => a.isHost).length;
  const crossCount = Array.from(byCanon.values()).filter(a => a.byTenant.size >= 2 && !a.isHost).length;
  console.log(`  hosts (exclus des stats guests) = ${hostsCount}`);
  console.log(`  cross-podcast (2+ tenants)      = ${crossCount}`);

  // --------------------------------------------------------------------------
  // Étape 3 : upsert
  // --------------------------------------------------------------------------
  console.log('\n[3/4] Upserting cross_podcast_guests…');
  if (DRY) {
    console.log('  DRY run — pas d\'upsert');
  } else {
    // Truncate + batch insert pour rester simple & reproductible.
    await sql`TRUNCATE cross_podcast_guests RESTART IDENTITY`;

    const chunks: Array<{
      canonical: string; display: string; bio: string | null; linkedin: string | null;
      tenantAppearances: Array<{ tenant_id: string; episode_numbers: number[] }>;
      totalEps: number; totalPods: number; isHost: boolean;
    }> = [];

    for (const [canon, acc] of byCanon.entries()) {
      const tenantAppearances = Array.from(acc.byTenant.entries()).map(([tid, set]) => ({
        tenant_id: tid,
        episode_numbers: Array.from(set).sort((a, b) => a - b),
      }));
      const totalEps = tenantAppearances.reduce((s, t) => s + t.episode_numbers.length, 0);
      chunks.push({
        canonical: canon,
        display: acc.displayName,
        bio: acc.bio,
        linkedin: acc.linkedin,
        tenantAppearances,
        totalEps,
        totalPods: tenantAppearances.length,
        isHost: acc.isHost,
      });
    }

    // Insert en batches de 10 (Neon HTTP est sensible au parallélisme)
    const CONCURRENCY = 10;
    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
      const batch = chunks.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(c => sql`
        INSERT INTO cross_podcast_guests (
          canonical_name, display_name, bio, linkedin_url,
          tenant_appearances, total_episodes, total_podcasts, is_host
        ) VALUES (
          ${c.canonical}, ${c.display}, ${c.bio}, ${c.linkedin},
          ${JSON.stringify(c.tenantAppearances)}::jsonb,
          ${c.totalEps}, ${c.totalPods}, ${c.isHost}
        )
        ON CONFLICT (canonical_name) DO UPDATE SET
          display_name       = EXCLUDED.display_name,
          bio                = EXCLUDED.bio,
          linkedin_url       = EXCLUDED.linkedin_url,
          tenant_appearances = EXCLUDED.tenant_appearances,
          total_episodes     = EXCLUDED.total_episodes,
          total_podcasts     = EXCLUDED.total_podcasts,
          is_host            = EXCLUDED.is_host,
          updated_at         = now()
      `));
    }
    console.log(`  upsert: ${chunks.length} rows`);
  }

  // --------------------------------------------------------------------------
  // Étape 4 : sanity
  // --------------------------------------------------------------------------
  console.log('\n[4/4] Sanity check…');
  const [{ c: totalGuests }] = await sql`SELECT count(*)::int AS c FROM cross_podcast_guests` as any[];
  const [{ c: crossRows }] = await sql`SELECT count(*)::int AS c FROM cross_podcast_guests WHERE total_podcasts >= 2 AND is_host = false` as any[];
  const [{ c: hostRows }] = await sql`SELECT count(*)::int AS c FROM cross_podcast_guests WHERE is_host = true` as any[];
  console.log(`  total            = ${totalGuests}`);
  console.log(`  cross-podcast    = ${crossRows}`);
  console.log(`  hosts flagged    = ${hostRows}`);

  const topCross = await sql`
    SELECT display_name, total_episodes, total_podcasts
    FROM cross_podcast_guests
    WHERE total_podcasts >= 2 AND is_host = false
    ORDER BY total_episodes DESC
    LIMIT 10
  ` as any[];
  console.log('\n  TOP 10 cross-podcast guests :');
  for (const g of topCross) {
    console.log(`    ${String(g.total_episodes).padStart(3)} eps / ${g.total_podcasts} pods — ${g.display_name}`);
  }

  console.log(`\n[MATCH-GUESTS] done (universe: ${tenants.map(t => TENANT_META[t].name).join(', ')})`);
}

main().catch(e => { console.error('[MATCH-GUESTS] FATAL', e); process.exit(1); });
