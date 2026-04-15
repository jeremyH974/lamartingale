import 'dotenv/config';
import OpenAI from 'openai';
import { neon } from '@neondatabase/serverless';

// ============================================================================
// Couche 3.1 — Hybrid Search (pgvector cosine + pg_trgm trigram + RRF)
// ============================================================================

const MODEL = 'text-embedding-3-large';
const DIMENSIONS = 3072;
const K_RRF = 60; // RRF constant
const WEIGHT_SEMANTIC = 0.7;
const WEIGHT_LEXICAL = 0.3;

export interface SearchResult {
  episode_number: number;
  title: string;
  guest: string;
  pillar: string;
  difficulty: string;
  abstract: string;
  thumbnail: string | null;
  score: number;
  match_type: 'semantic' | 'lexical' | 'hybrid';
  semantic_rank: number | null;
  lexical_rank: number | null;
}

export async function hybridSearch(query: string, limit: number = 10): Promise<{
  query: string;
  results: SearchResult[];
  timing_ms: number;
}> {
  const start = Date.now();
  const sql = neon(process.env.DATABASE_URL!);
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // 1. Generate query embedding
  const embResponse = await openai.embeddings.create({
    model: MODEL,
    input: query,
    dimensions: DIMENSIONS,
  });
  const queryEmbedding = embResponse.data[0].embedding;
  const embVector = `[${queryEmbedding.join(',')}]`;

  // 2. Parallel: semantic search + lexical search
  const [semanticResults, lexicalResults] = await Promise.all([
    // Semantic: pgvector cosine similarity
    sql`
      SELECT e.episode_number, e.title, e.guest, e.pillar, e.difficulty, e.abstract,
             em.thumbnail_350,
             1 - (en.embedding <=> ${embVector}::vector) AS similarity
      FROM episodes e
      INNER JOIN episodes_enrichment en ON en.episode_id = e.id
      LEFT JOIN episodes_media em ON em.episode_id = e.id
      WHERE en.embedding IS NOT NULL
      ORDER BY en.embedding <=> ${embVector}::vector
      LIMIT 20
    `,

    // Lexical: pg_trgm on title + abstract + tags
    sql`
      SELECT e.episode_number, e.title, e.guest, e.pillar, e.difficulty, e.abstract,
             em.thumbnail_350,
             greatest(
               similarity(lower(e.title), lower(${query})),
               similarity(lower(coalesce(e.abstract, '')), lower(${query})),
               similarity(lower(coalesce(e.guest, '')), lower(${query}))
             ) AS trgm_score
      FROM episodes e
      LEFT JOIN episodes_media em ON em.episode_id = e.id
      WHERE similarity(lower(e.title), lower(${query})) > 0.1
         OR similarity(lower(coalesce(e.abstract, '')), lower(${query})) > 0.1
         OR similarity(lower(coalesce(e.guest, '')), lower(${query})) > 0.1
      ORDER BY trgm_score DESC
      LIMIT 20
    `,
  ]);

  // 3. RRF Fusion
  const scoreMap: Record<number, {
    ep: any;
    semanticRank: number | null;
    lexicalRank: number | null;
    score: number;
  }> = {};

  // Semantic ranks
  semanticResults.forEach((r: any, i: number) => {
    const epNum = r.episode_number;
    if (!scoreMap[epNum]) {
      scoreMap[epNum] = { ep: r, semanticRank: null, lexicalRank: null, score: 0 };
    }
    scoreMap[epNum].semanticRank = i + 1;
    scoreMap[epNum].score += WEIGHT_SEMANTIC * (1 / (K_RRF + i + 1));
  });

  // Lexical ranks
  lexicalResults.forEach((r: any, i: number) => {
    const epNum = r.episode_number;
    if (!scoreMap[epNum]) {
      scoreMap[epNum] = { ep: r, semanticRank: null, lexicalRank: null, score: 0 };
    }
    scoreMap[epNum].lexicalRank = i + 1;
    scoreMap[epNum].score += WEIGHT_LEXICAL * (1 / (K_RRF + i + 1));
  });

  // Sort by RRF score, take top N
  const ranked = Object.values(scoreMap)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const results: SearchResult[] = ranked.map(r => ({
    episode_number: r.ep.episode_number,
    title: r.ep.title,
    guest: r.ep.guest || '',
    pillar: r.ep.pillar,
    difficulty: r.ep.difficulty || '',
    abstract: (r.ep.abstract || '').substring(0, 200),
    thumbnail: r.ep.thumbnail_350 || null,
    score: Number(r.score.toFixed(6)),
    match_type: (r.semanticRank && r.lexicalRank) ? 'hybrid' : r.semanticRank ? 'semantic' : 'lexical',
    semantic_rank: r.semanticRank,
    lexical_rank: r.lexicalRank,
  }));

  return {
    query,
    results,
    timing_ms: Date.now() - start,
  };
}

// CLI test
if (require.main === module) {
  const query = process.argv[2] || 'investir en SCPI quand on débute';
  hybridSearch(query).then(r => {
    console.log(`[COUCHE 3][SEARCH] "${r.query}" → ${r.results.length} results (${r.timing_ms}ms)`);
    for (const s of r.results) {
      console.log(`  #${s.episode_number} ${s.title.substring(0, 50)} [${s.match_type}] score=${s.score}`);
    }
  }).catch(console.error);
}
