import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL!);
(async () => {
  const a = await sql`SELECT count(*)::int as c FROM episodes WHERE tenant_id='lamartingale' AND guest_bio IS NOT NULL AND guest_bio != ''`;
  const b = await sql`SELECT count(*)::int as c FROM guests WHERE tenant_id='lamartingale' AND bio IS NOT NULL AND bio != ''`;
  const match = await sql`SELECT count(DISTINCT e.episode_number)::int as c FROM episodes e JOIN guests g ON g.tenant_id=e.tenant_id AND g.name=e.guest WHERE e.tenant_id='lamartingale' AND COALESCE(e.guest_bio,'')!=COALESCE(g.bio,'') AND e.guest IS NOT NULL`;
  const sample = await sql`SELECT e.episode_number, e.guest, LEFT(COALESCE(e.guest_bio,''),60) as ep_bio, LEFT(COALESCE(g.bio,''),60) as g_bio FROM episodes e JOIN guests g ON g.tenant_id=e.tenant_id AND g.name=e.guest WHERE e.tenant_id='lamartingale' AND COALESCE(e.guest_bio,'') != COALESCE(g.bio,'') AND e.guest IS NOT NULL LIMIT 5`;
  console.log('LM episodes.guest_bio non-null:', a[0].c);
  console.log('LM guests.bio non-null:', b[0].c);
  console.log('LM eps avec divergence:', match[0].c);
  console.log('Sample:', sample);
})();
