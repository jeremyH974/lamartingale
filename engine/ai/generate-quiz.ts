/**
 * Quiz generator générique multi-tenant.
 *
 * Génère 2 questions par épisode full :
 *   Q1 — Dans quel pilier se situe cet épisode ? (tirage parmi cfg.taxonomy.pillars)
 *   Q2 — Qui est l'invité de cet épisode ? (tirage parmi top guests du tenant)
 *
 * Usage :
 *   PODCAST_ID=gdiy npx tsx src/ai/generate-quiz.ts             # dry-run
 *   PODCAST_ID=gdiy npx tsx src/ai/generate-quiz.ts --write     # insert DB
 *   PODCAST_ID=gdiy npx tsx src/ai/generate-quiz.ts --write --wipe   # reset tenant d'abord
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { getConfig } from '../config';

const sql = neon(process.env.DATABASE_URL!);

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

(async () => {
  const write = process.argv.includes('--write');
  const wipe = process.argv.includes('--wipe');
  const cfg = getConfig();
  const tenant = cfg.database.tenantId;
  const pillars = cfg.taxonomy.pillars ?? [];
  if (!pillars.length) { console.error(`[${tenant}] taxonomy.pillars vide, abort.`); return; }
  const pillarNames = pillars.map((p) => p.name);
  const pillarById = new Map(pillars.map((p) => [p.id, p.name]));

  // Fallback : si `guest` est vide (tenants sans scraping article, ex. GDIY),
  // utilise `guest_from_title` extrait du titre RSS.
  const topGuestRows = (await sql`
    SELECT COALESCE(NULLIF(guest,''), guest_from_title) as g, count(*)::int as c FROM episodes
    WHERE tenant_id=${tenant}
      AND COALESCE(NULLIF(guest,''), guest_from_title) IS NOT NULL
      AND (episode_type='full' OR episode_type IS NULL)
    GROUP BY g ORDER BY c DESC LIMIT 20
  `) as { g: string; c: number }[];
  const topGuests = topGuestRows.map((r) => r.g);
  if (topGuests.length < 4) {
    console.error(`[${tenant}] <4 top guests, abort.`);
    return;
  }

  const episodes = (await sql`
    SELECT id, episode_number, title,
           COALESCE(NULLIF(guest,''), guest_from_title) as guest,
           pillar FROM episodes
    WHERE tenant_id=${tenant} AND (episode_type='full' OR episode_type IS NULL)
    ORDER BY episode_number
  `) as { id: number; episode_number: number; title: string; guest: string | null; pillar: string | null }[];

  const batch: any[] = [];
  let skippedNoGuest = 0, skippedNoPillar = 0;

  for (const ep of episodes) {
    const pillarName = ep.pillar ? pillarById.get(ep.pillar) ?? ep.pillar : null;
    if (pillarName) {
      const wrong = pillarNames.filter((p) => p !== pillarName);
      const options = shuffle([pillarName, ...shuffle(wrong).slice(0, 3)]);
      batch.push({
        episode_id: ep.id,
        tenant_id: tenant,
        question: `Dans quel pilier thématique se situe l'épisode #${ep.episode_number} — ${ep.title} ?`,
        options,
        correct_answer: options.indexOf(pillarName),
        explanation: `Cet épisode traite de ${pillarName.toLowerCase()}.`,
        difficulty: 'INTERMEDIAIRE',
        pillar: ep.pillar,
      });
    } else skippedNoPillar++;

    if (ep.guest && ep.guest.trim()) {
      const wrong = topGuests.filter((g) => g !== ep.guest);
      const options = shuffle([ep.guest, ...shuffle(wrong).slice(0, 3)]);
      batch.push({
        episode_id: ep.id,
        tenant_id: tenant,
        question: `Qui est l'invité de l'épisode #${ep.episode_number} — « ${ep.title} » ?`,
        options,
        correct_answer: options.indexOf(ep.guest),
        explanation: `L'invité de cet épisode est ${ep.guest}.`,
        difficulty: 'DEBUTANT',
        pillar: ep.pillar,
      });
    } else skippedNoGuest++;
  }

  console.log(`[${tenant}] Prepared ${batch.length} quiz questions pour ${episodes.length} eps (skip: ${skippedNoPillar} pillar, ${skippedNoGuest} guest).`);
  if (!write) {
    console.log('(dry-run — use --write pour insérer)');
    console.log('Sample:', batch.slice(0, 2));
    return;
  }

  if (wipe) {
    const del = await sql`DELETE FROM quiz_questions WHERE tenant_id=${tenant} RETURNING id`;
    console.log(`[${tenant}] wiped ${(del as any[]).length} existing rows`);
  }

  let inserted = 0;
  for (const q of batch) {
    await sql`
      INSERT INTO quiz_questions (tenant_id, episode_id, question, options, correct_answer, explanation, difficulty, pillar)
      VALUES (${q.tenant_id}, ${q.episode_id}, ${q.question}, ${JSON.stringify(q.options)}::jsonb, ${q.correct_answer}, ${q.explanation}, ${q.difficulty}, ${q.pillar})
    `;
    inserted++;
  }
  console.log(`[${tenant}] inserted ${inserted} quiz questions.`);
})();
