import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL!);
(async () => {
  const r = await sql`
    SELECT episode_number, episode_type, duration_seconds, title
    FROM episodes WHERE tenant_id='gdiy' AND (title ILIKE '%Marwan%' OR guest_from_title ILIKE '%Marwan%')
    ORDER BY episode_number DESC
  ` as any[];
  console.log(`Marwan mentions: ${r.length}`);
  for (const x of r) console.log(`  #${x.episode_number} [${x.episode_type}] dur=${x.duration_seconds}s | ${x.title.slice(0,100)}`);

  // Check if any episode_number has multiple rows
  const dup = await sql`
    SELECT episode_number, count(*)::int as c FROM episodes WHERE tenant_id='gdiy'
    GROUP BY episode_number HAVING count(*) > 1
  ` as any[];
  console.log(`\ncolliding episode_numbers: ${dup.length}`);
})();
