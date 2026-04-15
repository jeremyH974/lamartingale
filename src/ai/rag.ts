import 'dotenv/config';
import { hybridSearch } from './search';
import { neon } from '@neondatabase/serverless';

// ============================================================================
// Couche 3.2 — Pipeline RAG (retrieve + augment + generate)
// ============================================================================

const SYSTEM_PROMPT = `Tu es un assistant expert en finances personnelles basé sur le podcast La Martingale, animé par Matthieu Stefani.

Règles :
- Réponds toujours en français
- Cite les épisodes par numéro et titre (ex: "L'épisode #312 avec Arthur Auboeuf...")
- Base tes réponses UNIQUEMENT sur le contexte fourni
- Si le contexte ne contient pas la réponse, dis-le honnêtement
- Sois pédagogique et accessible, comme le ton du podcast
- Termine par 1-2 épisodes recommandés pour approfondir`;

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

  // 1. Retrieve top 5 episodes
  const searchResults = await hybridSearch(message, 5);

  // 2. Build context from search results
  const sql = neon(process.env.DATABASE_URL!);
  const contextParts: string[] = [];

  for (const result of searchResults.results) {
    // Get full enriched data
    const [enriched] = await sql`
      SELECT en.tags, en.sub_themes
      FROM episodes_enrichment en
      INNER JOIN episodes e ON e.id = en.episode_id
      WHERE e.episode_number = ${result.episode_number}
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

  // 3. Call LLM
  const userPrompt = `Contexte (épisodes du podcast La Martingale) :\n\n${context}\n\nQuestion de l'utilisateur : ${message}`;

  let responseText = '';
  let model = 'claude-sonnet-4-20250514';

  // Try Anthropic first, fallback to OpenAI
  try {
    if (process.env.ANTHROPIC_API_KEY) {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      });
      responseText = response.content[0].type === 'text' ? response.content[0].text : '';
      model = 'claude-sonnet-4-20250514';
    } else {
      throw new Error('No Anthropic key, trying OpenAI');
    }
  } catch {
    // Fallback to OpenAI
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1024,
      temperature: 0.3,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    });
    responseText = response.choices[0]?.message?.content || '';
    model = 'gpt-4o-mini';
  }

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
