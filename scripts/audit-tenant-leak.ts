import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL!);

(async () => {
  const byType = await sql`SELECT tenant_id, episode_type, count(*)::int as c FROM episodes GROUP BY tenant_id, episode_type ORDER BY tenant_id, c DESC`;
  console.log('episode_type breakdown:', byType);
  const lmExtrait = await sql`SELECT episode_number, title, episode_type, pillar FROM episodes WHERE tenant_id='lamartingale' AND title ILIKE '%EXTRAIT%' LIMIT 10`;
  console.log('LM with EXTRAIT:', lmExtrait);
  const gdiyNullType = await sql`SELECT episode_number, title FROM episodes WHERE tenant_id='gdiy' AND episode_type IS NULL LIMIT 10`;
  console.log('GDIY with NULL type:', gdiyNullType);
  const lmCount = await sql`SELECT count(*)::int as c FROM episodes WHERE tenant_id='lamartingale' AND (episode_type='full' OR episode_type IS NULL)`;
  console.log('LM full count:', lmCount);
  const gdiyPillars = await sql`SELECT pillar, count(*)::int as c FROM episodes WHERE tenant_id='lamartingale' GROUP BY pillar ORDER BY c DESC LIMIT 25`;
  console.log('LM pillars:', gdiyPillars);
})();
