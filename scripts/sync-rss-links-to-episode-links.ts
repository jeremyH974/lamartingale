/**
 * Sync rss_links JSONB → episode_links (table relationnelle) — v3 (blacklist downgrade)
 * ======================================================================================
 *
 * Source  : episodes.rss_links (JSONB { url, label?, link_type? }[])
 *           peuplée par engine/scraping/ingest-rss.ts + scrape-rss.ts via
 *           extractLinks() de engine/scraping/rss/extractors.ts.
 *
 * Cible   : table episode_links (tenant_id, episode_id, url, label, link_type)
 *           unique (episode_id, url) → idempotence + reclassif via
 *           ON CONFLICT DO UPDATE ... WHERE IS DISTINCT FROM.
 *
 * Sémantique (v3) : le JSONB est la source de vérité, SAUF pour les link_types
 * où scrape-deep.ts est plus fin que rss/extractors.ts. Pour ces types
 * (episode_ref, tool, social), on protège la valeur existante contre un
 * downgrade accidentel via blacklist.
 *
 * Divergence classifieurs (documentée dans docs/DETTE.md) :
 *   - scrape-deep.ts   : per-tenant WEBSITE_HOST, détection fine tool/company/episode_ref
 *   - rss/extractors.ts : hardcodé /lamartingale\.io\/(?:episode|podcast)/ → bug non-LM
 *
 * Règles de filtrage link_type (Option C, validées 24/04/26) :
 *   - PUSH   : resource, linkedin, social, episode_ref, company, tool, cross_podcast_ref
 *   - DROP   : audio   (doublon avec episodes.audio_url)
 *   - DROP   : other   (non classifié, bruit — JSONB reste source complète)
 *
 * Blacklist downgrade (v3) : si old_type IN ('episode_ref', 'tool', 'social')
 * ET new_type <> old_type → SKIP (conservation). Les reclassifs qui passent
 * quand même : changement de label uniquement, ou old_type non-blacklisté.
 *
 * Pattern SQL :
 *   ON CONFLICT (episode_id, url) DO UPDATE
 *   SET link_type = EXCLUDED.link_type, label = EXCLUDED.label, tenant_id = EXCLUDED.tenant_id
 *   WHERE (episode_links.link_type IS DISTINCT FROM EXCLUDED.link_type
 *          AND episode_links.link_type NOT IN ('episode_ref', 'tool', 'social'))
 *      OR episode_links.label IS DISTINCT FROM EXCLUDED.label
 *
 * Usage :
 *   npx tsx scripts/sync-rss-links-to-episode-links.ts                    # dry-run tous tenants
 *   npx tsx scripts/sync-rss-links-to-episode-links.ts --write --tenant lamartingale
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

const PUSH_TYPES = ['resource', 'linkedin', 'social', 'episode_ref', 'company', 'tool', 'cross_podcast_ref'];
const DROP_TYPES = ['audio', 'other'];
// Post-Rail 1 (Option D, 24/04/26) : 'episode_ref' retiré de la blacklist
// parce que rss/extractors.ts applique maintenant les mêmes règles (host match
// + R2 non-racine + R3 pas de path utilitaire) que scrape-deep.ts, et même
// plus strictes (scrape-deep n'a pas R2/R3). Laisser episode_ref mutable
// permet au re-sync de propager les corrections de faux positifs identifiés
// sur LM (racines lamartingale.io/, /tous/ déjà correctes) et de convergere
// scrape-deep sur les futurs re-sync.
// Reste blacklisté : 'tool' (scrape-deep raffine depuis domain+UI-hint) et
// 'social' (extractContact + scrape-deep ont plus de contexte).
const BLACKLIST_DOWNGRADE = ['tool', 'social'];
const SAMPLE_THRESHOLD = 50;

// Cibles cross_podcast_ref attendues post-sync (basées extraction JSONB actuelle)
const CROSS_TARGETS: Record<string, number> = {
  lamartingale: 840,
  gdiy: 992,
  lepanier: 845,
  passionpatrimoine: 195,
  combiencagagne: 104,
  finscale: 4,
};

type ActionCat = 'INSERT' | 'UPDATE' | 'NO-OP' | 'SKIP-BLACKLIST';
type Row = {
  action: ActionCat;
  old_type: string | null;
  new_type: string;
  c: number;
  dropped_c?: number;
  total_src?: number;
  total_deduped?: number;
};

async function diagnose(tenant: string): Promise<{
  totalJsonb: number;
  insertRows: number;
  updateRows: number;
  noopRows: number;
  skipBlacklistRows: number;
  droppedRows: number;
  updatePairs: { old_type: string; new_type: string; c: number }[];
  skipPairs: { old_type: string; new_type: string; c: number }[];
  insertByNewType: { new_type: string; c: number }[];
  currentCross: number;
  crossDelta: { insert: number; updateTo: number; updateFrom: number };
  projectedCross: number;
}> {
  const diag = (await sql`
    WITH src AS (
      SELECT
        e.id AS episode_id,
        (link_item->>'url') AS url,
        (link_item->>'label') AS label,
        COALESCE(link_item->>'link_type', 'other') AS new_type
      FROM episodes e,
           LATERAL jsonb_array_elements(e.rss_links) AS link_item
      WHERE e.tenant_id = ${tenant}
        AND e.rss_links IS NOT NULL
        AND jsonb_array_length(e.rss_links) > 0
        AND (link_item->>'url') IS NOT NULL
        AND length(link_item->>'url') > 0
    ),
    deduped AS (
      SELECT DISTINCT ON (episode_id, url)
        episode_id, url, label, new_type
      FROM src
      ORDER BY episode_id, url, new_type
    ),
    pushed AS (
      SELECT * FROM deduped
      WHERE new_type = ANY(${PUSH_TYPES}::text[])
    ),
    dropped AS (
      SELECT count(*)::int AS c FROM deduped
      WHERE new_type = ANY(${DROP_TYPES}::text[])
         OR (new_type <> ALL(${PUSH_TYPES}::text[]) AND new_type <> ALL(${DROP_TYPES}::text[]))
    ),
    joined AS (
      SELECT p.episode_id, p.url, p.label AS new_label, p.new_type,
             el.link_type AS old_type, el.label AS old_label
      FROM pushed p
      LEFT JOIN episode_links el
        ON el.episode_id = p.episode_id AND el.url = p.url
    )
    SELECT
      CASE
        WHEN old_type IS NULL THEN 'INSERT'
        WHEN old_type IS DISTINCT FROM new_type
             AND old_type = ANY(${BLACKLIST_DOWNGRADE}::text[])
             AND old_label IS NOT DISTINCT FROM new_label THEN 'SKIP-BLACKLIST'
        WHEN old_type IS DISTINCT FROM new_type
             AND NOT (old_type = ANY(${BLACKLIST_DOWNGRADE}::text[])) THEN 'UPDATE'
        WHEN old_label IS DISTINCT FROM new_label THEN 'UPDATE'
        ELSE 'NO-OP'
      END AS action,
      old_type,
      new_type,
      count(*)::int AS c,
      (SELECT c FROM dropped) AS dropped_c,
      (SELECT count(*)::int FROM src) AS total_src,
      (SELECT count(*)::int FROM deduped) AS total_deduped
    FROM joined
    GROUP BY action, old_type, new_type, dropped_c, total_src, total_deduped
    ORDER BY action, c DESC
  `) as Row[];

  const insertRows = diag.filter((r) => r.action === 'INSERT').reduce((a, r) => a + r.c, 0);
  const updateRows = diag.filter((r) => r.action === 'UPDATE').reduce((a, r) => a + r.c, 0);
  const noopRows = diag.filter((r) => r.action === 'NO-OP').reduce((a, r) => a + r.c, 0);
  const skipBlacklistRows = diag.filter((r) => r.action === 'SKIP-BLACKLIST').reduce((a, r) => a + r.c, 0);
  const droppedRows = (diag[0] as any)?.dropped_c ?? 0;
  const totalJsonb = (diag[0] as any)?.total_src ?? 0;

  const updatePairs = diag
    .filter((r) => r.action === 'UPDATE' && r.old_type !== null && r.old_type !== r.new_type)
    .map((r) => ({ old_type: r.old_type ?? 'null', new_type: r.new_type, c: r.c }));
  const skipPairs = diag
    .filter((r) => r.action === 'SKIP-BLACKLIST')
    .map((r) => ({ old_type: r.old_type ?? 'null', new_type: r.new_type, c: r.c }));
  const insertByNewType = diag
    .filter((r) => r.action === 'INSERT')
    .map((r) => ({ new_type: r.new_type, c: r.c }));

  // Projection cross_podcast_ref post-sync
  const currentCrossRes = (await sql`
    SELECT count(*)::int AS c
    FROM episode_links
    WHERE tenant_id = ${tenant} AND link_type = 'cross_podcast_ref'
  `) as { c: number }[];
  const currentCross = currentCrossRes[0]?.c ?? 0;

  const crossInsert = diag
    .filter((r) => r.action === 'INSERT' && r.new_type === 'cross_podcast_ref')
    .reduce((a, r) => a + r.c, 0);
  const crossUpdateTo = diag
    .filter((r) => r.action === 'UPDATE' && r.new_type === 'cross_podcast_ref' && r.old_type !== 'cross_podcast_ref')
    .reduce((a, r) => a + r.c, 0);
  const crossUpdateFrom = diag
    .filter((r) => r.action === 'UPDATE' && r.old_type === 'cross_podcast_ref' && r.new_type !== 'cross_podcast_ref')
    .reduce((a, r) => a + r.c, 0);

  const projectedCross = currentCross + crossInsert + crossUpdateTo - crossUpdateFrom;

  return {
    totalJsonb,
    insertRows,
    updateRows,
    noopRows,
    skipBlacklistRows,
    droppedRows,
    updatePairs,
    skipPairs,
    insertByNewType,
    currentCross,
    crossDelta: { insert: crossInsert, updateTo: crossUpdateTo, updateFrom: crossUpdateFrom },
    projectedCross,
  };
}

async function fetchSamples(
  tenant: string,
  old_type: string,
  new_type: string,
  limit = 3
): Promise<{ url: string; label: string | null; episode_id: number }[]> {
  // On remonte jusqu'à 3 URLs représentatives pour une paire (old_type, new_type)
  return (await sql`
    WITH src AS (
      SELECT
        e.id AS episode_id,
        (link_item->>'url') AS url,
        (link_item->>'label') AS label,
        COALESCE(link_item->>'link_type', 'other') AS new_type
      FROM episodes e,
           LATERAL jsonb_array_elements(e.rss_links) AS link_item
      WHERE e.tenant_id = ${tenant}
        AND e.rss_links IS NOT NULL
        AND jsonb_array_length(e.rss_links) > 0
        AND (link_item->>'url') IS NOT NULL
    ),
    deduped AS (
      SELECT DISTINCT ON (episode_id, url)
        episode_id, url, label, new_type
      FROM src
      ORDER BY episode_id, url, new_type
    )
    SELECT d.episode_id, d.url, d.label
    FROM deduped d
    JOIN episode_links el ON el.episode_id = d.episode_id AND el.url = d.url
    WHERE d.new_type = ${new_type}
      AND el.link_type = ${old_type}
      AND el.tenant_id = ${tenant}
    LIMIT ${limit}
  `) as { url: string; label: string | null; episode_id: number }[];
}

async function executeWrite(tenant: string): Promise<{ processedEps: number; rowsWritten: number }> {
  const rows = (await sql`
    WITH src AS (
      SELECT
        e.id AS episode_id,
        (link_item->>'url') AS url,
        (link_item->>'label') AS label,
        COALESCE(link_item->>'link_type', 'other') AS new_type
      FROM episodes e,
           LATERAL jsonb_array_elements(e.rss_links) AS link_item
      WHERE e.tenant_id = ${tenant}
        AND e.rss_links IS NOT NULL
        AND jsonb_array_length(e.rss_links) > 0
        AND (link_item->>'url') IS NOT NULL
        AND length(link_item->>'url') > 0
    ),
    deduped AS (
      SELECT DISTINCT ON (episode_id, url)
        episode_id, url, label, new_type
      FROM src
      ORDER BY episode_id, url, new_type
    )
    SELECT episode_id, url, label, new_type
    FROM deduped
    WHERE new_type = ANY(${PUSH_TYPES}::text[])
  `) as { episode_id: number; url: string; label: string | null; new_type: string }[];

  const byEp = new Map<number, { url: string; label: string | null; new_type: string }[]>();
  for (const r of rows) {
    if (!byEp.has(r.episode_id)) byEp.set(r.episode_id, []);
    byEp.get(r.episode_id)!.push({ url: r.url, label: r.label, new_type: r.new_type });
  }

  let totalWritten = 0;
  for (const [epId, links] of byEp.entries()) {
    const urls = links.map((l) => l.url);
    const labels = links.map((l) => l.label);
    const types = links.map((l) => l.new_type);
    await sql`
      INSERT INTO episode_links (tenant_id, episode_id, url, label, link_type)
      SELECT ${tenant}, ${epId}::int, u, l, t
      FROM unnest(${urls}::text[], ${labels as any}::text[], ${types}::text[]) AS x(u, l, t)
      ON CONFLICT (episode_id, url) DO UPDATE
      SET link_type = EXCLUDED.link_type,
          label     = EXCLUDED.label,
          tenant_id = EXCLUDED.tenant_id
      WHERE (
        episode_links.link_type IS DISTINCT FROM EXCLUDED.link_type
          AND episode_links.link_type NOT IN ('episode_ref', 'tool', 'social')
      )
      OR episode_links.label IS DISTINCT FROM EXCLUDED.label
    `;
    totalWritten += links.length;
  }

  return { processedEps: byEp.size, rowsWritten: totalWritten };
}

function readFlag(args: string[], flag: string): string | null {
  const eqForm = args.find((a) => a.startsWith(`${flag}=`));
  if (eqForm) return eqForm.split('=').slice(1).join('=');
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')) return args[idx + 1];
  return null;
}

(async () => {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const all = args.includes('--all');
  const showSamples = !args.includes('--no-samples');

  const tenantSingle = readFlag(args, '--tenant');
  const tenantsList = readFlag(args, '--tenants');
  const excludeList = readFlag(args, '--exclude');

  // Validation flags mutuellement exclusifs
  const modeFlags = [tenantSingle, tenantsList, all ? 'ALL' : null].filter(Boolean);
  if (modeFlags.length === 0) {
    console.error('\n❌ Syntaxe explicite requise. Choisir exactement UN mode :');
    console.error('   --tenant <id>                      (un seul tenant, ex: lamartingale)');
    console.error('   --tenants id1,id2,id3              (liste explicite)');
    console.error('   --all [--exclude id1,id2]          (tous, avec exclusions optionnelles)');
    console.error('\n   Pas de mode implicite "tout ce qui reste".\n');
    process.exit(2);
  }
  if (modeFlags.length > 1) {
    console.error('\n❌ --tenant, --tenants et --all sont mutuellement exclusifs.\n');
    process.exit(2);
  }
  if (excludeList && !all) {
    console.error('\n❌ --exclude requiert --all.\n');
    process.exit(2);
  }

  const scopeDesc = tenantSingle ?? tenantsList ?? `ALL${excludeList ? ` − ${excludeList}` : ''}`;

  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`  SYNC rss_links (JSONB) → episode_links (v3 blacklist downgrade)`);
  console.log(`  mode=${write ? 'WRITE' : 'DRY-RUN'}  scope=${scopeDesc}`);
  console.log(`  PUSH      : ${PUSH_TYPES.join(', ')}`);
  console.log(`  DROP      : ${DROP_TYPES.join(', ')} (+ unknown types fallback)`);
  console.log(`  BLACKLIST : ${BLACKLIST_DOWNGRADE.join(', ')} (no downgrade)`);
  console.log(`═══════════════════════════════════════════════════════════════\n`);

  let tenants: string[];
  if (tenantSingle) {
    tenants = [tenantSingle];
  } else if (tenantsList) {
    tenants = tenantsList.split(',').map((s) => s.trim()).filter(Boolean);
  } else {
    const all = (await sql`SELECT DISTINCT tenant_id FROM episodes WHERE rss_links IS NOT NULL AND jsonb_array_length(rss_links) > 0 ORDER BY tenant_id`) as any[];
    const excluded = new Set(
      (excludeList ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    );
    tenants = all.map((r) => r.tenant_id).filter((t) => !excluded.has(t));
  }
  console.log(`  Tenants résolus : ${tenants.join(', ')}\n`);

  const t0 = Date.now();
  const summaries: {
    tenant: string;
    totalJsonb: number;
    insertRows: number;
    updateRows: number;
    noopRows: number;
    skipBlacklistRows: number;
    droppedRows: number;
    updatePairs: { old_type: string; new_type: string; c: number }[];
    skipPairs: { old_type: string; new_type: string; c: number }[];
    insertByNewType: { new_type: string; c: number }[];
    currentCross: number;
    projectedCross: number;
    target?: number;
    executedEps?: number;
    executedRows?: number;
    execMs?: number;
  }[] = [];

  for (const tenant of tenants) {
    console.log(`\n── ${tenant} — diagnostic pré-write ──`);
    const d = await diagnose(tenant);
    const projectedTotal =
      d.insertRows + d.updateRows + d.noopRows + d.skipBlacklistRows + d.droppedRows;
    console.log(`  Total JSONB (raw)       : ${d.totalJsonb}`);
    console.log(`  Projeté (post-dedup)    : ${projectedTotal}`);
    console.log(`    → INSERT         (nouveau)           : ${d.insertRows}`);
    console.log(`    → UPDATE         (reclassif passant) : ${d.updateRows}`);
    console.log(`    → NO-OP          (déjà OK)           : ${d.noopRows}`);
    console.log(`    → SKIP-BLACKLIST (conservation)      : ${d.skipBlacklistRows}`);
    console.log(`    → DROP           (audio/other/unk)   : ${d.droppedRows}`);

    if (d.updatePairs.length > 0) {
      console.log(`  ── Ventilation UPDATE (ancien → nouveau) ──`);
      for (const p of d.updatePairs) {
        console.log(`      ${p.old_type.padEnd(22)} → ${p.new_type.padEnd(22)}  ${String(p.c).padStart(5)}`);
        if (showSamples && p.c > SAMPLE_THRESHOLD) {
          const samples = await fetchSamples(tenant, p.old_type, p.new_type, 3);
          for (const s of samples) {
            const shortUrl = s.url.length > 80 ? s.url.slice(0, 77) + '...' : s.url;
            console.log(`         · ep#${s.episode_id} ${shortUrl}`);
          }
        }
      }
    }

    if (d.skipPairs.length > 0) {
      console.log(`  ── Ventilation SKIP-BLACKLIST (conservation old_type) ──`);
      for (const p of d.skipPairs) {
        console.log(`      ${p.old_type.padEnd(22)} ⤬ ${p.new_type.padEnd(22)}  ${String(p.c).padStart(5)}  (conservé)`);
        if (showSamples && p.c > SAMPLE_THRESHOLD) {
          const samples = await fetchSamples(tenant, p.old_type, p.new_type, 3);
          for (const s of samples) {
            const shortUrl = s.url.length > 80 ? s.url.slice(0, 77) + '...' : s.url;
            console.log(`         · ep#${s.episode_id} ${shortUrl}`);
          }
        }
      }
    }

    if (d.insertByNewType.length > 0) {
      console.log(`  ── Ventilation INSERT (nouveau link_type) ──`);
      for (const p of d.insertByNewType) {
        console.log(`      ${p.new_type.padEnd(22)} ${String(p.c).padStart(5)}`);
      }
    }

    // Vérif math cross_podcast_ref
    const target = CROSS_TARGETS[tenant];
    console.log(`  ── cross_podcast_ref : math projection ──`);
    console.log(`      episode_links actuel     : ${d.currentCross}`);
    console.log(`      + INSERT                 : ${d.crossDelta.insert}`);
    console.log(`      + UPDATE →cross          : ${d.crossDelta.updateTo}`);
    console.log(`      - UPDATE cross→          : ${d.crossDelta.updateFrom}`);
    console.log(`      ═ projeté post-sync      : ${d.projectedCross}`);
    if (target !== undefined) {
      const diff = d.projectedCross - target;
      const pct = target > 0 ? ((diff / target) * 100).toFixed(1) : 'n/a';
      const marker = Math.abs(diff) <= Math.max(5, target * 0.05) ? '✓' : '⚠';
      console.log(`      cible attendue           : ${target}  (delta ${diff >= 0 ? '+' : ''}${diff}, ${pct}%) ${marker}`);
    }

    const sum: (typeof summaries)[number] = { tenant, ...d, target };

    if (write) {
      const tw0 = Date.now();
      const { processedEps, rowsWritten } = await executeWrite(tenant);
      sum.execMs = Date.now() - tw0;
      sum.executedEps = processedEps;
      sum.executedRows = rowsWritten;
      console.log(
        `  [WRITE] ${rowsWritten} liens envoyés sur ${processedEps} episodes en ${(sum.execMs / 1000).toFixed(1)}s`
      );
    }

    summaries.push(sum);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`\n\n═══════════════════════════════════════════════════════════════`);
  console.log(`  SYNTHÈSE ${write ? 'POST-WRITE' : 'DRY-RUN v3'}`);
  console.log(`═══════════════════════════════════════════════════════════════`);
  console.log(
    `\n  ${'Tenant'.padEnd(20)} ${'INSERT'.padStart(7)} ${'UPDATE'.padStart(7)} ${'NO-OP'.padStart(7)} ${'SKIP'.padStart(7)} ${'DROP'.padStart(7)}`
  );
  let ti = 0, tu = 0, tn = 0, ts = 0, td = 0;
  for (const s of summaries) {
    ti += s.insertRows;
    tu += s.updateRows;
    tn += s.noopRows;
    ts += s.skipBlacklistRows;
    td += s.droppedRows;
    console.log(
      `  ${s.tenant.padEnd(20)} ${String(s.insertRows).padStart(7)} ${String(s.updateRows).padStart(7)} ${String(s.noopRows).padStart(7)} ${String(s.skipBlacklistRows).padStart(7)} ${String(s.droppedRows).padStart(7)}`
    );
  }
  console.log(`  ${'─'.repeat(60)}`);
  console.log(
    `  ${'TOTAL'.padEnd(20)} ${String(ti).padStart(7)} ${String(tu).padStart(7)} ${String(tn).padStart(7)} ${String(ts).padStart(7)} ${String(td).padStart(7)}`
  );

  // Tableau cross_podcast_ref vs cibles
  console.log(
    `\n  ${'Tenant'.padEnd(20)} ${'actuel'.padStart(7)} ${'projeté'.padStart(8)} ${'cible'.padStart(7)} ${'delta'.padStart(8)} ${'status'.padStart(7)}`
  );
  for (const s of summaries) {
    if (s.target === undefined) continue;
    const diff = s.projectedCross - s.target;
    const marker = Math.abs(diff) <= Math.max(5, s.target * 0.05) ? '✓' : '⚠';
    console.log(
      `  ${s.tenant.padEnd(20)} ${String(s.currentCross).padStart(7)} ${String(s.projectedCross).padStart(8)} ${String(s.target).padStart(7)} ${(diff >= 0 ? '+' : '') + String(diff).padStart(7)} ${marker.padStart(7)}`
    );
  }

  console.log(`\n  Durée totale : ${elapsed}s`);
  console.log(`\n═══════════════════════════════════════════════════════════════`);
  if (!write) console.log(`  DRY-RUN. Ajouter --write pour exécuter.`);
  else console.log(`  WRITE terminé.`);
  console.log(`═══════════════════════════════════════════════════════════════\n`);
})();
