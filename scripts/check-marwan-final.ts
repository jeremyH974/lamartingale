import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL!);
(async () => {
  const rows = await sql`
    SELECT episode_number, parent_episode_number, episode_type, duration_seconds,
           substring(title,1,80) as title
    FROM episodes
    WHERE tenant_id='gdiy' AND (episode_number=535 OR parent_episode_number=535)
    ORDER BY episode_type NULLS FIRST
  ` as any[];
  console.log('#535 / parent=535:');
  for (const r of rows) console.log(`  type=${(r.episode_type||'null').padEnd(8)} #${r.episode_number} parent=${r.parent_episode_number} dur=${r.duration_seconds}s | ${r.title}`);
})();
