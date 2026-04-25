/**
 * POC RAG handler — Chantier 6 weekend 2026-04-25.
 *
 * Réutilise le pipeline `engine/ai/rag.ts` et reformatte la sortie selon
 * le contrat spec : { answer, sources: [{ episode_id, episode_number,
 * title, url, excerpt }] }.
 *
 * NB : ragQuery() retourne déjà response + sources mais avec champs
 * { episode_number, title, guest, pillar, relevance_score }. On enrichit
 * avec une query DB pour récupérer episode_id, url, et un excerpt
 * (chapter snippet ou article preview).
 */
import { neon } from '@neondatabase/serverless';
import { ragQuery } from '../ai/rag';
import { getConfig } from '../config';

interface KnowledgeQuerySource {
  episode_id: number;
  episode_number: number;
  title: string;
  url: string;
  excerpt: string;
}

export interface KnowledgeQueryResponse {
  answer: string;
  sources: KnowledgeQuerySource[];
  meta: {
    model: string;
    timing_ms: number;
    sources_count: number;
  };
}

export async function knowledgeQuery(question: string): Promise<KnowledgeQueryResponse> {
  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    throw new Error('question is required and must be a non-empty string');
  }

  const cfg = getConfig();
  const TENANT = cfg.database.tenantId;
  if (TENANT !== 'lamartingale') {
    throw new Error(`POC RAG limited to tenant=lamartingale, got tenant=${TENANT}`);
  }

  // 1. Run RAG pipeline (embedding + pgvector top 5 + Sonnet generation)
  const rag = await ragQuery(question);

  // 2. Enrichir sources avec episode_id, url, excerpt
  const sql = neon(process.env.DATABASE_URL!);
  const epNums = rag.sources.map((s) => s.episode_number);
  const enriched = epNums.length
    ? ((await sql`
        SELECT id, episode_number, title, url, abstract, article_content
        FROM episodes
        WHERE tenant_id = ${TENANT} AND episode_number = ANY(${epNums})
      `) as any[])
    : [];
  const byNum = new Map<number, any>(enriched.map((r) => [r.episode_number, r]));

  const sources: KnowledgeQuerySource[] = rag.sources.slice(0, 5).map((s) => {
    const e = byNum.get(s.episode_number) || {};
    const excerptRaw = (e.abstract || (e.article_content ? String(e.article_content).substring(0, 300) : '') || '');
    const excerpt = excerptRaw.replace(/\s+/g, ' ').trim().substring(0, 280);
    return {
      episode_id: e.id ?? -1,
      episode_number: s.episode_number,
      title: s.title,
      url: e.url || '',
      excerpt,
    };
  });

  return {
    answer: rag.response,
    sources,
    meta: {
      model: rag.model,
      timing_ms: rag.timing_ms,
      sources_count: sources.length,
    },
  };
}
