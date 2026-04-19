import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const r = await sql`SELECT tenant_id, COUNT(*)::int as n, ROUND(SUM(duration_seconds)::numeric/3600, 0)::int as hours FROM episodes GROUP BY tenant_id ORDER BY n DESC`;
  console.log(r);
  const tot = await sql`SELECT COUNT(*)::int as eps, ROUND(SUM(duration_seconds)::numeric/3600, 0)::int as hours FROM episodes`;
  console.log('TOTAL:', tot[0]);
}
main();
