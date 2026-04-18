import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL!);

(async () => {
  const tax = await sql`SELECT pillar, name FROM taxonomy WHERE tenant_id='gdiy' ORDER BY pillar` as any[];
  console.log(`taxonomy (${tax.length} pillars):`);
  for (const t of tax) console.log(`  - ${t.pillar}: ${t.name}`);

  const byPillar = await sql`
    SELECT pillar, count(*)::int as c
    FROM episodes WHERE tenant_id='gdiy'
    GROUP BY pillar ORDER BY c DESC
  ` as any[];
  console.log(`\nepisodes per pillar:`);
  for (const r of byPillar) console.log(`  ${r.pillar.padEnd(26)} : ${r.c}`);

  const [unclassified] = await sql`SELECT count(*)::int as c FROM episodes WHERE tenant_id='gdiy' AND pillar='UNCLASSIFIED'` as any[];
  console.log(`\nunclassified remaining : ${unclassified.c}`);

  // LaMartingale untouched
  const lmPillars = await sql`SELECT pillar, count(*)::int as c FROM episodes WHERE tenant_id='lamartingale' GROUP BY pillar ORDER BY c DESC LIMIT 3` as any[];
  console.log(`\nLM top-3 pillars (should be unchanged):`);
  for (const r of lmPillars) console.log(`  ${r.pillar} : ${r.c}`);

  // similarities cross-tenant = 0 ?
  const [cross] = await sql`
    SELECT count(*)::int as c FROM episode_similarities es
    JOIN episodes e1 ON e1.id=es.episode_id
    JOIN episodes e2 ON e2.id=es.similar_episode_id
    WHERE e1.tenant_id <> e2.tenant_id
  ` as any[];
  console.log(`\ncross-tenant similarities : ${cross.c}`);
})();
