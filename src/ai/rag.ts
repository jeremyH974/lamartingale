import 'dotenv/config';
import { generateText } from 'ai';
import { hybridSearch } from './search';
import { neon } from '@neondatabase/serverless';
import { getConfig } from '../config';
import { getLLM, getModelId } from './llm';

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

export async function ragQuery(message: string): Promise<RagResponse> {
  const start = Date.now();
  const cfg = getConfig();
  const TENANT = cfg.database.tenantId;

  // 1. Retrieve top 5 episodes
  const searchResults = await hybridSearch(message, 5);

  // 2. Build context from search results (tenant-scoped)
  const sql = neon(process.env.DATABASE_URL!);
  const contextParts: string[] = [];

  for (const result of searchResults.results) {
    const [enriched] = await sql`
      SELECT en.tags, en.sub_themes
      FROM episodes_enrichment en
      INNER JOIN episodes e ON e.id = en.episode_id
      WHERE e.episode_number = ${result.episode_number} AND e.tenant_id = ${TENANT}
    `;

    contextParts.push(`
--- Épisode #${result.episode_number}: "${result.title}" ---
Invité: ${result.guest}
Pilier: ${result.pillar}
Difficulté: ${result.difficulty}
Résumé: ${result.abstract || 'Non disponible'}
Tags: ${(enriched?.tags || []).join(', ')}
Sous-thèmes: ${(enriched?.sub_themes || []).join(', ')}
`.trim());
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
