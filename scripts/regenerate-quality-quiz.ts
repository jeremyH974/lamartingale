/**
 * Régénère des quiz substantiels (basés sur article_content + chapitres + takeaways)
 * pour les N épisodes les plus récents d'un tenant donné via Claude Haiku.
 *
 * Les quiz du template bidon existants ("Dans quel pilier se situe...") sont remplacés.
 *
 * Usage :
 *   PODCAST_ID=lamartingale npx tsx scripts/regenerate-quality-quiz.ts           # dry
 *   PODCAST_ID=lamartingale npx tsx scripts/regenerate-quality-quiz.ts --write   # DB
 *   PODCAST_ID=lamartingale npx tsx scripts/regenerate-quality-quiz.ts --write --limit 5
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { generateText } from 'ai';
import { getLLMFast, getModelId } from '../src/ai/llm';
import { getConfig } from '../src/config';

interface GeneratedQuestion {
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
  difficulty: 'DEBUTANT' | 'INTERMEDIAIRE' | 'AVANCE';
}

function parseQuestionsJSON(raw: string): GeneratedQuestion[] {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : raw).trim();
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start < 0 || end < 0) throw new Error(`Pas de tableau JSON trouvé dans la réponse:\n${raw.slice(0, 400)}`);
  const arr = JSON.parse(body.substring(start, end + 1));
  if (!Array.isArray(arr)) throw new Error('JSON parsé n\'est pas un tableau');
  for (const q of arr) {
    if (!q.question || !Array.isArray(q.options) || q.options.length !== 4 || typeof q.correct_index !== 'number') {
      throw new Error(`Question invalide : ${JSON.stringify(q).slice(0, 200)}`);
    }
    if (!['DEBUTANT', 'INTERMEDIAIRE', 'AVANCE'].includes(q.difficulty)) q.difficulty = 'INTERMEDIAIRE';
  }
  return arr;
}

async function genForEpisode(ep: any, links: any[]): Promise<GeneratedQuestion[]> {
  const chapters = Array.isArray(ep.chapters) ? ep.chapters.map((c: any) => c?.title).filter(Boolean) : [];
  const takeaways = Array.isArray(ep.key_takeaways) ? ep.key_takeaways : [];
  const article = (ep.article_content || '').replace(/\s+/g, ' ').substring(0, 6000);
  const mentions = links.slice(0, 10).map(l => l.label || l.url).filter(Boolean);

  const systemPrompt = `Tu es un rédacteur de quiz éducatif pour un podcast finance/patrimoine. Tu génères des questions substantielles, pas des questions méta sur le podcast lui-même. Chaque question teste une vraie notion enseignée dans l'épisode. Tu rends UNIQUEMENT un tableau JSON, pas de prose autour.`;

  const userPrompt = `Épisode #${ep.episode_number} — ${ep.title}
Invité : ${ep.guest || 'Non précisé'}
Pilier : ${ep.pillar}
${chapters.length ? `\nChapitres :\n- ${chapters.join('\n- ')}` : ''}
${takeaways.length ? `\nÀ retenir :\n- ${takeaways.slice(0, 8).join('\n- ')}` : ''}
${mentions.length ? `\nOutils/entreprises cités : ${mentions.join(', ')}` : ''}

Article (extrait) :
${article}

---

Génère 3 questions QCM substantielles sur le CONTENU de l'épisode. Interdits :
- Questions meta ("Dans quel pilier se situe...", "Qui est l'invité...")
- Questions triviales ("En quelle année...")
- Options farfelues ou comiques

Contraintes :
- 4 options plausibles par question, une seule correcte
- Explication de 1-2 phrases qui cite le raisonnement ou un fait de l'épisode
- Mix de difficultés (DEBUTANT / INTERMEDIAIRE / AVANCE)
- Style direct, factuel, français correct

Format exact (rien d'autre) :
\`\`\`json
[
  {
    "question": "…",
    "options": ["…","…","…","…"],
    "correct_index": 0,
    "explanation": "…",
    "difficulty": "INTERMEDIAIRE"
  },
  ...
]
\`\`\``;

  const { text } = await generateText({
    model: getLLMFast(),
    system: systemPrompt,
    prompt: userPrompt,
    maxOutputTokens: 1500,
    temperature: 0.4,
  });

  return parseQuestionsJSON(text);
}

(async () => {
  const write = process.argv.includes('--write');
  const limitIdx = process.argv.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(process.argv[limitIdx + 1]) || 5 : 5;

  const cfg = getConfig();
  const tenant = cfg.database.tenantId;
  const sql = neon(process.env.DATABASE_URL!);

  console.log(`[QUIZ-QUALITY] tenant=${tenant} limit=${limit} write=${write} model=${getModelId('fast')}\n`);

  const episodes = (await sql`
    SELECT id, episode_number, title, guest, pillar,
           article_content, chapters, key_takeaways
    FROM episodes
    WHERE tenant_id = ${tenant}
      AND (episode_type='full' OR episode_type IS NULL)
    ORDER BY episode_number DESC
    LIMIT ${limit}
  `) as any[];

  if (!episodes.length) { console.error('Aucun épisode trouvé'); return; }

  const epIds = episodes.map(e => e.id);
  const allLinks = (await sql`
    SELECT episode_id, label, url, link_type
    FROM episode_links
    WHERE tenant_id = ${tenant} AND episode_id = ANY(${epIds})
      AND link_type IN ('tool','company','resource')
    ORDER BY id
  `) as any[];
  const linksByEp = new Map<number, any[]>();
  for (const l of allLinks) {
    const list = linksByEp.get(l.episode_id) || [];
    list.push(l);
    linksByEp.set(l.episode_id, list);
  }

  const allGenerated: { ep: any; questions: GeneratedQuestion[] }[] = [];

  for (const ep of episodes) {
    try {
      console.log(`→ #${ep.episode_number} ${ep.title.substring(0, 60)}...`);
      const questions = await genForEpisode(ep, linksByEp.get(ep.id) || []);
      console.log(`  ✓ ${questions.length} questions générées`);
      allGenerated.push({ ep, questions });
    } catch (e: any) {
      console.error(`  ✗ ${e.message}`);
    }
  }

  console.log(`\n[QUIZ-QUALITY] Total généré : ${allGenerated.reduce((s, g) => s + g.questions.length, 0)} questions pour ${allGenerated.length} épisodes`);

  if (!write) {
    console.log('\n=== APERÇU (dry-run) ===\n');
    for (const g of allGenerated.slice(0, 2)) {
      console.log(`#${g.ep.episode_number} — ${g.ep.title}`);
      for (const q of g.questions) {
        console.log(`  Q: ${q.question}`);
        for (let i = 0; i < q.options.length; i++) {
          console.log(`    ${i === q.correct_index ? '✓' : ' '} ${q.options[i]}`);
        }
        console.log(`  💡 ${q.explanation}\n`);
      }
    }
    console.log('(--write pour insérer en DB)');
    return;
  }

  // Wipe existing quiz for these episodes, then insert new ones
  let deleted = 0, inserted = 0;
  for (const g of allGenerated) {
    const del = await sql`DELETE FROM quiz_questions WHERE tenant_id = ${tenant} AND episode_id = ${g.ep.id} RETURNING id` as any[];
    deleted += del.length;
    for (const q of g.questions) {
      await sql`
        INSERT INTO quiz_questions (tenant_id, episode_id, question, options, correct_answer, explanation, difficulty, pillar)
        VALUES (${tenant}, ${g.ep.id}, ${q.question}, ${JSON.stringify(q.options)}::jsonb, ${q.correct_index}, ${q.explanation}, ${q.difficulty}, ${g.ep.pillar})
      `;
      inserted++;
    }
  }
  console.log(`\n[QUIZ-QUALITY] DB updated: deleted ${deleted} old rows, inserted ${inserted} new rows.`);
})();
