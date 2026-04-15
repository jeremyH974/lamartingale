import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import * as schema from './schema';

// ============================================================================
// Migration JSON → Postgres (idempotent)
// ============================================================================

const DATA = path.join(__dirname, '..', '..', 'data');
const loadJSON = <T>(file: string): T => JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf-8'));

async function main() {
  console.log('[COUCHE 1][MIGRATE] Starting JSON → Postgres migration');

  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql, { schema });

  // --- Load all JSON sources ---
  const indexData = loadJSON<{ episodes: any[] }>('episodes-complete-index.json');
  const enrichedData = loadJSON<{ episodes: any[] }>('episodes-enriched.json');
  const aiEnrichedData = loadJSON<{ episodes: any[] }>('episodes-ai-enriched.json');
  const mediaData = loadJSON<{ by_id: Record<string, any> }>('episodes-media.json');
  const expertsData = loadJSON<{ experts: any[] }>('experts.json');
  const quizData = loadJSON<{ questions: any[] }>('quiz-bank.json');
  const taxonomyData = loadJSON<{ pillars: any[] }>('taxonomy.json');
  const pathsData = loadJSON<{ learning_paths: any[] }>('learning-paths.json');

  // --- Build lookup maps ---
  const enrichedMap: Record<number, any> = {};
  for (const ep of enrichedData.episodes) {
    if (ep.id && !enrichedMap[ep.id]) enrichedMap[ep.id] = ep;
  }

  const aiEnrichedMap: Record<number, any> = {};
  for (const ep of aiEnrichedData.episodes) {
    if (ep.id) aiEnrichedMap[ep.id] = ep;
  }

  const diffMap: Record<string, string> = { DEB: 'DEBUTANT', INT: 'INTERMEDIAIRE', AVA: 'AVANCE' };

  // --- 1. Taxonomy ---
  console.log('[COUCHE 1][MIGRATE] Inserting taxonomy...');
  await sql`TRUNCATE taxonomy CASCADE`;
  for (const p of taxonomyData.pillars) {
    await db.insert(schema.taxonomy).values({
      pillar: p.id,
      name: p.name,
      color: p.color,
      icon: p.icon || '',
      episodeCount: p.episode_count,
      subThemes: p.sub_themes?.map((s: any) => s.name || s.id) || [],
    });
  }
  console.log(`  ✓ taxonomy: ${taxonomyData.pillars.length} piliers`);

  // --- 2. Guests (from experts.json) ---
  console.log('[COUCHE 1][MIGRATE] Inserting guests...');
  await sql`TRUNCATE guests CASCADE`;
  await sql`TRUNCATE guest_episodes CASCADE`;
  const guestIdMap: Record<string, number> = {};
  for (const ex of expertsData.experts) {
    const [inserted] = await db.insert(schema.guests).values({
      name: ex.name,
      company: ex.company || '',
      bio: ex.bio || '',
      specialty: ex.specialty || [],
      authorityScore: ex.authority_score || 1,
      episodesCount: ex.episodes?.length || 0,
    }).returning({ id: schema.guests.id });
    guestIdMap[ex.name] = inserted.id;
  }
  console.log(`  ✓ guests: ${expertsData.experts.length} experts`);

  // --- 3. Episodes ---
  console.log('[COUCHE 1][MIGRATE] Inserting episodes...');
  await sql`TRUNCATE episodes CASCADE`;
  const episodeIdMap: Record<number, number> = {}; // episodeNumber → db id

  for (const ep of indexData.episodes) {
    const enriched = enrichedMap[ep.id];
    const difficulty = diffMap[ep.difficulty] || ep.difficulty;

    // Slug from enriched data
    const slug = enriched?.slug || '';
    const url = enriched?.url || '';
    const abstract = enriched?.abstract || '';
    const dateStr = enriched?.publication_date || null;
    let dateCreated: Date | null = null;
    if (dateStr) {
      const parts = dateStr.split('.');
      if (parts.length === 3) {
        dateCreated = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
      } else {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) dateCreated = d;
      }
    }

    const [inserted] = await db.insert(schema.episodes).values({
      episodeNumber: ep.id,
      title: ep.title,
      slug,
      guest: ep.guest,
      pillar: ep.pillar,
      difficulty,
      dateCreated,
      abstract,
      articleUrl: url,
      url,
    }).returning({ id: schema.episodes.id });

    episodeIdMap[ep.id] = inserted.id;
  }
  console.log(`  ✓ episodes: ${indexData.episodes.length} records`);

  // --- 4. Guest-Episode relations ---
  console.log('[COUCHE 1][MIGRATE] Inserting guest-episode relations...');
  let geCount = 0;
  for (const ex of expertsData.experts) {
    const gId = guestIdMap[ex.name];
    if (!gId) continue;
    for (const epNum of (ex.episodes || [])) {
      const epId = episodeIdMap[epNum];
      if (!epId) continue;
      await db.insert(schema.guestEpisodes).values({ guestId: gId, episodeId: epId });
      geCount++;
    }
  }
  console.log(`  ✓ guest_episodes: ${geCount} relations`);

  // --- 5. Episodes Media ---
  console.log('[COUCHE 1][MIGRATE] Inserting episodes media...');
  await sql`TRUNCATE episodes_media CASCADE`;
  let mediaCount = 0;
  for (const [epNumStr, media] of Object.entries(mediaData.by_id)) {
    const epNum = parseInt(epNumStr);
    const epId = episodeIdMap[epNum];
    if (!epId) continue;
    await db.insert(schema.episodesMedia).values({
      episodeId: epId,
      thumbnail350: media.thumbnail_350 || null,
      thumbnailFull: media.thumbnail_full || null,
      audioPlayerUrl: media.audio_player || null,
    });
    mediaCount++;
  }
  console.log(`  ✓ episodes_media: ${mediaCount} records`);

  // --- 6. Episodes Enrichment ---
  console.log('[COUCHE 1][MIGRATE] Inserting episodes enrichment...');
  await sql`TRUNCATE episodes_enrichment CASCADE`;
  let enrichCount = 0;
  for (const ep of aiEnrichedData.episodes) {
    const epId = episodeIdMap[ep.id];
    if (!epId) continue;
    await db.insert(schema.episodesEnrichment).values({
      episodeId: epId,
      tags: ep.tags || [],
      subThemes: ep.sub_themes || [],
      searchText: ep.search_text || '',
      embedding: null, // couche 2
    });
    enrichCount++;
  }
  console.log(`  ✓ episodes_enrichment: ${enrichCount} records`);

  // --- 7. Quiz Questions ---
  console.log('[COUCHE 1][MIGRATE] Inserting quiz questions...');
  await sql`TRUNCATE quiz_questions CASCADE`;
  let quizCount = 0;
  for (const q of quizData.questions) {
    const epId = episodeIdMap[q.episode_id];
    await db.insert(schema.quizQuestions).values({
      episodeId: epId || null,
      question: q.question,
      options: q.options,
      correctAnswer: q.correct_answer,
      explanation: q.explanation || '',
      difficulty: q.difficulty || null,
      pillar: q.pillar || null,
    });
    quizCount++;
  }
  console.log(`  ✓ quiz_questions: ${quizCount} questions`);

  // --- 8. Learning Paths ---
  console.log('[COUCHE 1][MIGRATE] Inserting learning paths...');
  await sql`TRUNCATE learning_paths CASCADE`;
  for (const lp of pathsData.learning_paths) {
    await db.insert(schema.learningPaths).values({
      pathId: lp.id,
      name: lp.name,
      description: lp.description || '',
      difficulty: lp.difficulty || null,
      estimatedHours: lp.estimated_hours || 0,
      targetAudience: lp.target_audience || '',
      prerequisites: lp.prerequisites || [],
      outcomes: lp.outcomes || [],
      episodesOrdered: lp.episodes_ordered || [],
    });
  }
  console.log(`  ✓ learning_paths: ${pathsData.learning_paths.length} parcours`);

  // --- Validation ---
  console.log('\n[COUCHE 1][MIGRATE] === VALIDATION ===');
  const counts = await Promise.all([
    sql`SELECT count(*) as c FROM episodes`,
    sql`SELECT count(*) as c FROM guests`,
    sql`SELECT count(*) as c FROM episodes_media`,
    sql`SELECT count(*) as c FROM episodes_enrichment`,
    sql`SELECT count(*) as c FROM quiz_questions`,
    sql`SELECT count(*) as c FROM taxonomy`,
    sql`SELECT count(*) as c FROM learning_paths`,
    sql`SELECT count(*) as c FROM guest_episodes`,
  ]);

  const table = [
    ['episodes', counts[0][0].c, indexData.episodes.length],
    ['guests', counts[1][0].c, expertsData.experts.length],
    ['episodes_media', counts[2][0].c, Object.keys(mediaData.by_id).length],
    ['episodes_enrichment', counts[3][0].c, aiEnrichedData.episodes.length],
    ['quiz_questions', counts[4][0].c, quizData.questions.length],
    ['taxonomy', counts[5][0].c, taxonomyData.pillars.length],
    ['learning_paths', counts[6][0].c, pathsData.learning_paths.length],
    ['guest_episodes', counts[7][0].c, geCount],
  ];

  console.log('\n  Table                | DB     | JSON   | Match');
  console.log('  --------------------|--------|--------|------');
  let allOk = true;
  for (const [name, dbCount, jsonCount] of table) {
    const ok = Number(dbCount) >= Number(jsonCount);
    if (!ok) allOk = false;
    console.log(`  ${String(name).padEnd(20)}| ${String(dbCount).padStart(6)} | ${String(jsonCount).padStart(6)} | ${ok ? '✅' : '❌'}`);
  }

  console.log(`\n[COUCHE 1][MIGRATE] Migration ${allOk ? 'COMPLETE ✅' : 'PARTIAL ⚠️'}`);
}

main().catch(e => { console.error('[COUCHE 1][MIGRATE] FATAL:', e); process.exit(1); });
