import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

(async () => {
  const r = (await sql`
    SELECT
      (SELECT count(*)::int FROM episodes WHERE tenant_id='gdiy') AS total_eps,
      (SELECT count(*)::int FROM episodes WHERE tenant_id='gdiy' AND (episode_type='full' OR episode_type IS NULL)) AS full_eps,
      (SELECT count(*)::int FROM episodes WHERE tenant_id='gdiy' AND article_content IS NOT NULL AND length(article_content) > 200) AS with_content,
      (SELECT count(*)::int FROM episodes WHERE tenant_id='gdiy' AND article_url IS NOT NULL AND article_url <> '') AS with_url,
      (SELECT count(*)::int FROM episodes WHERE tenant_id='gdiy' AND jsonb_array_length(chapters) > 0) AS with_chapters,
      (SELECT count(*)::int FROM episode_links el JOIN episodes e ON el.episode_id=e.id WHERE e.tenant_id='gdiy') AS links,
      (SELECT count(*)::int FROM episode_similarities WHERE tenant_id='gdiy') AS sims,
      (SELECT count(*)::int FROM episodes_enrichment en JOIN episodes e ON en.episode_id=e.id WHERE e.tenant_id='gdiy' AND en.embedding IS NOT NULL) AS with_emb,
      (SELECT count(*)::int FROM guests WHERE tenant_id='gdiy' AND linkedin_url IS NOT NULL AND linkedin_url <> '') AS guests_linkedin,
      (SELECT count(*)::int FROM quiz_questions WHERE tenant_id='gdiy') AS quiz_qs
  `) as any[];
  console.log(JSON.stringify(r[0], null, 2));

  const lm = (await sql`
    SELECT
      (SELECT count(*)::int FROM episodes WHERE tenant_id='lamartingale') AS total_eps,
      (SELECT count(*)::int FROM episodes WHERE tenant_id='lamartingale' AND article_content IS NOT NULL AND length(article_content) > 200) AS with_content,
      (SELECT count(*)::int FROM episode_similarities WHERE tenant_id='lamartingale') AS sims,
      (SELECT count(*)::int FROM episodes_enrichment en JOIN episodes e ON en.episode_id=e.id WHERE e.tenant_id='lamartingale' AND en.embedding IS NOT NULL) AS with_emb
  `) as any[];
  console.log('LM state:', JSON.stringify(lm[0], null, 2));
  process.exit(0);
})();
