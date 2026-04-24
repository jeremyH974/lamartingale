/**
 * Smoke-test post-sync rss_links → episode_links
 * ==============================================
 * Vérifie pour chaque tenant :
 *   - cross_podcast_ref total vs cible
 *   - bruit audiomeans.fr/politique
 *   - signal utile [3]  (sans audiomeans)
 *   - signal utile [3b] (filtre Phase C complet : sans audiomeans + sans spotify/apple show root)
 *   - breakdown 7 link_types × 6 tenants (matrice compacte)
 *   - flags qualité scrape-deep (tool anormalement bas)
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

const TARGETS: Record<string, number> = {
  lamartingale: 840,
  gdiy: 992,
  lepanier: 845,
  passionpatrimoine: 195,
  combiencagagne: 104,
  finscale: 4,
};
const TENANTS = Object.keys(TARGETS).sort();
const LINK_TYPES = ['resource', 'company', 'linkedin', 'episode_ref', 'cross_podcast_ref', 'social', 'tool'];

(async () => {
  console.log('\n═══ Smoke test global post-sync (6 tenants) ═══\n');

  // Cross analysis
  const crossRows: {
    tenant: string;
    total: number;
    audiomeans: number;
    useful: number;
    hubUseful: number;
    target: number;
    delta: number;
  }[] = [];

  for (const t of TENANTS) {
    const [total] = (await sql`
      SELECT count(*)::int AS c FROM episode_links
      WHERE tenant_id = ${t} AND link_type = 'cross_podcast_ref'
    `) as { c: number }[];
    const [audiomeans] = (await sql`
      SELECT count(*)::int AS c FROM episode_links
      WHERE tenant_id = ${t} AND link_type = 'cross_podcast_ref'
        AND url LIKE '%audiomeans.fr/politique%'
    `) as { c: number }[];
    const [useful] = (await sql`
      SELECT count(*)::int AS c FROM episode_links
      WHERE tenant_id = ${t} AND link_type = 'cross_podcast_ref'
        AND url NOT LIKE '%audiomeans.fr/politique%'
    `) as { c: number }[];
    const [hubUseful] = (await sql`
      SELECT count(*)::int AS c FROM episode_links
      WHERE tenant_id = ${t} AND link_type = 'cross_podcast_ref'
        AND url NOT LIKE '%audiomeans.fr/politique%'
        AND url !~ '(spotify\.com/show/[^/]+|apple\.com/.*/podcast/[^/]+/id[0-9]+)$'
    `) as { c: number }[];

    const target = TARGETS[t];
    crossRows.push({
      tenant: t,
      total: total.c,
      audiomeans: audiomeans.c,
      useful: useful.c,
      hubUseful: hubUseful.c,
      target,
      delta: total.c - target,
    });
  }

  console.log('cross_podcast_ref : total / audiomeans / utile / hub-utile[3b] / cible / delta');
  console.log('─'.repeat(92));
  for (const r of crossRows) {
    const marker = Math.abs(r.delta) <= Math.max(5, r.target * 0.02) ? '✓' : '⚠';
    console.log(
      `  ${r.tenant.padEnd(20)} ${String(r.total).padStart(5)} / ${String(r.audiomeans).padStart(5)} / ${String(r.useful).padStart(5)} / ${String(r.hubUseful).padStart(5)} / ${String(r.target).padStart(5)} / ${(r.delta >= 0 ? '+' : '') + String(r.delta).padStart(3)} ${marker}`
    );
  }

  // Breakdown 7 link_types × 6 tenants
  console.log('\nBreakdown link_types × tenants');
  console.log('─'.repeat(110));
  const breakdownRows = (await sql`
    SELECT tenant_id, link_type, count(*)::int AS c
    FROM episode_links
    WHERE tenant_id = ANY(${TENANTS}::text[])
    GROUP BY tenant_id, link_type
    ORDER BY tenant_id, link_type
  `) as { tenant_id: string; link_type: string; c: number }[];

  const matrix: Record<string, Record<string, number>> = {};
  for (const t of TENANTS) matrix[t] = {};
  const seenTypes = new Set<string>();
  for (const r of breakdownRows) {
    matrix[r.tenant_id][r.link_type] = r.c;
    seenTypes.add(r.link_type);
  }
  const orderedTypes = [
    ...LINK_TYPES.filter((t) => seenTypes.has(t)),
    ...[...seenTypes].filter((t) => !LINK_TYPES.includes(t)),
  ];

  const hdr = '  ' + 'tenant'.padEnd(20) + orderedTypes.map((t) => t.padStart(11)).join('');
  console.log(hdr);
  for (const t of TENANTS) {
    const row = '  ' + t.padEnd(20) + orderedTypes.map((lt) => String(matrix[t][lt] ?? 0).padStart(11)).join('');
    console.log(row);
  }

  // Anomalies
  const unexpected = orderedTypes.filter((t) => !LINK_TYPES.includes(t));
  const failed = crossRows.filter((r) => Math.abs(r.delta) > Math.max(5, r.target * 0.02));

  console.log('');
  if (unexpected.length > 0) console.log(`⚠ link_types inattendus : ${unexpected.join(', ')}`);
  else console.log(`✓ Seulement les 7 types PUSH attendus (pas d'audio/other parasite).`);

  if (failed.length === 0) console.log(`✓ Tous les tenants cochent la cible cross_podcast_ref à ±2%.`);
  else console.log(`⚠ ${failed.length} tenant(s) hors cible : ${failed.map((r) => r.tenant).join(', ')}`);

  // Flags qualité scrape-deep
  console.log('\nSignal tool (indicateur qualité scrape-deep per-tenant) :');
  for (const t of TENANTS) {
    const tools = matrix[t]['tool'] ?? 0;
    const flag = tools < 20 && t !== 'finscale' ? '  ⚠ scrape-deep non appliqué (hasArticles:false)' : '';
    console.log(`  ${t.padEnd(20)} tool=${String(tools).padStart(4)}${flag}`);
  }
  console.log('');
})();
