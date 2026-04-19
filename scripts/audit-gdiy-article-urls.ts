import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

(async () => {
  const sql = neon(process.env.DATABASE_URL!);
  const TENANT = 'gdiy';

  const total: any = await sql`SELECT COUNT(*)::int AS n FROM episodes WHERE tenant_id = ${TENANT}`;
  const typed: any = await sql`SELECT episode_type, COUNT(*)::int AS n FROM episodes WHERE tenant_id = ${TENANT} GROUP BY episode_type ORDER BY n DESC`;
  const urls: any = await sql`
    SELECT
      COUNT(*) FILTER (WHERE article_url IS NOT NULL AND article_url <> '')::int AS with_url,
      COUNT(*) FILTER (WHERE article_url ILIKE '%gdiy.fr%')::int AS gdiy_fr,
      COUNT(*) FILTER (WHERE article_content IS NOT NULL AND length(article_content) > 200)::int AS with_content
    FROM episodes WHERE tenant_id = ${TENANT} AND (episode_type='full' OR episode_type IS NULL)
  `;
  const sample: any = await sql`
    SELECT id, episode_number, slug, article_url, title
    FROM episodes WHERE tenant_id = ${TENANT} AND (episode_type='full' OR episode_type IS NULL)
    ORDER BY episode_number DESC NULLS LAST LIMIT 8
  `;

  console.log('GDIY audit');
  console.log(' total:', total[0].n);
  console.log(' by type:', typed);
  console.log(' urls/content:', urls[0]);
  console.log(' sample recent:');
  for (const r of sample) {
    console.log(`  #${r.episode_number ?? '?'} | slug=${r.slug || 'NULL'} | url=${(r.article_url || 'NULL').substring(0, 70)}`);
  }
})();
