/**
 * Régénère des quiz substantiels (basés sur article_content + chapitres + takeaways)
 * pour les épisodes d'un tenant donné via Claude Haiku 4.5.
 *
 * Les quiz du template bidon existants ("Dans quel pilier se situe...") sont remplacés.
 *
 * Usage :
 *   PODCAST_ID=lamartingale npx tsx scripts/regenerate-quality-quiz.ts --all           # dry, tous les eps
 *   PODCAST_ID=lamartingale npx tsx scripts/regenerate-quality-quiz.ts --all --write   # batch complet en DB
 *   PODCAST_ID=lamartingale npx tsx scripts/regenerate-quality-quiz.ts --limit 5       # dry, 5 eps les + récents
 *   PODCAST_ID=lamartingale npx tsx scripts/regenerate-quality-quiz.ts --limit 5 --write
 *
 * Calibration Rail 1 (24/04/26) : 5 questions/ep, maxOutputTokens 2500,
 * retry ×2 avec backoff, progress log tous les 50 eps avec coût cumulé.
 * STOP intermédiaire automatique si coût cumulé > 1.2× estimé pré-batch.
 */
import dotenv from 'dotenv';
// override:true pour que .env prime sur les vars shell pré-existantes
// (compat sandbox type Claude Code qui injecte ANTHROPIC_API_KEY="").
dotenv.config({ override: true });
import { neon } from '@neondatabase/serverless';
import { generateText } from 'ai';
import { getLLMFast, getModelId } from '@engine/ai/llm';
import { getConfig } from '@engine/config';

// Haiku 4.5 pricing officiel (24/04/26)
const PRICE_INPUT_PER_1M = 1.0;
const PRICE_OUTPUT_PER_1M = 5.0;

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

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

async function genForEpisode(ep: any, links: any[]): Promise<{ questions: GeneratedQuestion[]; usage: any }> {
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

Génère 5 questions QCM substantielles sur le CONTENU de l'épisode. Interdits :
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

  const result = await generateText({
    model: getLLMFast(),
    system: systemPrompt,
    prompt: userPrompt,
    maxOutputTokens: 2500, // 5 questions + marge sérialisation JSON
    temperature: 0.4,
  });

  return { questions: parseQuestionsJSON(result.text), usage: result.usage };
}

// Retry wrapper : ×2 tentatives après le 1er fail, backoff exponentiel.
async function genWithRetry(ep: any, links: any[], maxAttempts = 3): Promise<{ questions: GeneratedQuestion[]; usage: any }> {
  let lastErr: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await genForEpisode(ep, links);
    } catch (e: any) {
      lastErr = e;
      if (attempt < maxAttempts) {
        const backoff = 2 ** (attempt - 1) * 1000; // 1s, 2s
        console.warn(`    [retry ${attempt}/${maxAttempts - 1}] ${e.message?.slice(0, 120)} — backoff ${backoff}ms`);
        await sleep(backoff);
      }
    }
  }
  throw lastErr;
}

(async () => {
  const write = process.argv.includes('--write');
  const all = process.argv.includes('--all');
  const limitIdx = process.argv.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(process.argv[limitIdx + 1]) || 5 : 5;

  // Budget guardrail pré-batch (override via --max-cost <usd>)
  const maxCostIdx = process.argv.indexOf('--max-cost');
  const maxCost = maxCostIdx >= 0 ? parseFloat(process.argv[maxCostIdx + 1]) || 3.0 : 3.0;

  const cfg = getConfig();
  const tenant = cfg.database.tenantId;
  const sql = neon(process.env.DATABASE_URL!);

  const mode = all ? 'ALL' : `LIMIT ${limit}`;
  console.log(`[QUIZ-QUALITY] tenant=${tenant} mode=${mode} write=${write} model=${getModelId('fast')} maxCost=$${maxCost}\n`);

  const episodes = all
    ? (await sql`
        SELECT id, episode_number, title, guest, pillar,
               article_content, chapters, key_takeaways
        FROM episodes
        WHERE tenant_id = ${tenant}
          AND (episode_type='full' OR episode_type IS NULL)
        ORDER BY episode_number ASC
      `) as any[]
    : (await sql`
        SELECT id, episode_number, title, guest, pillar,
               article_content, chapters, key_takeaways
        FROM episodes
        WHERE tenant_id = ${tenant}
          AND (episode_type='full' OR episode_type IS NULL)
        ORDER BY episode_number DESC
        LIMIT ${limit}
      `) as any[];

  if (!episodes.length) { console.error('Aucun épisode trouvé'); return; }

  const epIds = episodes.map((e) => e.id);
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

  const t0 = Date.now();
  let totalInput = 0, totalOutput = 0, totalCost = 0;
  let succeeded = 0, skipped = 0, deleted = 0, inserted = 0;
  const failedEps: Array<{ id: number; episode_number: number; reason: string }> = [];

  for (let i = 0; i < episodes.length; i++) {
    const ep = episodes[i];
    const idx = i + 1;
    const label = `#${ep.episode_number}`.padEnd(5);
    process.stdout.write(`[${idx}/${episodes.length}] ${label} ${ep.title.substring(0, 55).padEnd(55)} `);

    try {
      const { questions, usage } = await genWithRetry(ep, linksByEp.get(ep.id) || []);

      const inTok = Number(usage?.inputTokens ?? usage?.promptTokens ?? 0);
      const outTok = Number(usage?.outputTokens ?? usage?.completionTokens ?? 0);
      const cost = (inTok / 1e6) * PRICE_INPUT_PER_1M + (outTok / 1e6) * PRICE_OUTPUT_PER_1M;
      totalInput += inTok;
      totalOutput += outTok;
      totalCost += cost;

      if (write) {
        const del = (await sql`DELETE FROM quiz_questions WHERE tenant_id = ${tenant} AND episode_id = ${ep.id} RETURNING id`) as any[];
        deleted += del.length;
        for (const q of questions) {
          await sql`
            INSERT INTO quiz_questions (tenant_id, episode_id, question, options, correct_answer, explanation, difficulty, pillar)
            VALUES (${tenant}, ${ep.id}, ${q.question}, ${JSON.stringify(q.options)}::jsonb, ${q.correct_index}, ${q.explanation}, ${q.difficulty}, ${ep.pillar})
          `;
          inserted++;
        }
      }
      succeeded++;
      console.log(`✓ ${questions.length}q in=${inTok} out=${outTok} $${cost.toFixed(4)}`);
    } catch (e: any) {
      skipped++;
      const reason = String(e?.message || e).slice(0, 200);
      failedEps.push({ id: ep.id, episode_number: ep.episode_number, reason });
      console.log(`✗ FAIL ${reason.slice(0, 80)}`);
    }

    // Progress log tous les 50 eps + STOP intermédiaire si budget dérape.
    if (idx % 50 === 0 || idx === episodes.length) {
      const elapsed = (Date.now() - t0) / 1000;
      const epsPerSec = idx / elapsed;
      const remaining = episodes.length - idx;
      const eta = remaining / epsPerSec;
      console.log(`\n--- [progress] ${idx}/${episodes.length} · ok=${succeeded} fail=${skipped} · cost=$${totalCost.toFixed(4)} · ${elapsed.toFixed(0)}s · ETA ${(eta / 60).toFixed(1)}min ---\n`);

      if (totalCost > maxCost) {
        console.error(`[STOP] Coût cumulé $${totalCost.toFixed(4)} > seuil $${maxCost}. Arrêt intermédiaire.`);
        break;
      }
    }
  }

  const totalDur = (Date.now() - t0) / 1000;
  console.log(`\n==========================================================`);
  console.log(`[QUIZ-QUALITY] BATCH ${write ? 'WRITE' : 'DRY-RUN'} — tenant=${tenant}`);
  console.log(`==========================================================`);
  console.log(`Eps traités    : ${succeeded + skipped}/${episodes.length}`);
  console.log(`Eps réussis    : ${succeeded}`);
  console.log(`Eps skipped    : ${skipped}${skipped ? ` (${(skipped / episodes.length * 100).toFixed(1)}%)` : ''}`);
  console.log(`Tokens in      : ${totalInput.toLocaleString()}`);
  console.log(`Tokens out     : ${totalOutput.toLocaleString()}`);
  console.log(`Coût total     : $${totalCost.toFixed(4)}`);
  console.log(`Durée totale   : ${(totalDur / 60).toFixed(1)} min`);
  if (write) {
    console.log(`DB deleted rows: ${deleted}`);
    console.log(`DB inserted q  : ${inserted}`);
  }
  if (failedEps.length) {
    console.log(`\n[QUIZ-QUALITY] ${failedEps.length} ep(s) failed après retry :`);
    for (const f of failedEps) console.log(`  ep_id=${f.id} #${f.episode_number} → ${f.reason.slice(0, 150)}`);
  }

  if (!write) {
    console.log(`\n(dry-run — pass --write pour insérer en DB)`);
  }
})();
