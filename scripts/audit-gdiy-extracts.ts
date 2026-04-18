import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL!);
(async () => {
  // 1. [EXTRAIT] / [HORS-SERIE] markers in title
  const marked = await sql`
    SELECT episode_number, title, episode_type, duration_seconds
    FROM episodes WHERE tenant_id='gdiy'
      AND (title ILIKE '%[EXTRAIT]%' OR title ILIKE '%[HORS-SÉRIE]%' OR title ILIKE '%[HORS-SERIE]%' OR title ILIKE '%[BONUS]%')
    ORDER BY episode_number DESC LIMIT 10
  ` as any[];
  const [{ c: markedCount }] = await sql`
    SELECT count(*)::int as c FROM episodes WHERE tenant_id='gdiy'
      AND (title ILIKE '%[EXTRAIT]%' OR title ILIKE '%[HORS-SÉRIE]%' OR title ILIKE '%[HORS-SERIE]%' OR title ILIKE '%[BONUS]%')
  ` as any[];
  console.log(`titles with [EXTRAIT]/[HORS-SERIE]/[BONUS] : ${markedCount}`);
  for (const r of marked.slice(0,5)) console.log(`  #${r.episode_number} type=${r.episode_type} dur=${r.duration_seconds}s | ${r.title.slice(0,80)}`);

  // 2. Distribution episode_type
  const types = await sql`
    SELECT COALESCE(episode_type,'<null>') as t, count(*)::int as c
    FROM episodes WHERE tenant_id='gdiy' GROUP BY t ORDER BY c DESC
  ` as any[];
  console.log('\nepisode_type distribution (gdiy):');
  for (const r of types) console.log(`  ${r.t.padEnd(10)} : ${r.c}`);

  // 3. Duration buckets
  const dur = await sql`
    SELECT
      CASE
        WHEN duration_seconds IS NULL THEN 'unknown'
        WHEN duration_seconds < 1200 THEN '<20min'
        WHEN duration_seconds < 3600 THEN '20-60min'
        WHEN duration_seconds < 7200 THEN '1-2h'
        ELSE '>2h'
      END as bucket,
      count(*)::int as c
    FROM episodes WHERE tenant_id='gdiy'
    GROUP BY bucket ORDER BY c DESC
  ` as any[];
  console.log('\nduration distribution (gdiy):');
  for (const r of dur) console.log(`  ${r.bucket.padEnd(10)} : ${r.c}`);

  // 4. Max + min episode_number
  const [{ mx, mn, cnt }] = await sql`
    SELECT max(episode_number) as mx, min(episode_number) as mn, count(*)::int as cnt
    FROM episodes WHERE tenant_id='gdiy'
  ` as any[];
  console.log(`\nepisode_number range: ${mn} .. ${mx}  (count=${cnt})`);

  // 5. Schema cols available
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name='episodes' ORDER BY ordinal_position
  ` as any[];
  const colNames = cols.map((c: any) => c.column_name);
  console.log(`\navailable cols: ${colNames.join(', ')}`);
  console.log(`has episode_type: ${colNames.includes('episode_type')}`);
  console.log(`has parent_episode_number: ${colNames.includes('parent_episode_number')}`);
})();
