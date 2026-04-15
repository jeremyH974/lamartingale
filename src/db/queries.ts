import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, ilike, or, sql, desc, asc, inArray, and } from 'drizzle-orm';
import * as s from './schema';

// ============================================================================
// Drizzle query layer — returns same shapes as the JSON-based API
// ============================================================================

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('[DB] DATABASE_URL not set');
  return drizzle(neon(url), { schema: s });
}

let _db: ReturnType<typeof getDb> | null = null;
function db() { if (!_db) _db = getDb(); return _db; }

// ---- Episodes ----

export async function getEpisodes(opts: {
  pillar?: string; difficulty?: string; search?: string; page?: number; limit?: number;
}) {
  const { pillar, difficulty, search, page = 1, limit = 20 } = opts;
  const sqlInstance = neon(process.env.DATABASE_URL!);

  const conditions: any[] = [];
  if (pillar) conditions.push(eq(s.episodes.pillar, pillar));
  if (difficulty) conditions.push(eq(s.episodes.difficulty, difficulty));

  let rows;
  if (search) {
    const q = `%${search}%`;
    rows = await db().select().from(s.episodes)
      .leftJoin(s.episodesMedia, eq(s.episodes.id, s.episodesMedia.episodeId))
      .leftJoin(s.episodesEnrichment, eq(s.episodes.id, s.episodesEnrichment.episodeId))
      .where(and(
        ...conditions,
        or(
          ilike(s.episodes.title, q),
          ilike(s.episodes.guest, q),
          ilike(s.episodesEnrichment.searchText, q),
        ),
      ))
      .orderBy(desc(s.episodes.episodeNumber))
      .limit(limit).offset((page - 1) * limit);
  } else {
    rows = await db().select().from(s.episodes)
      .leftJoin(s.episodesMedia, eq(s.episodes.id, s.episodesMedia.episodeId))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(s.episodes.episodeNumber))
      .limit(limit).offset((page - 1) * limit);
  }

  // Get total count
  const [countResult] = conditions.length
    ? await db().select({ count: sql<number>`count(*)` }).from(s.episodes).where(and(...conditions))
    : await db().select({ count: sql<number>`count(*)` }).from(s.episodes);
  const total = Number(countResult.count);

  const episodes = rows.map(r => ({
    id: r.episodes.episodeNumber,
    title: r.episodes.title,
    guest_name: r.episodes.guest || '',
    guest_company: '',
    format: 'INTERVIEW',
    pillar: r.episodes.pillar,
    sub_theme: '',
    tags: [],
    difficulty: r.episodes.difficulty || 'INTERMEDIAIRE',
    learning_paths: [],
    url: r.episodes.url || '',
    thumbnail: r.episodes_media?.thumbnail350 || null,
  }));

  return { total, page, limit, pages: Math.ceil(total / limit), episodes };
}

export async function getEpisodeById(episodeNumber: number) {
  const [row] = await db().select().from(s.episodes)
    .leftJoin(s.episodesMedia, eq(s.episodes.id, s.episodesMedia.episodeId))
    .where(eq(s.episodes.episodeNumber, episodeNumber));

  if (!row) return null;

  const episode = {
    id: row.episodes.episodeNumber,
    title: row.episodes.title,
    guest_name: row.episodes.guest || '',
    guest_company: row.episodes.guestCompany || '',
    guest_bio: row.episodes.guestBio || '',
    format: 'INTERVIEW',
    pillar: row.episodes.pillar,
    sub_theme: '',
    tags: [],
    difficulty: row.episodes.difficulty || 'INTERMEDIAIRE',
    learning_paths: [],
    url: row.episodes.url || '',
    abstract: row.episodes.abstract || '',
    key_takeaways: row.episodes.keyTakeaways || [],
    related_episodes: row.episodes.relatedEpisodes || [],
    external_references: row.episodes.externalReferences || [],
    community_rating: row.episodes.communityRating || null,
    sponsor: row.episodes.sponsor || null,
    publication_date: row.episodes.dateCreated?.toISOString() || null,
    thumbnail: row.episodes_media?.thumbnail350 || null,
    thumbnail_full: row.episodes_media?.thumbnailFull || null,
  };

  // Related episodes (same pillar)
  const related = await db().select().from(s.episodes)
    .leftJoin(s.episodesMedia, eq(s.episodes.id, s.episodesMedia.episodeId))
    .where(and(
      eq(s.episodes.pillar, row.episodes.pillar),
      sql`${s.episodes.episodeNumber} != ${episodeNumber}`,
    ))
    .orderBy(desc(s.episodes.episodeNumber))
    .limit(5);

  const relatedEps = related.map(r => ({
    id: r.episodes.episodeNumber,
    title: r.episodes.title,
    guest_name: r.episodes.guest || '',
    pillar: r.episodes.pillar,
    difficulty: r.episodes.difficulty || 'INTERMEDIAIRE',
    thumbnail: r.episodes_media?.thumbnail350 || null,
  }));

  // Audio player
  const audioPlayer = row.episodes_media?.audioPlayerUrl || null;

  // Expert
  const guestEps = await db().select().from(s.guestEpisodes)
    .innerJoin(s.guests, eq(s.guestEpisodes.guestId, s.guests.id))
    .where(eq(s.guestEpisodes.episodeId, row.episodes.id))
    .limit(1);
  const expert = guestEps.length ? {
    name: guestEps[0].guests.name,
    company: guestEps[0].guests.company,
    specialty: guestEps[0].guests.specialty,
    authority_score: guestEps[0].guests.authorityScore,
  } : null;

  return { episode, related: relatedEps, expert, audio_player: audioPlayer };
}

// ---- Experts ----

export async function getExperts(specialty?: string) {
  let rows;
  if (specialty) {
    const q = `%${specialty}%`;
    rows = await db().select().from(s.guests)
      .where(sql`array_to_string(${s.guests.specialty}, ',') ILIKE ${q}`)
      .orderBy(desc(s.guests.authorityScore));
  } else {
    rows = await db().select().from(s.guests)
      .orderBy(desc(s.guests.authorityScore));
  }

  return {
    total: rows.length,
    experts: rows.map(r => ({
      id: r.name.toLowerCase().replace(/\s+/g, '-'),
      name: r.name,
      company: r.company || '',
      specialty: r.specialty || [],
      episodes: [],  // Will be filled below
      authority_score: r.authorityScore || 1,
      bio: r.bio || '',
    })),
  };
}

export async function getExpertById(expertId: string) {
  const name = expertId.replace(/-/g, ' ');
  const [row] = await db().select().from(s.guests)
    .where(ilike(s.guests.name, `%${name}%`))
    .limit(1);
  if (!row) return null;

  const eps = await db().select({ episodeId: s.guestEpisodes.episodeId })
    .from(s.guestEpisodes)
    .where(eq(s.guestEpisodes.guestId, row.id));

  // Get actual episode numbers
  const epIds = eps.map(e => e.episodeId).filter(Boolean) as number[];
  let epNumbers: number[] = [];
  if (epIds.length) {
    const epRows = await db().select({ epNum: s.episodes.episodeNumber })
      .from(s.episodes)
      .where(inArray(s.episodes.id, epIds));
    epNumbers = epRows.map(r => r.epNum!);
  }

  return {
    expert: {
      id: expertId,
      name: row.name,
      company: row.company || '',
      specialty: row.specialty || [],
      episodes: epNumbers,
      authority_score: row.authorityScore || 1,
      bio: row.bio || '',
    },
  };
}

// ---- Paths ----

export async function getPaths() {
  const rows = await db().select().from(s.learningPaths);
  return {
    total: rows.length,
    paths: rows.map(r => ({
      id: r.pathId,
      name: r.name,
      description: r.description || '',
      difficulty: r.difficulty || 'INTERMEDIAIRE',
      estimated_hours: r.estimatedHours || 0,
      episode_count: (r.episodesOrdered as any[])?.length || 0,
      target_audience: r.targetAudience || '',
      outcomes: r.outcomes || [],
    })),
  };
}

export async function getPathById(pathId: string) {
  const [row] = await db().select().from(s.learningPaths)
    .where(eq(s.learningPaths.pathId, pathId));
  if (!row) return null;

  // Resolve episodes
  const steps = (row.episodesOrdered as any[] || []).map((step: any) => ({
    ...step,
    episode: null, // Will be resolved below
  }));

  // Batch fetch episodes
  const epNums = steps.map((step: any) => step.episode_id).filter(Boolean);
  if (epNums.length) {
    const epRows = await db().select().from(s.episodes)
      .where(inArray(s.episodes.episodeNumber, epNums));
    const epMap: Record<number, any> = {};
    for (const ep of epRows) {
      epMap[ep.episodeNumber!] = {
        id: ep.episodeNumber,
        title: ep.title,
        guest_name: ep.guest || '',
        pillar: ep.pillar,
        difficulty: ep.difficulty,
      };
    }
    for (const step of steps) {
      step.episode = epMap[step.episode_id] || null;
    }
  }

  return {
    path: {
      id: row.pathId,
      name: row.name,
      description: row.description || '',
      difficulty: row.difficulty || 'INTERMEDIAIRE',
      estimated_hours: row.estimatedHours || 0,
      episodes_ordered: row.episodesOrdered,
      target_audience: row.targetAudience || '',
      outcomes: row.outcomes || [],
      steps,
    },
  };
}

// ---- Taxonomy ----

export async function getTaxonomy() {
  const rows = await db().select().from(s.taxonomy);
  return {
    pillars: rows.map(r => ({
      id: r.pillar,
      name: r.name || r.pillar,
      color: r.color || '#666',
      icon: r.icon || '',
      episode_count: r.episodeCount || 0,
      sub_themes: (r.subThemes || []).map((name: string) => ({ id: name.toLowerCase().replace(/\s+/g, '_'), name, episodes: [] })),
    })),
  };
}

// ---- Stats ----

export async function getStats() {
  const sqlInstance = neon(process.env.DATABASE_URL!);
  const [epCount] = await sqlInstance`SELECT count(*) as c FROM episodes`;
  const [gCount] = await sqlInstance`SELECT count(*) as c FROM guests`;
  const [pCount] = await sqlInstance`SELECT count(*) as c FROM learning_paths`;
  const [tCount] = await sqlInstance`SELECT count(*) as c FROM taxonomy`;
  const [qCount] = await sqlInstance`SELECT count(*) as c FROM quiz_questions`;

  const pillarRows = await sqlInstance`SELECT pillar, count(*) as c FROM episodes GROUP BY pillar ORDER BY c DESC`;
  const diffRows = await sqlInstance`SELECT difficulty, count(*) as c FROM episodes GROUP BY difficulty`;

  const topExperts = await sqlInstance`SELECT name, authority_score, episodes_count FROM guests ORDER BY authority_score DESC LIMIT 5`;

  return {
    total_episodes: Number(epCount.c),
    total_experts: Number(gCount.c),
    total_paths: Number(pCount.c),
    total_pillars: Number(tCount.c),
    total_quiz: Number(qCount.c),
    episodes_by_pillar: Object.fromEntries(pillarRows.map((r: any) => [r.pillar, Number(r.c)])),
    episodes_by_difficulty: Object.fromEntries(diffRows.map((r: any) => [r.difficulty, Number(r.c)])),
    top_experts: topExperts.map((r: any) => ({ name: r.name, score: r.authority_score, episodes: r.episodes_count })),
  };
}

// ---- Quiz ----

export async function getQuiz(opts: { pillar?: string; difficulty?: string; limit?: number }) {
  const { pillar, difficulty, limit = 10 } = opts;
  const conditions: any[] = [];
  if (pillar) conditions.push(eq(s.quizQuestions.pillar, pillar));
  if (difficulty) conditions.push(eq(s.quizQuestions.difficulty, difficulty));

  const rows = await db().select().from(s.quizQuestions)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(sql`RANDOM()`)
    .limit(limit);

  return {
    total_available: rows.length,
    count: rows.length,
    questions: rows.map(r => ({
      episode_id: null, // need to resolve
      question: r.question,
      options: r.options,
      correct_answer: r.correctAnswer,
      explanation: r.explanation || '',
      difficulty: r.difficulty || '',
      pillar: r.pillar || '',
    })),
  };
}

export async function getQuizByEpisode(episodeNumber: number) {
  const [ep] = await db().select({ id: s.episodes.id }).from(s.episodes)
    .where(eq(s.episodes.episodeNumber, episodeNumber));
  if (!ep) return { episode_id: episodeNumber, count: 0, questions: [] };

  const rows = await db().select().from(s.quizQuestions)
    .where(eq(s.quizQuestions.episodeId, ep.id));

  return {
    episode_id: episodeNumber,
    count: rows.length,
    questions: rows.map(r => ({
      question: r.question,
      options: r.options,
      correct_answer: r.correctAnswer,
      explanation: r.explanation || '',
    })),
  };
}

// ---- Enriched ----

export async function getEnrichedById(episodeNumber: number) {
  const [row] = await db().select().from(s.episodes)
    .innerJoin(s.episodesEnrichment, eq(s.episodes.id, s.episodesEnrichment.episodeId))
    .where(eq(s.episodes.episodeNumber, episodeNumber));
  if (!row) return null;

  return {
    id: row.episodes.episodeNumber,
    tags: row.episodes_enrichment.tags || [],
    sub_themes: row.episodes_enrichment.subThemes || [],
    search_text: row.episodes_enrichment.searchText || '',
  };
}

// ---- Search ----

export async function searchAll(query: string) {
  const q = `%${query}%`;

  const matchedEpisodes = await db().select().from(s.episodes)
    .leftJoin(s.episodesEnrichment, eq(s.episodes.id, s.episodesEnrichment.episodeId))
    .where(or(
      ilike(s.episodes.title, q),
      ilike(s.episodes.guest, q),
      ilike(s.episodesEnrichment.searchText, q),
    ))
    .orderBy(desc(s.episodes.episodeNumber))
    .limit(20);

  const matchedExperts = await db().select().from(s.guests)
    .where(or(
      ilike(s.guests.name, q),
      ilike(s.guests.company, q),
    ))
    .limit(10);

  const matchedPaths = await db().select().from(s.learningPaths)
    .where(or(
      ilike(s.learningPaths.name, q),
      ilike(s.learningPaths.description, q),
    ));

  return {
    query,
    episodes: matchedEpisodes.map(r => ({
      id: r.episodes.episodeNumber,
      title: r.episodes.title,
      guest_name: r.episodes.guest || '',
      pillar: r.episodes.pillar,
      difficulty: r.episodes.difficulty,
      tags: r.episodes_enrichment?.tags || [],
      sub_themes: r.episodes_enrichment?.subThemes || [],
    })),
    experts: matchedExperts.map(r => ({
      id: r.name.toLowerCase().replace(/\s+/g, '-'),
      name: r.name,
      company: r.company || '',
      specialty: r.specialty || [],
    })),
    paths: matchedPaths.map(r => ({
      id: r.pathId,
      name: r.name,
      description: r.description || '',
    })),
  };
}

// ---- Tags ----

export async function getTags() {
  const sqlInstance = neon(process.env.DATABASE_URL!);
  const rows = await sqlInstance`
    SELECT tag, count(*) as c
    FROM episodes_enrichment, unnest(tags) AS tag
    GROUP BY tag
    ORDER BY c DESC
  `;

  return {
    total_tags: rows.length,
    tags: rows.map((r: any) => ({ tag: r.tag, count: Number(r.c) })),
  };
}

// ---- Media ----

export async function getMediaAll() {
  const rows = await db().select().from(s.episodesMedia)
    .innerJoin(s.episodes, eq(s.episodesMedia.episodeId, s.episodes.id));

  const byId: Record<number, any> = {};
  for (const r of rows) {
    byId[r.episodes.episodeNumber!] = {
      thumbnail_350: r.episodes_media.thumbnail350,
      thumbnail_full: r.episodes_media.thumbnailFull,
      audio_player: r.episodes_media.audioPlayerUrl,
    };
  }
  return byId;
}

export async function getMediaById(episodeNumber: number) {
  const [row] = await db().select().from(s.episodesMedia)
    .innerJoin(s.episodes, eq(s.episodesMedia.episodeId, s.episodes.id))
    .where(eq(s.episodes.episodeNumber, episodeNumber));
  if (!row) return null;
  return {
    thumbnail_350: row.episodes_media.thumbnail350,
    thumbnail_full: row.episodes_media.thumbnailFull,
    audio_player: row.episodes_media.audioPlayerUrl,
  };
}
