/**
 * Migration backfill — Phase A.5.4 (2026-04-28).
 *
 * Backfill `episodes.editorial_type` pour les rows existantes en base à partir
 * du title RSS brut, via `classifyEditorialType()` (source de vérité unique
 * partagée avec ingest-rss.ts).
 *
 * IMPORTANT — ne pas confondre avec `episode_type` (colonne du même schema)
 * qui stocke `<itunes:episodeType>` (full|bonus|trailer). Les deux notions
 * cohabitent (orthogonales). Voir engine/util/classify-editorial-type.ts.
 *
 * Pré-requis : ce script suppose que la colonne `editorial_type` a déjà été
 * créée (ALTER TABLE + CREATE INDEX) avant exécution. Voir
 * engine/db/migrations/2026-04-28-editorial-type.sql.
 *
 * Modes :
 *   --dry  (default) : log distribution prévue + cross-tab episode_type ×
 *                      editorial_type + samples, ZERO écriture.
 *   --write          : applique l'UPDATE par batch (1000 ids), 1 batch par
 *                      type éditorial.
 *
 * Idempotent : WHERE editorial_type IS NULL OR editorial_type = 'unknown'
 *   → re-run safe (ne touchera pas les rows déjà classées).
 *
 * Validation post-execution :
 *   - SELECT tenant_id, editorial_type, COUNT(*) FROM episodes
 *     GROUP BY 1, 2 ORDER BY 1, 2;
 *   - Cross-tab episode_type × editorial_type pour validation séparation
 *     sémantique (ex. "trailer iTunes & full éditorial" doit être ≤ 2 sinon
 *     suspect).
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { classifyEditorialType, type EditorialType } from '../engine/util/classify-editorial-type';

const args = new Set(process.argv.slice(2));
const WRITE = args.has('--write');
const DRY = !WRITE; // default

function sqlClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return neon(url);
}

async function main() {
  const sql = sqlClient();
  const mode = DRY ? '--dry (preview only, ZERO write)' : '--write (will UPDATE rows)';
  console.log(`\n[migrate-editorial-type] mode = ${mode}`);
  console.log('━'.repeat(72));

  // 1) Vérification colonne existante
  const colCheck = (await sql`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'episodes' AND column_name = 'editorial_type'
  `) as any[];
  if (!colCheck.length) {
    console.error('\n[ABORT] La colonne episodes.editorial_type n\'existe pas.');
    console.error('  Exécute d\'abord engine/db/migrations/2026-04-28-editorial-type.sql');
    console.error('  (ALTER TABLE + CREATE INDEX) avant ce script.');
    process.exit(2);
  }
  console.log(`column editorial_type → ${colCheck[0].data_type} default=${colCheck[0].column_default}`);

  // 2) Compte des rows à classifier
  const todoRow = (await sql`
    SELECT COUNT(*)::int AS n
    FROM episodes
    WHERE editorial_type IS NULL OR editorial_type = 'unknown'
  `) as any[];
  const todo = todoRow[0]?.n ?? 0;
  const totalRow = (await sql`SELECT COUNT(*)::int AS n FROM episodes`) as any[];
  const total = totalRow[0]?.n ?? 0;
  console.log(`rows total = ${total}, à classifier = ${todo} (already-set = ${total - todo})`);
  if (todo === 0) {
    console.log('\n[OK] Rien à faire — tous les episodes ont déjà un editorial_type.');
    return;
  }

  // 3) Pull des rows à classifier (id + tenant_id + episode_type iTunes + title)
  console.log('\n→ pull titles…');
  const rows = (await sql`
    SELECT id, tenant_id, episode_type, title
    FROM episodes
    WHERE editorial_type IS NULL OR editorial_type = 'unknown'
    ORDER BY tenant_id, id
  `) as any[];
  console.log(`pulled ${rows.length} rows`);

  // 4) Classification en mémoire
  type Row = {
    id: number;
    tenant_id: string;
    episode_type: string | null;
    title: string | null;
    editorial_type: EditorialType;
  };
  const classified: Row[] = rows.map((r) => ({
    id: r.id,
    tenant_id: r.tenant_id,
    episode_type: r.episode_type ?? null,
    title: r.title,
    editorial_type: classifyEditorialType(r.title),
  }));

  // 5) Stats par tenant × editorial_type
  const byKey = new Map<string, { tenant: string; type: EditorialType; n: number }>();
  for (const r of classified) {
    const key = `${r.tenant_id}|${r.editorial_type}`;
    const cur = byKey.get(key) ?? { tenant: r.tenant_id, type: r.editorial_type, n: 0 };
    cur.n++;
    byKey.set(key, cur);
  }
  const sortedStats = [...byKey.values()].sort((a, b) =>
    a.tenant.localeCompare(b.tenant) || a.type.localeCompare(b.type),
  );
  console.log('\n┌─ Distribution prévue par tenant × editorial_type ─────────────');
  let curTenant = '';
  let tenantTotal = 0;
  for (const s of sortedStats) {
    if (s.tenant !== curTenant) {
      if (curTenant) console.log(`│  └─ total ${curTenant} = ${tenantTotal}`);
      console.log(`│  ${s.tenant}`);
      curTenant = s.tenant;
      tenantTotal = 0;
    }
    console.log(`│    ${s.type.padEnd(8)} ${String(s.n).padStart(5)}`);
    tenantTotal += s.n;
  }
  if (curTenant) console.log(`│  └─ total ${curTenant} = ${tenantTotal}`);
  console.log('└──────────────────────────────────────────────────────────────');

  // 6) Cross-tab episode_type (iTunes) × editorial_type — validation séparation
  const crossKey = new Map<string, number>();
  for (const r of classified) {
    const k = `${r.episode_type ?? '<null>'}|${r.editorial_type}`;
    crossKey.set(k, (crossKey.get(k) ?? 0) + 1);
  }
  console.log('\n┌─ Cross-tab episode_type (iTunes) × editorial_type ─');
  console.log('│  iTunes_type    × editorial_type  →   n');
  const sortedCross = [...crossKey.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [k, n] of sortedCross) {
    const [iTunes, ed] = k.split('|');
    console.log(`│  ${iTunes.padEnd(15)} × ${ed.padEnd(8)} → ${String(n).padStart(5)}`);
  }
  console.log('└────────────────────────────────────────────────────');

  // 7) Sample 5 rows par editorial_type
  console.log('\n┌─ Sample 5 titles par editorial_type (sanity check regex) ──');
  const byType = new Map<EditorialType, Row[]>();
  for (const r of classified) {
    const arr = byType.get(r.editorial_type) ?? [];
    if (arr.length < 5) arr.push(r);
    byType.set(r.editorial_type, arr);
  }
  for (const t of ['full', 'extract', 'teaser', 'rediff', 'bonus', 'hs', 'unknown'] as const) {
    const arr = byType.get(t) ?? [];
    const total = classified.filter((c) => c.editorial_type === t).length;
    console.log(`│  [${t}] (${arr.length} sample of ${total})`);
    for (const r of arr) {
      const titleSnip = (r.title ?? '<null>').slice(0, 80);
      console.log(`│    #${r.id} (${r.tenant_id}|iTunes=${r.episode_type ?? 'null'}) ${titleSnip}`);
    }
  }
  console.log('└────────────────────────────────────────────────────────────');

  // 8) Si --dry, on s'arrête là
  if (DRY) {
    console.log('\n[--dry] STOP. Aucune écriture. Pour exécuter : --write');
    return;
  }

  // 9) --write : exécution batch par editorial_type
  console.log('\n→ exécution UPDATE par editorial_type (idempotent via WHERE editorial_type unknown/null)…');
  let totalUpdated = 0;
  const grouped = new Map<EditorialType, number[]>();
  for (const r of classified) {
    const arr = grouped.get(r.editorial_type) ?? [];
    arr.push(r.id);
    grouped.set(r.editorial_type, arr);
  }
  for (const [type, ids] of grouped) {
    if (!ids.length) continue;
    const BATCH = 1000;
    for (let i = 0; i < ids.length; i += BATCH) {
      const slice = ids.slice(i, i + BATCH);
      const result = (await sql`
        UPDATE episodes SET editorial_type = ${type}
        WHERE id = ANY(${slice})
          AND (editorial_type IS NULL OR editorial_type = 'unknown')
      `) as any;
      const updated = (result as any).count ?? slice.length;
      totalUpdated += updated;
      console.log(`  ${type.padEnd(8)} batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(ids.length / BATCH)} → ${updated} rows`);
    }
  }
  console.log(`\n[OK] total rows updated = ${totalUpdated}`);

  // 10) Vérif post-write : re-query distribution
  console.log('\n→ vérification post-write (distribution finale)…');
  const finalStats = (await sql`
    SELECT tenant_id, editorial_type, COUNT(*)::int AS n
    FROM episodes
    GROUP BY tenant_id, editorial_type
    ORDER BY tenant_id, editorial_type
  `) as any[];
  console.log('┌─ Distribution finale en DB ──────────────────────────');
  for (const s of finalStats) {
    console.log(`│  ${s.tenant_id.padEnd(20)} ${s.editorial_type.padEnd(8)} ${String(s.n).padStart(5)}`);
  }
  console.log('└──────────────────────────────────────────────────────');
}

main().catch((e) => {
  console.error('\n[FATAL]', e);
  process.exit(1);
});
