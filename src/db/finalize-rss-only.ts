/**
 * Finalise l'état des épisodes RSS-only (sans article sur le site) :
 *   - slug = "" → NULL (pour que scrape-deep les skip définitivement)
 *   - article_content / article_html = NULL (retire la pollution homepage 1207c)
 *   - chapters = '[]'
 *   - supprime tout episode_links pointant vers ces épisodes
 *
 * Ces épisodes gardent leurs données RSS (title, abstract, rss_description,
 * duration_seconds, date_created, embedding basé sur title+abstract+RSS).
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL!);

(async () => {
  // Target: all episodes with empty-string or null slug, AND article_content < 2000c
  // (i.e. still carrying the polluted homepage stub)
  const victims = await sql`
    SELECT id, episode_number, title, length(article_content) AS len
    FROM episodes
    WHERE (slug IS NULL OR slug = '' OR slug = ' ')
      AND article_content IS NOT NULL
      AND length(article_content) < 2000
    ORDER BY episode_number
  ` as any[];
  console.log(`Polluted rows to clean: ${victims.length}`);
  for (const v of victims) console.log(`  #${v.episode_number} (len=${v.len}) "${v.title}"`);

  if (victims.length === 0) { console.log('nothing to do'); return; }

  // Clean article_content / html / chapters
  await sql`
    UPDATE episodes
    SET article_content = NULL,
        article_html = NULL,
        chapters = '[]'::jsonb,
        slug = NULL,
        article_url = NULL,
        url = NULL
    WHERE (slug IS NULL OR slug = '' OR slug = ' ')
      AND article_content IS NOT NULL
      AND length(article_content) < 2000
  `;

  // Remove any episode_links inserted for these (they pointed to the homepage)
  await sql`
    DELETE FROM episode_links
    WHERE episode_id IN (
      SELECT id FROM episodes
      WHERE slug IS NULL AND article_content IS NULL
    )
  `;

  // Convert all remaining slug="" to NULL for hygiene
  await sql`
    UPDATE episodes
    SET slug = NULL, article_url = NULL, url = NULL
    WHERE slug = '' OR slug = ' '
  `;

  const check = await sql`
    SELECT episode_number, title,
           article_content IS NULL AS no_article,
           slug IS NULL AS no_slug
    FROM episodes
    WHERE id = ANY(${victims.map((v: any) => v.id)}::int[])
    ORDER BY episode_number
  `;
  console.log('\nPost-cleanup state:');
  console.table(check);
  console.log(`\n✅ ${victims.length} épisodes nettoyés, slugs vides → NULL.`);
  console.log(`   scrape-deep.ts filtrera désormais ces épisodes (WHERE slug IS NOT NULL).`);
})();
