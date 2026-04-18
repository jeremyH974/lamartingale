import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL!);
(async () => {
  const r = await sql`SELECT tenant_id, count(*)::int as c FROM episode_similarities GROUP BY tenant_id ORDER BY tenant_id` as any[];
  console.log('similarities per tenant:', r);
})();
