import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL!);
(async () => {
  const rows = await sql`SELECT tenant_id, count(*)::int as c FROM quiz_questions GROUP BY tenant_id ORDER BY c DESC` as any[];
  console.log('quiz_questions by tenant:');
  for (const r of rows) console.log(`  ${r.tenant_id||'<null>'} : ${r.c}`);
  const bad = await sql`SELECT episode_id, question, pillar, tenant_id FROM quiz_questions WHERE tenant_id='gdiy' LIMIT 3` as any[];
  if (bad.length) {
    console.log('\nSample gdiy quiz rows:');
    for (const b of bad) console.log(`  ep#${b.episode_id} [${b.pillar}] ${b.question?.slice(0,80)}`);
  }
})();
