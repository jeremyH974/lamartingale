/**
 * Audit exhaustif — anomalies côté contenu LM + GDIY
 * pour compiler docs/anomalies-sites-orso.md
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

(async () => {
  const sql = neon(process.env.DATABASE_URL!);

  for (const TENANT of ['lamartingale', 'gdiy']) {
    console.log(`\n===== ${TENANT.toUpperCase()} =====`);

    const total: any = await sql`SELECT COUNT(*)::int AS n FROM episodes WHERE tenant_id = ${TENANT}`;
    const byType: any = await sql`SELECT episode_type, COUNT(*)::int AS n FROM episodes WHERE tenant_id = ${TENANT} GROUP BY episode_type`;
    console.log(`episodes: ${total[0].n}`, byType);

    const missingArticle: any = await sql`
      SELECT COUNT(*)::int AS n FROM episodes
      WHERE tenant_id = ${TENANT} AND (episode_type='full' OR episode_type IS NULL)
        AND (article_content IS NULL OR length(article_content) < 500)
    `;
    console.log(`full eps without article >500c: ${missingArticle[0].n}`);

    const noUrl: any = await sql`
      SELECT COUNT(*)::int AS n FROM episodes
      WHERE tenant_id = ${TENANT} AND (episode_type='full' OR episode_type IS NULL)
        AND (article_url IS NULL OR article_url = '')
    `;
    console.log(`full eps without article_url: ${noUrl[0].n}`);

    const emptySlug: any = await sql`
      SELECT COUNT(*)::int AS n FROM episodes
      WHERE tenant_id = ${TENANT} AND (episode_type='full' OR episode_type IS NULL)
        AND (slug IS NULL OR slug = '')
    `;
    console.log(`full eps without slug: ${emptySlug[0].n}`);

    const noImage: any = await sql`
      SELECT COUNT(*)::int AS n FROM episodes
      WHERE tenant_id = ${TENANT} AND (episode_type='full' OR episode_type IS NULL)
        AND (episode_image_url IS NULL OR episode_image_url = '')
    `;
    console.log(`full eps without image_url: ${noImage[0].n}`);

    const noDuration: any = await sql`
      SELECT COUNT(*)::int AS n FROM episodes
      WHERE tenant_id = ${TENANT} AND (episode_type='full' OR episode_type IS NULL)
        AND (duration_seconds IS NULL OR duration_seconds = 0)
    `;
    console.log(`full eps without duration: ${noDuration[0].n}`);

    const noGuest: any = await sql`
      SELECT COUNT(*)::int AS n FROM episodes
      WHERE tenant_id = ${TENANT} AND (episode_type='full' OR episode_type IS NULL)
        AND (guest IS NULL OR guest = '')
        AND (guest_from_title IS NULL OR guest_from_title = '')
    `;
    console.log(`full eps without any guest info: ${noGuest[0].n}`);

    const noChapters: any = await sql`
      SELECT COUNT(*)::int AS n FROM episodes
      WHERE tenant_id = ${TENANT} AND (episode_type='full' OR episode_type IS NULL)
        AND (chapters IS NULL OR chapters::text = '[]' OR chapters::text = 'null')
    `;
    console.log(`full eps without chapters: ${noChapters[0].n}`);

    const guests: any = await sql`SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE linkedin_url IS NOT NULL AND linkedin_url != '')::int AS with_li FROM guests WHERE tenant_id = ${TENANT}`;
    console.log(`guests: ${guests[0].n} (with LinkedIn: ${guests[0].with_li})`);

    const links: any = await sql`SELECT link_type, COUNT(*)::int AS n FROM episode_links WHERE tenant_id = ${TENANT} GROUP BY link_type`;
    console.log('links:', links);

    const ep0links: any = await sql`
      SELECT COUNT(*)::int AS n FROM episodes e
      WHERE e.tenant_id = ${TENANT} AND (e.episode_type='full' OR e.episode_type IS NULL)
        AND NOT EXISTS (SELECT 1 FROM episode_links l WHERE l.episode_id = e.id AND l.tenant_id = ${TENANT})
    `;
    console.log(`full eps with 0 episode_links: ${ep0links[0].n}`);

  }

  console.log('\n===== LM spécifiques =====');
  const lmStub: any = await sql`
    SELECT id, episode_number, title, slug FROM episodes
    WHERE tenant_id='lamartingale' AND (episode_type='full' OR episode_type IS NULL)
      AND (article_content IS NULL OR length(article_content) < 500)
    ORDER BY episode_number DESC
  `;
  console.log('LM episodes without article (examples):');
  for (const r of lmStub.slice(0, 15)) console.log(`  #${r.episode_number} slug=${r.slug || 'EMPTY'} | ${(r.title || '').substring(0, 60)}`);
  if (lmStub.length > 15) console.log(`  ... (${lmStub.length - 15} more)`);

  const emptySlugLm: any = await sql`
    SELECT episode_number, title FROM episodes
    WHERE tenant_id='lamartingale' AND (slug IS NULL OR slug = '')
    ORDER BY episode_number DESC LIMIT 25
  `;
  console.log('LM empty-slug sample:');
  for (const r of emptySlugLm) console.log(`  #${r.episode_number}: ${r.title}`);

  console.log('\n===== GDIY spécifiques =====');
  const gdiyStub: any = await sql`
    SELECT id, episode_number, title, slug, article_url FROM episodes
    WHERE tenant_id='gdiy' AND (episode_type='full' OR episode_type IS NULL)
      AND (article_content IS NULL OR length(article_content) < 500)
    ORDER BY episode_number DESC NULLS LAST
  `;
  console.log('GDIY episodes without article (examples):');
  for (const r of gdiyStub.slice(0, 20)) console.log(`  #${r.episode_number ?? '?'} url=${(r.article_url || 'NULL').substring(0, 50)} | ${(r.title || '').substring(0, 50)}`);
  if (gdiyStub.length > 20) console.log(`  ... (${gdiyStub.length - 20} more)`);
})();
