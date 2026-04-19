/**
 * Rollback : les 22 épisodes avec slug="" ont reçu la page d'accueil
 * du site comme article_content (1207c identique). Cette pollution biaise
 * les embeddings et les articles — on la retire.
 *
 * Après ce cleanup, relancer embeddings.ts --force pour régénérer les 22
 * embeddings à partir des seuls champs title/abstract/guest/tags.
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

(async () => {
  const target = await sql`
    SELECT id, episode_number, title
    FROM episodes
    WHERE (slug IS NULL OR slug = '' OR slug = ' ')
      AND article_content IS NOT NULL
      AND length(article_content) < 2000
    ORDER BY episode_number
  `;
  console.log(`Cleaning ${(target as any[]).length} polluted episodes...`);
  for (const ep of target as any[]) {
    console.log(`  #${ep.episode_number} "${ep.title}"`);
  }

  // Also clear any episode_links rows that point to the homepage
  await sql`
    DELETE FROM episode_links
    WHERE episode_id IN (
      SELECT id FROM episodes
      WHERE (slug IS NULL OR slug = '' OR slug = ' ')
    )
  `;

  const res = await sql`
    UPDATE episodes
    SET article_content = NULL,
        article_html = NULL,
        chapters = '[]'::jsonb
    WHERE (slug IS NULL OR slug = '' OR slug = ' ')
      AND article_content IS NOT NULL
      AND length(article_content) < 2000
    RETURNING episode_number
  `;
  console.log(`\n✅ Cleaned ${(res as any[]).length} rows`);
  console.log('  article_content/html reset, chapters reset to [], bad episode_links deleted');
  console.log('  → Re-run embeddings.ts --force to regenerate cleaned embeddings');
})();
