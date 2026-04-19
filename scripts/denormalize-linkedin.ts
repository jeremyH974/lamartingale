import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { getConfig } from '../src/config';

// ============================================================================
// Denormalize LinkedIn URLs from episode_links → guests.linkedin_url
// ----------------------------------------------------------------------------
// Pour chaque épisode avec un `guest` non vide, cherche le premier lien LinkedIn
// NON-hôte (Matthieu Stefani pour LM/GDIY) et UPSERT dans guests(tenant_id, name,
// linkedin_url). N'écrase pas un linkedin_url existant.
//
// Usage : PODCAST_ID=<id> npx tsx scripts/denormalize-linkedin.ts [--dry]
// ============================================================================

const DRY = process.argv.includes('--dry');

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const cfg = getConfig();
  const TENANT = cfg.database.tenantId;
  const HOST = (cfg.host || '').toLowerCase();

  console.log(`[denorm-linkedin] tenant=${TENANT} host="${cfg.host}" dry=${DRY}`);

  // 1. Stats avant
  const before = await sql`
    SELECT
      (SELECT count(*)::int FROM episode_links WHERE tenant_id = ${TENANT} AND link_type='linkedin') AS links_total,
      (SELECT count(*)::int FROM guests WHERE tenant_id = ${TENANT}) AS guests_total,
      (SELECT count(*)::int FROM guests WHERE tenant_id = ${TENANT} AND linkedin_url IS NOT NULL) AS guests_with_li
  ` as any[];
  console.log('[before]', before[0]);

  if (!before[0].links_total) {
    console.log('[denorm-linkedin] aucun lien LinkedIn dans episode_links pour ce tenant — rien à faire');
    return;
  }

  // 2. Récupère un LinkedIn par épisode (premier non-host)
  const rows = await sql`
    WITH ranked AS (
      SELECT
        e.episode_number,
        e.guest,
        el.url,
        el.label,
        ROW_NUMBER() OVER (PARTITION BY e.id ORDER BY el.id) AS rn
      FROM episodes e
      INNER JOIN episode_links el ON el.episode_id = e.id
      WHERE e.tenant_id = ${TENANT}
        AND el.tenant_id = ${TENANT}
        AND el.link_type = 'linkedin'
        AND e.guest IS NOT NULL AND e.guest != ''
        AND lower(e.guest) NOT LIKE ${'%' + HOST + '%'}
        AND lower(COALESCE(el.label, '')) NOT LIKE ${'%' + HOST + '%'}
        AND el.url NOT LIKE ${'%' + HOST.split(' ').join('-') + '%'}
    )
    SELECT episode_number, guest, url, label
    FROM ranked WHERE rn = 1
    ORDER BY episode_number DESC
  ` as any[];

  console.log(`[denorm-linkedin] ${rows.length} épisodes avec un LinkedIn exploitable`);
  if (rows.length) console.log('[sample]', rows.slice(0, 3));

  // 3. Agrège par nom d'invité (le premier URL rencontré gagne)
  const byGuest = new Map<string, { url: string; sample: string }>();
  for (const r of rows) {
    const name = r.guest.trim();
    if (!name) continue;
    if (!byGuest.has(name)) byGuest.set(name, { url: r.url, sample: r.label || r.url });
  }
  console.log(`[denorm-linkedin] ${byGuest.size} invités uniques mappés`);

  if (DRY) {
    console.log('[dry] aperçu :');
    let i = 0;
    for (const [name, v] of byGuest) {
      if (++i > 10) break;
      console.log(`  - ${name} → ${v.url}`);
    }
    return;
  }

  // 4. UPSERT
  let inserted = 0, updated = 0, skipped = 0;
  for (const [name, v] of byGuest) {
    // Check existing
    const existing = await sql`
      SELECT id, linkedin_url FROM guests WHERE tenant_id = ${TENANT} AND name = ${name} LIMIT 1
    ` as any[];
    if (existing.length) {
      if (existing[0].linkedin_url) { skipped++; continue; }
      await sql`UPDATE guests SET linkedin_url = ${v.url} WHERE id = ${existing[0].id}`;
      updated++;
    } else {
      await sql`
        INSERT INTO guests (tenant_id, name, linkedin_url, bio)
        VALUES (${TENANT}, ${name}, ${v.url}, NULL)
      `;
      inserted++;
    }
  }
  console.log(`[denorm-linkedin] inserted=${inserted} updated=${updated} skipped=${skipped}`);

  // 5. Stats après
  const after = await sql`
    SELECT
      (SELECT count(*)::int FROM guests WHERE tenant_id = ${TENANT}) AS guests_total,
      (SELECT count(*)::int FROM guests WHERE tenant_id = ${TENANT} AND linkedin_url IS NOT NULL) AS guests_with_li
  ` as any[];
  console.log('[after]', after[0]);
}

main().catch(e => { console.error(e); process.exit(1); });
