import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

// ============================================================================
// Couche 2.2 — Calcul similarité épisodes via pgvector cosine
// ============================================================================

async function main() {
  console.log('[COUCHE 2][SIMILARITY] Computing episode similarities via pgvector');

  const sql = neon(process.env.DATABASE_URL!);

  // Check how many episodes have embeddings
  const [embCount] = await sql`
    SELECT count(*) as c FROM episodes_enrichment WHERE embedding IS NOT NULL
  `;
  console.log(`  Episodes with embeddings: ${embCount.c}`);

  if (Number(embCount.c) === 0) {
    console.log('  No embeddings found. Run embeddings.ts first.');
    return;
  }

  // Clear existing similarities
  await sql`TRUNCATE episode_similarities`;
  console.log('  Cleared existing similarities');

  // Get all episodes with embeddings
  const episodes = await sql`
    SELECT e.id, e.episode_number
    FROM episodes e
    INNER JOIN episodes_enrichment en ON en.episode_id = e.id
    WHERE en.embedding IS NOT NULL
    ORDER BY e.episode_number
  `;

  console.log(`  Computing top-20 neighbors for ${episodes.length} episodes...\n`);

  let inserted = 0;
  const startTime = Date.now();

  for (let i = 0; i < episodes.length; i++) {
    const ep = episodes[i];

    // Find top 20 nearest neighbors by cosine distance
    const neighbors = await sql`
      SELECT e2.id as similar_id, e2.episode_number,
             1 - (en1.embedding <=> en2.embedding) AS similarity
      FROM episodes_enrichment en1
      CROSS JOIN episodes_enrichment en2
      INNER JOIN episodes e2 ON e2.id = en2.episode_id
      WHERE en1.episode_id = ${ep.id}
        AND en2.episode_id != ${ep.id}
        AND en1.embedding IS NOT NULL
        AND en2.embedding IS NOT NULL
      ORDER BY en1.embedding <=> en2.embedding
      LIMIT 20
    `;

    // Insert similarities
    for (const n of neighbors) {
      await sql`
        INSERT INTO episode_similarities (episode_id, similar_episode_id, similarity_score)
        VALUES (${ep.id}, ${n.similar_id}, ${n.similarity})
        ON CONFLICT (episode_id, similar_episode_id) DO UPDATE SET similarity_score = ${n.similarity}
      `;
      inserted++;
    }

    if ((i + 1) % 50 === 0 || i === episodes.length - 1) {
      console.log(`  [${i + 1}/${episodes.length}] ${inserted} similarities inserted`);
    }
  }

  // Stats
  const [avgSim] = await sql`SELECT avg(similarity_score) as avg, min(similarity_score) as min, max(similarity_score) as max FROM episode_similarities`;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n[COUCHE 2][SIMILARITY] === DONE ===`);
  console.log(`  Total similarities: ${inserted}`);
  console.log(`  Avg score: ${Number(avgSim.avg).toFixed(4)}`);
  console.log(`  Range: ${Number(avgSim.min).toFixed(4)} — ${Number(avgSim.max).toFixed(4)}`);
  console.log(`  Time: ${elapsed}s`);
}

main().catch(e => { console.error('[COUCHE 2][SIMILARITY] FATAL:', e); process.exit(1); });
