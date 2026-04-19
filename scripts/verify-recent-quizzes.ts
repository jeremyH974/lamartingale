import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

// Récupère les 5 épisodes les plus récents du tenant `lamartingale` et affiche
// 1 quiz par épisode pour validation manuelle avant la démo.
// Usage : npx tsx scripts/verify-recent-quizzes.ts
// Pour marquer un quiz comme vérifié : UPDATE quiz_questions SET verified = true WHERE id = X;

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const TENANT = 'lamartingale';

  const episodes = await sql`
    SELECT id, episode_number, title, guest, date_created
    FROM episodes
    WHERE tenant_id = ${TENANT}
      AND (episode_type='full' OR episode_type IS NULL)
    ORDER BY episode_number DESC
    LIMIT 5
  ` as any[];

  console.log(`\n=== 5 ÉPISODES LES PLUS RÉCENTS — ${TENANT} ===\n`);

  for (const ep of episodes) {
    console.log(`\n┌─ #${ep.episode_number} — ${ep.title}`);
    console.log(`│  Invité : ${ep.guest || '(aucun)'}  ·  ${ep.date_created ? new Date(ep.date_created).toISOString().slice(0, 10) : 'date inconnue'}`);

    const quizzes = await sql`
      SELECT id, question, options, correct_answer, explanation, pillar, difficulty
      FROM quiz_questions
      WHERE tenant_id = ${TENANT} AND episode_id = ${ep.id}
      ORDER BY id
      LIMIT 1
    ` as any[];

    if (!quizzes.length) {
      console.log(`│  ⚠ Aucun quiz pour cet épisode`);
      continue;
    }

    const q = quizzes[0];
    console.log(`│`);
    console.log(`│  QUIZ #${q.id} (${q.pillar} · ${q.difficulty})`);
    console.log(`│  Q : ${q.question}`);
    const opts = Array.isArray(q.options) ? q.options : [];
    for (let i = 0; i < opts.length; i++) {
      const marker = i === q.correct_answer ? '✓' : ' ';
      console.log(`│    ${marker} ${String.fromCharCode(65 + i)}. ${opts[i]}`);
    }
    if (q.explanation) console.log(`│  💡 ${q.explanation.substring(0, 200)}`);
    console.log(`└─`);
  }

  console.log(`\n\nPour marquer un quiz comme vérifié :`);
  console.log(`  UPDATE quiz_questions SET verified = true WHERE id IN (...);`);
  console.log(`(la colonne 'verified' n'existe peut-être pas encore — à ajouter si besoin)\n`);
}

main().catch(e => { console.error('[VERIFY-QUIZ] FATAL:', e); process.exit(1); });
