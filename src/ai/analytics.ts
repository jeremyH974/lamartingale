import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { getConfig } from '../config';

// ============================================================================
// Couche 2.3 — Analytics SQL (métriques data science) — multi-tenant
// ============================================================================

export async function getAnalytics() {
  const sql = neon(process.env.DATABASE_URL!);
  const TENANT = getConfig().database.tenantId;

  const [
    pillarMonthly,
    topGuests,
    guestDiversity,
    difficultyEvolution,
    tagCooccurrence,
    similarityStats,
    embeddingCoverage,
  ] = await Promise.all([
    // 1. Densité par pilier/mois
    sql`
      SELECT pillar, date_trunc('month', date_created) as month, count(*) as count
      FROM episodes
      WHERE date_created IS NOT NULL AND tenant_id = ${TENANT}
      GROUP BY pillar, month
      ORDER BY month DESC, count DESC
      LIMIT 100
    `,

    // 2. Top guests (multi-épisodes)
    sql`
      SELECT guest, count(*) as episode_count, array_agg(DISTINCT pillar) as pillars
      FROM episodes
      WHERE guest IS NOT NULL AND guest != '' AND tenant_id = ${TENANT}
      GROUP BY guest
      HAVING count(*) > 1
      ORDER BY count(*) DESC
      LIMIT 20
    `,

    // 3. Diversité guests par pilier
    sql`
      SELECT pillar,
             count(DISTINCT guest) as unique_guests,
             count(*) as total_episodes,
             ROUND(count(DISTINCT guest)::numeric / NULLIF(count(*), 0), 3) as diversity_ratio
      FROM episodes
      WHERE guest IS NOT NULL AND tenant_id = ${TENANT}
      GROUP BY pillar
      ORDER BY diversity_ratio DESC
    `,

    // 4. Distribution difficulté par année
    sql`
      SELECT EXTRACT(YEAR FROM date_created) as year, difficulty, count(*) as count
      FROM episodes
      WHERE date_created IS NOT NULL AND difficulty IS NOT NULL AND tenant_id = ${TENANT}
      GROUP BY year, difficulty
      ORDER BY year DESC, difficulty
    `,

    // 5. Tags co-occurrents (top paires)
    sql`
      SELECT t1.tag as tag1, t2.tag as tag2, count(*) as co_count
      FROM episodes_enrichment e1,
           unnest(e1.tags) AS t1(tag),
           unnest(e1.tags) AS t2(tag)
      WHERE t1.tag < t2.tag AND e1.tenant_id = ${TENANT}
      GROUP BY t1.tag, t2.tag
      ORDER BY co_count DESC
      LIMIT 20
    `,

    // 6. Statistiques de similarité
    sql`
      SELECT
        count(*) as total_pairs,
        avg(similarity_score) as avg_similarity,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY similarity_score) as median_similarity,
        min(similarity_score) as min_similarity,
        max(similarity_score) as max_similarity
      FROM episode_similarities WHERE tenant_id = ${TENANT}
    `,

    // 7. Couverture embeddings
    sql`
      SELECT
        (SELECT count(*) FROM episodes WHERE tenant_id = ${TENANT}) as total_episodes,
        (SELECT count(*) FROM episodes_enrichment WHERE tenant_id = ${TENANT} AND embedding IS NOT NULL) as with_embedding,
        (SELECT count(*) FROM episode_similarities WHERE tenant_id = ${TENANT}) as similarity_pairs
    `,
  ]);

  // 8. Score diversité global (Gini-like)
  const pillarCounts = await sql`
    SELECT pillar, count(*) as c FROM episodes WHERE tenant_id = ${TENANT} GROUP BY pillar ORDER BY c DESC
  `;
  const counts = pillarCounts.map((r: any) => Number(r.c));
  const total = counts.reduce((a: number, b: number) => a + b, 0);
  const n = counts.length;
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      giniSum += Math.abs(counts[i] - counts[j]);
    }
  }
  const giniIndex = n > 1 ? giniSum / (2 * n * total) : 0;
  const diversityScore = Math.round((1 - giniIndex) * 100);

  return {
    pillar_monthly: pillarMonthly,
    top_guests: topGuests,
    guest_diversity: guestDiversity,
    difficulty_evolution: difficultyEvolution,
    tag_cooccurrence: tagCooccurrence,
    similarity_stats: similarityStats[0] || {},
    embedding_coverage: embeddingCoverage[0] || {},
    diversity_score: {
      gini_index: Number(giniIndex.toFixed(4)),
      diversity_percent: diversityScore,
      interpretation: diversityScore > 70 ? 'Bonne diversité' : diversityScore > 50 ? 'Diversité moyenne' : 'Concentration forte',
    },
  };
}

// CLI mode
if (require.main === module) {
  getAnalytics().then(data => {
    console.log('[COUCHE 2][ANALYTICS] Results:');
    console.log(`  Top guests: ${data.top_guests.length} guests multi-épisodes`);
    console.log(`  Tag co-occurrences: ${data.tag_cooccurrence.length} paires`);
    console.log(`  Similarity stats: avg=${Number(data.similarity_stats.avg_similarity || 0).toFixed(4)}`);
    console.log(`  Embedding coverage: ${data.embedding_coverage.with_embedding}/${data.embedding_coverage.total_episodes}`);
    console.log(`  Diversity score: ${data.diversity_score.diversity_percent}% (${data.diversity_score.interpretation})`);
    console.log(`\n  Full data: ${JSON.stringify(data).length} bytes`);
  }).catch(console.error);
}
