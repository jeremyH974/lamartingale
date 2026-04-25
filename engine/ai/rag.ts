import 'dotenv/config';
import crypto from 'crypto';
import { generateText } from 'ai';
import { hybridSearch } from './search';
import { neon } from '@neondatabase/serverless';
import { getConfig } from '../config';
import { getLLM, getModelId } from './llm';
import { getCached } from '../cache';

// Cache TTL pour les réponses RAG : 24h.
// La clé est dérivée d'un sha256 de la question normalisée (lowercase+trim) pour
// éviter qu'un simple changement de casse créé un miss inutile. Le namespace
// tenant est ajouté automatiquement par engine/cache.ts (cache:<tenant>:<key>).
const RAG_CACHE_TTL_SEC = 86400; // 24h

// ============================================================================
// Couche 3.2 — Pipeline RAG (retrieve + augment + generate) — multi-podcast
// ============================================================================

function buildSystemPrompt(): string {
  const cfg = getConfig();
  return `Tu es l'assistant expert du podcast ${cfg.name}, animé par ${cfg.host}${cfg.description ? ` (${cfg.description})` : ''}.

Règles :
- Réponds en français, de façon précise et structurée.
- Cite les épisodes par numéro et titre (ex: "L'épisode #312 avec X...").
- Base tes réponses UNIQUEMENT sur le contexte fourni.
- Quand pertinent, indique le chapitre spécifique et les ressources mentionnées.
- Si la question est hors du périmètre du podcast, dis-le clairement.
- Ne fais pas de conseil en investissement — oriente vers les épisodes pertinents.
- Termine par 1-2 épisodes recommandés pour approfondir.`;
}

export interface RagResponse {
  response: string;
  sources: Array<{
    episode_number: number;
    title: string;
    guest: string;
    pillar: string;
    relevance_score: number;
  }>;
  model: string;
  timing_ms: number;
}

// Exporté pour test unitaire (engine/__tests__/rag-cache-key.test.ts) — pure fn,
// pas d'usage prévu hors `ragQuery()` ni hors tests.
export function ragCacheKey(message: string): string {
  const normalized = message.toLowerCase().trim();
  const hash = crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 32);
  return `rag:query:${hash}`;
}

export async function ragQuery(message: string): Promise<RagResponse> {
  // Cache wrapper — évite de re-rerun pgvector + LLM sur questions répétées.
  // Cache namespacé par tenant via engine/cache.ts (KV en prod, LRU local).
  // TTL 24h aligné sur la cadence d'enrichissement (1 ingest/jour max).
  return getCached(ragCacheKey(message), RAG_CACHE_TTL_SEC, () => ragQueryUncached(message));
}

async function ragQueryUncached(message: string): Promise<RagResponse> {
  const start = Date.now();
  const cfg = getConfig();
  const TENANT = cfg.database.tenantId;

  // 1. Retrieve top 5 episodes with chapter-level awareness
  const searchResults = await hybridSearch(message, 5, { depth: 'chapter' });

  // 2. Build enriched context (tenant-scoped, deep content when available)
  const sql = neon(process.env.DATABASE_URL!);
  const contextParts: string[] = [];

  const epNumbers = searchResults.results.map(r => r.episode_number);
  const deepRows = epNumbers.length ? await sql`
    SELECT e.episode_number, e.duration_seconds, e.article_content, e.chapters, e.key_takeaways,
           g.linkedin_url AS guest_linkedin,
           en.tags, en.sub_themes
    FROM episodes e
    LEFT JOIN guests g ON g.tenant_id = e.tenant_id AND g.name = e.guest
    LEFT JOIN episodes_enrichment en ON en.episode_id = e.id
    WHERE e.tenant_id = ${TENANT} AND e.episode_number = ANY(${epNumbers})
  ` as any[] : [];
  const byNum = new Map<number, any>(deepRows.map((r: any) => [r.episode_number, r]));

  // Liens les plus pertinents par épisode (limite 5)
  const linksRows = epNumbers.length ? await sql`
    SELECT e.episode_number, el.label, el.url, el.link_type
    FROM episode_links el
    INNER JOIN episodes e ON e.id = el.episode_id
    WHERE e.tenant_id = ${TENANT} AND e.episode_number = ANY(${epNumbers})
      AND el.link_type IN ('resource','tool','company')
    ORDER BY el.id
  ` as any[] : [];
  const linksByNum = new Map<number, any[]>();
  for (const l of linksRows) {
    const list = linksByNum.get(l.episode_number) || [];
    if (list.length < 5) list.push(l);
    linksByNum.set(l.episode_number, list);
  }

  for (const result of searchResults.results) {
    const deep = byNum.get(result.episode_number);
    const durationMin = deep?.duration_seconds ? Math.round(deep.duration_seconds / 60) : null;
    const chapters: any[] = deep?.chapters || [];
    const takeaways: string[] = deep?.key_takeaways || [];
    const links: any[] = linksByNum.get(result.episode_number) || [];

    // Sélection intelligente : chapitre le plus pertinent si dispo, sinon début d'article
    let contentExcerpt = '';
    if (result.best_chapter) {
      contentExcerpt = `Section pertinente : "${result.best_chapter.title}"\n${result.best_chapter.snippet}`;
    } else if (deep?.article_content) {
      contentExcerpt = deep.article_content.substring(0, 1500);
    }

    const guestLine = result.guest + (deep?.guest_linkedin ? ` (${deep.guest_linkedin})` : '');

    const parts = [
      `--- Épisode #${result.episode_number} — ${result.title} ---`,
      `Invité : ${guestLine}`,
      durationMin ? `Durée : ${durationMin} min` : null,
      `Pilier : ${result.pillar} | Difficulté : ${result.difficulty}`,
      '',
      `Résumé : ${result.abstract || 'Non disponible'}`,
      chapters.length ? `\nChapitres :\n${chapters.slice(0, 8).map((c: any, i: number) => `${i + 1}. ${c.title}`).join('\n')}` : null,
      contentExcerpt ? `\nContenu clé :\n${contentExcerpt}` : null,
      takeaways.length ? `\nÀ retenir :\n${takeaways.slice(0, 5).map(t => `- ${t}`).join('\n')}` : null,
      links.length ? `\nRessources mentionnées :\n${links.map(l => `- ${l.label || l.url} (${l.url})`).join('\n')}` : null,
      `\nTags : ${(deep?.tags || []).join(', ')}`,
    ].filter(Boolean);

    contextParts.push(parts.join('\n'));
  }

  const context = contextParts.join('\n\n');
  const systemPrompt = buildSystemPrompt();

  // 3. Call LLM
  const userPrompt = `Contexte (épisodes du podcast ${cfg.name}) :\n\n${context}\n\nQuestion de l'utilisateur : ${message}`;

  // LLM call centralisé via src/ai/llm.ts — Anthropic Claude Sonnet par défaut,
  // fallback OpenAI gpt-4o-mini si ANTHROPIC_API_KEY absent.
  const { text } = await generateText({
    model: getLLM(),
    system: systemPrompt,
    prompt: userPrompt,
    maxOutputTokens: 1024,
    temperature: 0.3,
  });
  const responseText = text;
  const model = getModelId('main');

  return {
    response: responseText,
    sources: searchResults.results.map(r => ({
      episode_number: r.episode_number,
      title: r.title,
      guest: r.guest,
      pillar: r.pillar,
      relevance_score: r.score,
    })),
    model,
    timing_ms: Date.now() - start,
  };
}

// CLI test
if (require.main === module) {
  const question = process.argv[2] || 'Quels épisodes parlent de SCPI pour débutant ?';
  ragQuery(question).then(r => {
    console.log(`[COUCHE 3][RAG] Model: ${r.model} (${r.timing_ms}ms)`);
    console.log(`\n${r.response}\n`);
    console.log('Sources:');
    for (const s of r.sources) {
      console.log(`  #${s.episode_number} ${s.title} (${s.pillar})`);
    }
  }).catch(console.error);
}
