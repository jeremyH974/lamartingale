/**
 * One-shot audit : vérifier l'état BDD par rapport au plan deep-scraping.
 * Non critique, peut être supprimé après usage.
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  // 1. Colonnes actuelles sur episodes
  const episodeCols = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'episodes'
    ORDER BY ordinal_position
  `;

  // 2. Colonnes actuelles sur guests
  const guestCols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'guests'
    ORDER BY ordinal_position
  `;

  // 3. Existence de la table episode_links
  const linksTable = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'episode_links'
  `;

  // 4. Counts de remplissage sur les colonnes candidates
  const counts = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(article_content)::int AS article_content_filled,
      COUNT(CASE WHEN length(article_content) > 500 THEN 1 END)::int AS article_content_substantial,
      AVG(length(article_content))::int AS article_content_avg_chars,
      COUNT(abstract)::int AS abstract_filled,
      COUNT(key_takeaways)::int AS key_takeaways_filled,
      COUNT(guest_bio)::int AS guest_bio_filled,
      COUNT(slug)::int AS slug_filled,
      COUNT(article_url)::int AS article_url_filled,
      COUNT(date_created)::int AS date_created_filled
    FROM episodes
  `;

  // 5. Check des colonnes deep-scraping envisagées
  const candidateCols = [
    'article_content',
    'article_html',
    'chapters',
    'duration_seconds',
    'rss_description',
  ];
  const existing = new Set(episodeCols.map((r: any) => r.column_name));
  const candidateStatus = candidateCols.map((c) => ({
    column: c,
    exists: existing.has(c),
  }));

  // 6. Check linkedin_url sur guests
  const guestCandidates = ['linkedin_url'];
  const guestExisting = new Set(guestCols.map((r: any) => r.column_name));
  const guestStatus = guestCandidates.map((c) => ({
    column: c,
    exists: guestExisting.has(c),
  }));

  // 7. Embeddings counts
  const embeddings = await sql`
    SELECT
      COUNT(*)::int AS total_enrichments,
      COUNT(embedding)::int AS embeddings_filled
    FROM episodes_enrichment
  `;

  console.log('\n=== SCHEMA — episodes ===');
  console.table(episodeCols);

  console.log('\n=== SCHEMA — guests ===');
  console.table(guestCols);

  console.log('\n=== TABLE episode_links ===');
  console.log(linksTable.length > 0 ? 'EXISTS' : 'ABSENT');

  console.log('\n=== CANDIDATE COLUMNS — episodes ===');
  console.table(candidateStatus);

  console.log('\n=== CANDIDATE COLUMNS — guests ===');
  console.table(guestStatus);

  console.log('\n=== FILL RATES — episodes ===');
  console.table(counts);

  console.log('\n=== EMBEDDINGS ===');
  console.table(embeddings);
}

main().catch((e) => {
  console.error('Audit failed:', e);
  process.exit(1);
});
