import 'dotenv/config';
import OpenAI from 'openai';
import { neon } from '@neondatabase/serverless';
import { getConfig } from '../config';

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
  best_chapter?: {
    title: string;
    order: number;
    snippet: string;
    score: number;
  } | null;
}

export async function hybridSearch(query: string, limit: number = 10, opts: { depth?: 'episode' | 'chapter' } = {}): Promise<{
  query: string;
  results: SearchResult[];
  timing_ms: number;
}> {
  const start = Date.now();
  const sql = neon(process.env.DATABASE_URL!);
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const TENANT = getConfig().database.tenantId;

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
    // Semantic: pgvector cosine similarity — tenant-scoped
    sql`
      SELECT e.episode_number, e.title, e.guest, e.pillar, e.difficulty, e.abstract,
             em.thumbnail_350,
             1 - (en.embedding <=> ${embVector}::vector) AS similarity
      FROM episodes e
      INNER JOIN episodes_enrichment en ON en.episode_id = e.id
      LEFT JOIN episodes_media em ON em.episode_id = e.id
      WHERE en.embedding IS NOT NULL AND e.tenant_id = ${TENANT}
      ORDER BY en.embedding <=> ${embVector}::vector
      LIMIT 20
    `,

    // Lexical: pg_trgm on title + abstract + tags — tenant-scoped
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
      WHERE e.tenant_id = ${TENANT}
        AND (similarity(lower(e.title), lower(${query})) > 0.1
         OR similarity(lower(coalesce(e.abstract, '')), lower(${query})) > 0.1
         OR similarity(lower(coalesce(e.guest, '')), lower(${query})) > 0.1)
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
    best_chapter: null,
  }));

  // depth=chapter : enrichir chaque résultat avec le chapitre le plus pertinent
  if (opts.depth === 'chapter' && results.length) {
    const epNumbers = results.map(r => r.episode_number);
    const deepRows = await sql`
      SELECT episode_number, article_content, chapters
      FROM episodes
      WHERE tenant_id = ${TENANT} AND episode_number = ANY(${epNumbers})
    ` as any[];
    const byNum = new Map<number, any>(deepRows.map(r => [r.episode_number, r]));
    // Termes de la query pour scoring lexical simple
    const terms = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .split(/\W+/).filter(w => w.length >= 3);
    for (const r of results) {
      const deep = byNum.get(r.episode_number);
      if (!deep || !deep.chapters || !deep.chapters.length) continue;
      const bestCh = scoreChapters(deep.chapters, deep.article_content || '', terms);
      if (bestCh) r.best_chapter = bestCh;
    }
  }

  return {
    query,
    results,
    timing_ms: Date.now() - start,
  };
}

function scoreChapters(chapters: any[], article: string, terms: string[]) {
  let best: { title: string; order: number; snippet: string; score: number } | null = null;
  let remaining = article;
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    const next = chapters[i + 1];
    let content = '';
    if (article && remaining) {
      const idx = remaining.indexOf(ch.title);
      if (idx >= 0) {
        const after = remaining.substring(idx + ch.title.length);
        const nextIdx = next ? after.indexOf(next.title) : -1;
        content = nextIdx >= 0 ? after.substring(0, nextIdx) : after;
        if (nextIdx >= 0) remaining = after.substring(nextIdx);
        else remaining = '';
      }
    }
    const text = (ch.title + ' ' + content).toLowerCase();
    let score = 0;
    for (const t of terms) { if (text.includes(t)) score += 1; if (ch.title.toLowerCase().includes(t)) score += 2; }
    if (score > 0 && (!best || score > best.score)) {
      best = {
        title: ch.title,
        order: ch.order ?? i + 1,
        snippet: (content || ch.title).trim().substring(0, 200),
        score,
      };
    }
  }
  return best;
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
