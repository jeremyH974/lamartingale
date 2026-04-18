import { generateText } from 'ai';
import * as fs from 'fs';
import * as path from 'path';
import { getLLMFast, getModelId } from './ai/llm';

// ============================================================================
// La Martingale - Enrichissement IA
// Genere resumes pedagogiques, quiz, classifications, tags pour chaque episode
// Modèle : Claude Haiku (rapide, batch, extraction) via src/ai/llm.ts
// ============================================================================

interface EpisodeIndex {
  id: number;
  guest: string;
  title: string;
  pillar: string;
  difficulty: string;
}

interface EnrichedEpisode extends EpisodeIndex {
  summary_pedagogique: string;
  key_takeaways: string[];
  quiz: QuizQuestion[];
  tags_enriched: string[];
  related_concepts: string[];
  difficulty_justification: string;
  target_audience: string;
}

interface QuizQuestion {
  question: string;
  options: string[];
  correct_answer: number;
  explanation: string;
}

// Enrich a batch of episodes using Claude
async function enrichBatch(episodes: EpisodeIndex[]): Promise<EnrichedEpisode[]> {
  const episodeList = episodes.map(ep =>
    `- #${ep.id} "${ep.title}" (Invite: ${ep.guest}, Pilier: ${ep.pillar}, Difficulte: ${ep.difficulty})`
  ).join('\n');

  const prompt = `Tu es un expert en education financiere. Pour chaque episode du podcast La Martingale ci-dessous, genere un enrichissement pedagogique structure.

Episodes:
${episodeList}

Pour CHAQUE episode, genere un objet JSON avec:
1. "id": numero de l'episode
2. "summary_pedagogique": resume de 2-3 phrases orienté apprentissage (ce que l'auditeur va apprendre)
3. "key_takeaways": 3-5 points cles actionables
4. "quiz": 2 questions de quiz avec 4 options, la bonne reponse (index 0-3), et une explication
5. "tags_enriched": 5-8 tags semantiques precis
6. "related_concepts": 3-5 concepts financiers abordes (ex: "DCA", "effet de levier", "diversification")
7. "difficulty_justification": pourquoi ce niveau de difficulte
8. "target_audience": description du public cible ideal en 1 phrase

Reponds UNIQUEMENT avec un tableau JSON valide. Pas de markdown, pas de commentaires.`;

  const { text } = await generateText({
    model: getLLMFast(),
    prompt,
    maxOutputTokens: 8000,
  });

  // Extract JSON from response
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error('Failed to parse AI response');
    return [];
  }

  try {
    const enriched = JSON.parse(jsonMatch[0]) as EnrichedEpisode[];
    return enriched.map(e => ({
      ...episodes.find(ep => ep.id === e.id)!,
      ...e,
    }));
  } catch (err) {
    console.error('JSON parse error:', err);
    return [];
  }
}

// Process all episodes in batches
async function enrichAllEpisodes(batchSize = 10): Promise<void> {
  const indexPath = path.join(__dirname, '..', 'data', 'episodes-complete-index.json');
  const outputPath = path.join(__dirname, '..', 'data', 'episodes-ai-enriched.json');

  const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  const episodes: EpisodeIndex[] = indexData.episodes;

  console.log(`\n=== LA MARTINGALE - ENRICHISSEMENT IA ===`);
  console.log(`Total episodes: ${episodes.length}`);
  console.log(`Batch size: ${batchSize}`);
  console.log(`Estimated batches: ${Math.ceil(episodes.length / batchSize)}\n`);

  // Load existing enriched data to resume
  let existingEnriched: EnrichedEpisode[] = [];
  if (fs.existsSync(outputPath)) {
    const existing = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    existingEnriched = existing.episodes || [];
    console.log(`Resuming: ${existingEnriched.length} already enriched\n`);
  }

  const enrichedIds = new Set(existingEnriched.map(e => e.id));
  const remaining = episodes.filter(ep => !enrichedIds.has(ep.id));

  console.log(`Remaining: ${remaining.length} episodes to enrich\n`);

  const allEnriched = [...existingEnriched];
  let batchNum = 0;

  for (let i = 0; i < remaining.length; i += batchSize) {
    batchNum++;
    const batch = remaining.slice(i, i + batchSize);
    console.log(`[Batch ${batchNum}] Enriching episodes: ${batch.map(e => `#${e.id}`).join(', ')}...`);

    try {
      const enriched = await enrichBatch(batch);
      allEnriched.push(...enriched);
      console.log(`  OK: ${enriched.length} episodes enriched`);

      // Save after each batch (resume-safe)
      fs.writeFileSync(outputPath, JSON.stringify({
        metadata: {
          last_updated: new Date().toISOString(),
          total_enriched: allEnriched.length,
          model: getModelId('fast'),
        },
        episodes: allEnriched,
      }, null, 2));

      // Rate limit: wait between batches
      if (i + batchSize < remaining.length) {
        console.log(`  Waiting 2s...`);
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch (err) {
      console.error(`  Error on batch ${batchNum}:`, err);
      // Save progress and continue
      fs.writeFileSync(outputPath, JSON.stringify({
        metadata: {
          last_updated: new Date().toISOString(),
          total_enriched: allEnriched.length,
          model: getModelId('fast'),
          error_at_batch: batchNum,
        },
        episodes: allEnriched,
      }, null, 2));
    }
  }

  console.log(`\n=== DONE ===`);
  console.log(`Total enriched: ${allEnriched.length}`);
  console.log(`Saved to: ${outputPath}\n`);
}

// Generate quiz bank from enriched data
function generateQuizBank(): void {
  const enrichedPath = path.join(__dirname, '..', 'data', 'episodes-ai-enriched.json');
  const quizPath = path.join(__dirname, '..', 'data', 'quiz-bank.json');

  if (!fs.existsSync(enrichedPath)) {
    console.error('No enriched data found. Run enrichment first.');
    return;
  }

  const data = JSON.parse(fs.readFileSync(enrichedPath, 'utf-8'));
  const allQuiz: any[] = [];

  for (const ep of data.episodes) {
    if (ep.quiz && ep.quiz.length > 0) {
      for (const q of ep.quiz) {
        allQuiz.push({
          episode_id: ep.id,
          episode_title: ep.title,
          pillar: ep.pillar,
          difficulty: ep.difficulty,
          ...q,
        });
      }
    }
  }

  fs.writeFileSync(quizPath, JSON.stringify({
    metadata: {
      total_questions: allQuiz.length,
      generated_from: 'episodes-ai-enriched.json',
      generated_at: new Date().toISOString(),
    },
    questions: allQuiz,
  }, null, 2));

  console.log(`Quiz bank generated: ${allQuiz.length} questions saved to ${quizPath}`);
}

// CLI interface
const command = process.argv[2] || 'enrich';
const batchSize = parseInt(process.argv[3] || '10');

if (command === 'enrich') {
  enrichAllEpisodes(batchSize).catch(console.error);
} else if (command === 'quiz') {
  generateQuizBank();
} else {
  console.log('Usage:');
  console.log('  tsx src/enrichment.ts enrich [batchSize]  - Enrich episodes with AI');
  console.log('  tsx src/enrichment.ts quiz                - Generate quiz bank from enriched data');
}
