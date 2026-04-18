import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL!);
(async () => {
  const byPillar = await sql`SELECT pillar, count(*)::int as c FROM episodes WHERE tenant_id='gdiy' AND episode_type='full' GROUP BY pillar ORDER BY c DESC` as any[];
  console.log('full episodes by pillar:');
  for (const r of byPillar) console.log(`  ${r.pillar.padEnd(22)}: ${r.c}`);

  const [embed] = await sql`
    SELECT count(*)::int as with_emb, (SELECT count(*)::int FROM episodes WHERE tenant_id='gdiy' AND episode_type='full') as total
    FROM episodes_enrichment en
    JOIN episodes e ON e.id=en.episode_id
    WHERE e.tenant_id='gdiy' AND e.episode_type='full' AND en.embedding IS NOT NULL
  ` as any[];
  console.log(`\nembeddings: ${embed.with_emb}/${embed.total} full episodes`);
})();
