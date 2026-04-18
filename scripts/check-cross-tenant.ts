import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL!);

(async () => {
  const byTenant = await sql`SELECT tenant_id, count(*)::int as c FROM episodes GROUP BY tenant_id ORDER BY tenant_id` as any[];
  console.log('episodes per tenant:', byTenant);

  const meta = await sql`SELECT tenant_id, count(*)::int as c FROM podcast_metadata GROUP BY tenant_id` as any[];
  console.log('podcast_metadata:', meta);

  const r3 = await sql`SELECT min(episode_number) as lo, max(episode_number) as hi, count(DISTINCT episode_number)::int as uniq FROM episodes WHERE tenant_id='gdiy'` as any[];
  console.log('gdiy episode_number range:', r3[0]);

  // check no collision by (tenant_id, episode_number)
  const dupes = await sql`
    SELECT tenant_id, episode_number, count(*)::int as c
    FROM episodes WHERE episode_number IS NOT NULL
    GROUP BY tenant_id, episode_number
    HAVING count(*) > 1
    LIMIT 5
  ` as any[];
  console.log('duplicates (tenant_id, episode_number):', dupes.length);

  // cross-tenant isolation: no similarity pair across tenants
  const cross = await sql`
    SELECT count(*)::int as c
    FROM episode_similarities es
    JOIN episodes e1 ON e1.id = es.episode_id
    JOIN episodes e2 ON e2.id = es.similar_episode_id
    WHERE e1.tenant_id <> e2.tenant_id
  ` as any[];
  console.log('cross-tenant similarities:', cross[0]);

  // guests isolated
  const gPerTenant = await sql`SELECT tenant_id, count(*)::int as c FROM guests GROUP BY tenant_id ORDER BY tenant_id` as any[];
  console.log('guests per tenant:', gPerTenant);
})();
