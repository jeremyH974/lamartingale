import dotenv from 'dotenv';
dotenv.config({ override: true });
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL!);
(async () => {
  const rows = await sql`
    SELECT e.tenant_id, e.episode_number, e.id, (ee.embedding IS NOT NULL) AS has_embed, e.title, e.guest
    FROM episodes e
    LEFT JOIN episodes_enrichment ee ON ee.episode_id = e.id AND ee.tenant_id = e.tenant_id
    WHERE (e.tenant_id, e.episode_number) IN (('lamartingale', 174), ('lepanier', 128), ('finscale', 107), ('gdiy', 266))
    ORDER BY e.tenant_id, e.episode_number`;
  console.log(JSON.stringify(rows, null, 2));
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
