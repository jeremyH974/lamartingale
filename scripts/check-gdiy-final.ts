import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL!);
(async () => {
  const [full] = await sql`SELECT count(*)::int as c FROM episodes WHERE tenant_id='gdiy' AND (episode_type='full' OR episode_type IS NULL)` as any[];
  const [bonus] = await sql`SELECT count(*)::int as c FROM episodes WHERE tenant_id='gdiy' AND episode_type='bonus'` as any[];
  const [trailer] = await sql`SELECT count(*)::int as c FROM episodes WHERE tenant_id='gdiy' AND episode_type='trailer'` as any[];
  const pill = await sql`SELECT pillar, count(*)::int as c FROM episodes WHERE tenant_id='gdiy' AND (episode_type='full' OR episode_type IS NULL) GROUP BY pillar ORDER BY c DESC LIMIT 20` as any[];
  const [thumb] = await sql`SELECT count(*)::int as c FROM episodes WHERE tenant_id='gdiy' AND (episode_type='full' OR episode_type IS NULL) AND episode_image_url IS NOT NULL` as any[];
  console.log(`full=${full.c} bonus=${bonus.c} trailer=${trailer.c}`);
  console.log(`episode_image_url non-null: ${thumb.c}/${full.c}`);
  console.log('pillar distribution:');
  for (const r of pill) console.log(`  ${(r.pillar||'<null>').padEnd(20)} ${r.c}`);
})();
