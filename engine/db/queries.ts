import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, ilike, or, sql, desc, inArray, and } from 'drizzle-orm';
import * as s from './schema';
import { getConfig } from '../config';

// ============================================================================
// Drizzle query layer — multi-tenant : filtre par tenant_id = config actuelle.
// Raw SQL (neon tagged template) pour les endpoints critiques (Vercel schema cache bypass).
// ============================================================================

function tenant(): string {
  return getConfig().database.tenantId;
}

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
  const t = tenant();
  const sqlInstance = neon(process.env.DATABASE_URL!);

  // Raw SQL pour calculer chapter_count et link_count en une passe (pas de cache Drizzle build-time).
  const filters: string[] = [`e.tenant_id = $1`, `(e.episode_type = 'full' OR e.episode_type IS NULL)`];
  const params: any[] = [t];
  if (pillar) { params.push(pillar); filters.push(`e.pillar = $${params.length}`); }
  if (difficulty) { params.push(difficulty); filters.push(`e.difficulty = $${params.length}`); }
  let searchJoin = '';
  if (search) {
    params.push(`%${search}%`);
    const idx = params.length;
    searchJoin = `LEFT JOIN episodes_enrichment en_search ON en_search.episode_id = e.id`;
    filters.push(`(e.title ILIKE $${idx} OR e.guest ILIKE $${idx} OR en_search.search_text ILIKE $${idx})`);
  }
  params.push(limit); const limitIdx = params.length;
  params.push((page - 1) * limit); const offsetIdx = params.length;

  const rowsPromise = sqlInstance.query(`
    SELECT e.id, e.episode_number, e.title, e.guest, e.pillar, e.difficulty, e.url,
           e.duration_seconds, e.article_content, e.episode_image_url,
           em.thumbnail_350,
           (SELECT count(*) FROM episode_links el WHERE el.episode_id = e.id) AS link_count,
           COALESCE(jsonb_array_length(e.chapters), 0) AS chapter_count
    FROM episodes e
    LEFT JOIN episodes_media em ON em.episode_id = e.id
    ${searchJoin}
    WHERE ${filters.join(' AND ')}
    ORDER BY e.episode_number DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `, params);

  const countPromise = sqlInstance.query(`
    SELECT count(*)::int AS c FROM episodes e
    ${searchJoin}
    WHERE ${filters.join(' AND ')}
  `, params.slice(0, params.length - 2));

  const [rows, countRows] = await Promise.all([rowsPromise, countPromise]);
  const total = Number((countRows as any[])[0]?.c || 0);

  const episodes = (rows as any[]).map(r => ({
    id: r.episode_number,
    title: r.title,
    guest_name: r.guest || '',
    guest_company: '',
    format: 'INTERVIEW',
    pillar: r.pillar,
    sub_theme: '',
    tags: [],
    difficulty: r.difficulty || 'INTERMEDIAIRE',
    learning_paths: [],
    url: r.url || '',
    thumbnail: r.thumbnail_350 || r.episode_image_url || null,
    episode_image_url: r.episode_image_url || null,
    duration_minutes: r.duration_seconds ? Math.round(r.duration_seconds / 60) : null,
    has_article: !!(r.article_content && r.article_content.length > 200),
    chapter_count: Number(r.chapter_count) || 0,
    link_count: Number(r.link_count) || 0,
  }));

  return { total, page, limit, pages: Math.ceil(total / limit), episodes };
}

export async function getEpisodeById(episodeNumber: number) {
  const sqlInstance = neon(process.env.DATABASE_URL!);
  const t = tenant();

  // Raw SQL pour contourner le cache Drizzle en runtime Vercel.
  // LEFT JOIN guests pour récupérer la bio curée (guests.bio est autoritative
  // par rapport à episodes.guest_bio qui contient souvent une intro d'épisode).
  const rows = await sqlInstance`
    SELECT e.*, em.thumbnail_350, em.thumbnail_full, em.audio_player_url,
           g.bio AS guest_bio_curated, g.company AS guest_company_curated,
           g.linkedin_url AS guest_linkedin, g.id AS guest_id
    FROM episodes e
    LEFT JOIN episodes_media em ON em.episode_id = e.id
    LEFT JOIN guests g ON g.tenant_id = e.tenant_id AND g.name = e.guest
    WHERE e.episode_number = ${episodeNumber} AND e.tenant_id = ${t}
  `;

  if (!rows.length) return null;
  const row = rows[0];

  const episode = {
    id: row.episode_number,
    title: row.title,
    guest_name: row.guest || '',
    guest_company: row.guest_company_curated || row.guest_company || '',
    guest_bio: row.guest_bio_curated || row.guest_bio || '',
    format: 'INTERVIEW',
    pillar: row.pillar,
    sub_theme: '',
    tags: [],
    difficulty: row.difficulty || 'INTERMEDIAIRE',
    learning_paths: [],
    url: row.url || '',
    abstract: row.abstract || '',
    key_takeaways: row.key_takeaways || [],
    related_episodes: row.related_episodes || [],
    external_references: row.external_references || [],
    community_rating: row.community_rating || null,
    sponsor: row.sponsor || null,
    publication_date: row.date_created || null,
    thumbnail: row.thumbnail_350 || null,
    thumbnail_full: row.thumbnail_full || null,
    // Deep content
    article_content: row.article_content || null,
    chapters: row.chapters || [],
    duration_seconds: row.duration_seconds || null,
    duration_minutes: row.duration_seconds ? Math.round(row.duration_seconds / 60) : null,
    rss_description: row.rss_description || null,
    sponsors: row.sponsors || [],
  };

  const relatedRows = await sqlInstance`
    SELECT e.episode_number, e.title, e.guest, e.pillar, e.difficulty, em.thumbnail_350
    FROM episodes e
    LEFT JOIN episodes_media em ON em.episode_id = e.id
    WHERE e.pillar = ${row.pillar} AND e.episode_number != ${episodeNumber} AND e.tenant_id = ${t}
    ORDER BY e.episode_number DESC LIMIT 5
  `;

  const relatedEps = relatedRows.map((r: any) => ({
    id: r.episode_number,
    title: r.title,
    guest_name: r.guest || '',
    pillar: r.pillar,
    difficulty: r.difficulty || 'INTERMEDIAIRE',
    thumbnail: r.thumbnail_350 || null,
  }));

  const audioPlayer = row.audio_player_url || null;

  const expertRows = await sqlInstance`
    SELECT g.name, g.company, g.specialty, g.authority_score, g.bio, g.linkedin_url
    FROM guest_episodes ge
    INNER JOIN guests g ON g.id = ge.guest_id
    WHERE ge.episode_id = ${row.id} AND ge.tenant_id = ${t}
    LIMIT 1
  `;
  const expert = expertRows.length ? {
    name: expertRows[0].name,
    company: expertRows[0].company,
    specialty: expertRows[0].specialty,
    authority_score: expertRows[0].authority_score,
    bio: expertRows[0].bio,
    linkedin_url: expertRows[0].linkedin_url,
  } : null;

  // Links groupés par type — résoudre aussi episode_number quand lien interne
  const linkRows = await sqlInstance`
    SELECT el.url, el.label, el.link_type
    FROM episode_links el
    WHERE el.episode_id = ${row.id} AND el.tenant_id = ${t}
    ORDER BY el.link_type, el.id
  `;
  const links: Record<string, any[]> = { resources: [], linkedin: [], episode_refs: [], companies: [], tools: [], other: [] };
  for (const l of linkRows as any[]) {
    const item: any = { url: l.url, label: l.label || l.url };
    switch (l.link_type) {
      case 'resource': links.resources.push(item); break;
      case 'linkedin': links.linkedin.push(item); break;
      case 'episode_ref': links.episode_refs.push(item); break;
      case 'company': links.companies.push(item); break;
      case 'tool': links.tools.push(item); break;
      default: links.other.push(item);
    }
  }
  // Enrichir episode_refs avec episode_number si résolvable
  if (links.episode_refs.length) {
    const urls = links.episode_refs.map(l => l.url);
    const matched = await sqlInstance`
      SELECT url, episode_number, title FROM episodes
      WHERE tenant_id = ${t} AND url = ANY(${urls})
    `;
    const byUrl = new Map<string, any>((matched as any[]).map(r => [r.url, r]));
    for (const l of links.episode_refs) {
      const m = byUrl.get(l.url);
      if (m) { l.episode_number = m.episode_number; l.label = l.label || m.title; }
    }
  }

  // Guest detail : autres épisodes
  const guestDetail = row.guest ? await (async () => {
    const others = await sqlInstance`
      SELECT episode_number, title FROM episodes
      WHERE tenant_id = ${t} AND guest = ${row.guest} AND episode_number != ${episodeNumber}
        AND (episode_type = 'full' OR episode_type IS NULL)
      ORDER BY episode_number DESC LIMIT 10
    `;
    return {
      name: row.guest,
      company: row.guest_company_curated || row.guest_company || null,
      bio: row.guest_bio_curated || row.guest_bio || null,
      linkedin_url: row.guest_linkedin || null,
      other_episodes: (others as any[]).map((o: any) => ({ episode_number: o.episode_number, title: o.title })),
    };
  })() : null;

  // Similar episodes (pgvector)
  const similarRows = await sqlInstance`
    SELECT e2.episode_number, e2.title, e2.guest, e2.pillar, e2.difficulty,
           es.similarity_score, em2.thumbnail_350
    FROM episode_similarities es
    INNER JOIN episodes e1 ON e1.id = es.episode_id
    INNER JOIN episodes e2 ON e2.id = es.similar_episode_id
    LEFT JOIN episodes_media em2 ON em2.episode_id = e2.id
    WHERE e1.episode_number = ${episodeNumber}
      AND e1.tenant_id = ${t} AND e2.tenant_id = ${t}
    ORDER BY es.similarity_score DESC LIMIT 5
  `;
  const similarEpisodes = (similarRows as any[]).map(r => ({
    episode_number: r.episode_number,
    title: r.title,
    guest: r.guest || '',
    pillar: r.pillar,
    difficulty: r.difficulty,
    similarity: Number(r.similarity_score),
    thumbnail: r.thumbnail_350 || null,
  }));

  return {
    episode,
    related: relatedEps,
    expert,
    audio_player: audioPlayer,
    links,
    guest_detail: guestDetail,
    similar_episodes: similarEpisodes,
  };
}

// ---- Experts ----

export async function getExperts(specialty?: string) {
  const t = tenant();
  const conditions: any[] = [eq(s.guests.tenantId, t)];
  if (specialty) conditions.push(sql`array_to_string(${s.guests.specialty}, ',') ILIKE ${`%${specialty}%`}`);

  const rows = await db().select().from(s.guests)
    .where(and(...conditions))
    .orderBy(desc(s.guests.authorityScore));

  return {
    total: rows.length,
    experts: rows.map(r => ({
      id: r.name.toLowerCase().replace(/\s+/g, '-'),
      name: r.name,
      company: r.company || '',
      specialty: r.specialty || [],
      episodes: [],
      authority_score: r.authorityScore || 1,
      bio: r.bio || '',
    })),
  };
}

export async function getExpertById(expertId: string) {
  const t = tenant();
  const name = expertId.replace(/-/g, ' ');
  const [row] = await db().select().from(s.guests)
    .where(and(eq(s.guests.tenantId, t), ilike(s.guests.name, `%${name}%`)))
    .limit(1);
  if (!row) return null;

  const eps = await db().select({ episodeId: s.guestEpisodes.episodeId })
    .from(s.guestEpisodes)
    .where(and(eq(s.guestEpisodes.tenantId, t), eq(s.guestEpisodes.guestId, row.id)));

  const epIds = eps.map(e => e.episodeId).filter(Boolean) as number[];
  let epNumbers: number[] = [];
  if (epIds.length) {
    const epRows = await db().select({ epNum: s.episodes.episodeNumber })
      .from(s.episodes)
      .where(and(eq(s.episodes.tenantId, t), inArray(s.episodes.id, epIds)));
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
  const t = tenant();
  const rows = await db().select().from(s.learningPaths).where(eq(s.learningPaths.tenantId, t));
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
  const t = tenant();
  const [row] = await db().select().from(s.learningPaths)
    .where(and(eq(s.learningPaths.tenantId, t), eq(s.learningPaths.pathId, pathId)));
  if (!row) return null;

  const steps = (row.episodesOrdered as any[] || []).map((step: any) => ({
    ...step,
    episode: null,
  }));

  const epNums = steps.map((step: any) => step.episode_id).filter(Boolean);
  if (epNums.length) {
    const epRows = await db().select().from(s.episodes)
      .where(and(eq(s.episodes.tenantId, t), inArray(s.episodes.episodeNumber, epNums)));
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
  const t = tenant();
  const rows = await db().select().from(s.taxonomy).where(eq(s.taxonomy.tenantId, t));
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
  const t = tenant();

  const [epCount] = await sqlInstance`SELECT count(*) as c FROM episodes WHERE tenant_id = ${t} AND (episode_type = 'full' OR episode_type IS NULL)`;
  const [gCount] = await sqlInstance`SELECT count(*) as c FROM guests WHERE tenant_id = ${t}`;
  const [pCount] = await sqlInstance`SELECT count(*) as c FROM learning_paths WHERE tenant_id = ${t}`;
  const [tCount] = await sqlInstance`SELECT count(*) as c FROM taxonomy WHERE tenant_id = ${t}`;
  const [qCount] = await sqlInstance`SELECT count(*) as c FROM quiz_questions WHERE tenant_id = ${t}`;

  const pillarRows = await sqlInstance`SELECT pillar, count(*) as c FROM episodes WHERE tenant_id = ${t} AND (episode_type = 'full' OR episode_type IS NULL) GROUP BY pillar ORDER BY c DESC`;
  const diffRows = await sqlInstance`SELECT difficulty, count(*) as c FROM episodes WHERE tenant_id = ${t} AND (episode_type = 'full' OR episode_type IS NULL) GROUP BY difficulty`;

  const topExperts = await sqlInstance`SELECT name, authority_score, episodes_count FROM guests WHERE tenant_id = ${t} ORDER BY authority_score DESC LIMIT 5`;

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
  const t = tenant();
  const conditions: any[] = [eq(s.quizQuestions.tenantId, t)];
  if (pillar) conditions.push(eq(s.quizQuestions.pillar, pillar));
  if (difficulty) conditions.push(eq(s.quizQuestions.difficulty, difficulty));

  const rows = await db().select().from(s.quizQuestions)
    .where(and(...conditions))
    .orderBy(sql`RANDOM()`)
    .limit(limit);

  return {
    total_available: rows.length,
    count: rows.length,
    questions: rows.map(r => ({
      episode_id: null,
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
  const t = tenant();
  const [ep] = await db().select({ id: s.episodes.id }).from(s.episodes)
    .where(and(eq(s.episodes.tenantId, t), eq(s.episodes.episodeNumber, episodeNumber)));
  if (!ep) return { episode_id: episodeNumber, count: 0, questions: [] };

  const rows = await db().select().from(s.quizQuestions)
    .where(and(eq(s.quizQuestions.tenantId, t), eq(s.quizQuestions.episodeId, ep.id)));

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
  const t = tenant();
  const [row] = await db().select().from(s.episodes)
    .innerJoin(s.episodesEnrichment, eq(s.episodes.id, s.episodesEnrichment.episodeId))
    .where(and(eq(s.episodes.tenantId, t), eq(s.episodes.episodeNumber, episodeNumber)));
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
  const t = tenant();
  const q = `%${query}%`;

  const matchedEpisodes = await db().select().from(s.episodes)
    .leftJoin(s.episodesEnrichment, eq(s.episodes.id, s.episodesEnrichment.episodeId))
    .where(and(
      eq(s.episodes.tenantId, t),
      or(
        ilike(s.episodes.title, q),
        ilike(s.episodes.guest, q),
        ilike(s.episodesEnrichment.searchText, q),
      ),
    ))
    .orderBy(desc(s.episodes.episodeNumber))
    .limit(20);

  const matchedExperts = await db().select().from(s.guests)
    .where(and(
      eq(s.guests.tenantId, t),
      or(
        ilike(s.guests.name, q),
        ilike(s.guests.company, q),
      ),
    ))
    .limit(10);

  const matchedPaths = await db().select().from(s.learningPaths)
    .where(and(
      eq(s.learningPaths.tenantId, t),
      or(
        ilike(s.learningPaths.name, q),
        ilike(s.learningPaths.description, q),
      ),
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
  const t = tenant();
  const rows = await sqlInstance`
    SELECT tag, count(*) as c
    FROM episodes_enrichment, unnest(tags) AS tag
    WHERE tenant_id = ${t}
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
  const t = tenant();
  const rows = await db().select().from(s.episodesMedia)
    .innerJoin(s.episodes, eq(s.episodesMedia.episodeId, s.episodes.id))
    .where(eq(s.episodes.tenantId, t));

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
  const t = tenant();
  const [row] = await db().select().from(s.episodesMedia)
    .innerJoin(s.episodes, eq(s.episodesMedia.episodeId, s.episodes.id))
    .where(and(eq(s.episodes.tenantId, t), eq(s.episodes.episodeNumber, episodeNumber)));
  if (!row) return null;
  return {
    thumbnail_350: row.episodes_media.thumbnail350,
    thumbnail_full: row.episodes_media.thumbnailFull,
    audio_player: row.episodes_media.audioPlayerUrl,
  };
}

// ============================================================================
// Full episode page — un seul appel qui agrège tout pour /episode/:id
// ============================================================================

export async function getEpisodeFull(episodeNumber: number) {
  const sqlInstance = neon(process.env.DATABASE_URL!);
  const t = tenant();

  const rows = await sqlInstance`
    SELECT e.*,
           em.thumbnail_350, em.thumbnail_full, em.audio_player_url,
           g.id AS guest_id, g.bio AS guest_bio_curated,
           g.company AS guest_company_curated,
           g.linkedin_url AS guest_linkedin,
           g.authority_score AS guest_authority
    FROM episodes e
    LEFT JOIN episodes_media em ON em.episode_id = e.id
    LEFT JOIN guests g ON g.tenant_id = e.tenant_id AND g.name = e.guest
    WHERE e.episode_number = ${episodeNumber} AND e.tenant_id = ${t}
  `;
  if (!rows.length) return null;
  const row = rows[0] as any;

  // --- Links groupés + résolution cross-episode ---
  const linkRows = await sqlInstance`
    SELECT url, label, link_type
    FROM episode_links
    WHERE episode_id = ${row.id} AND tenant_id = ${t}
    ORDER BY link_type, id
  `;
  const links: Record<string, any[]> = { resources: [], linkedin: [], episode_refs: [], companies: [], tools: [], other: [] };
  for (const l of linkRows as any[]) {
    const item: any = { url: l.url, label: l.label || l.url };
    switch (l.link_type) {
      case 'resource': links.resources.push(item); break;
      case 'linkedin': links.linkedin.push(item); break;
      case 'episode_ref': links.episode_refs.push(item); break;
      case 'company': links.companies.push(item); break;
      case 'tool': links.tools.push(item); break;
      default: links.other.push(item);
    }
  }
  if (links.episode_refs.length) {
    const urls = links.episode_refs.map((l: any) => l.url);
    const matched = await sqlInstance`
      SELECT url, episode_number, title FROM episodes
      WHERE tenant_id = ${t} AND url = ANY(${urls})
    `;
    const byUrl = new Map<string, any>((matched as any[]).map((r) => [r.url, r]));
    for (const l of links.episode_refs) {
      const m = byUrl.get(l.url);
      if (m) { l.episode_number = m.episode_number; l.label = l.label || m.title; }
    }
  }

  // --- Guest detail + autres épisodes ---
  const guestDetail = row.guest ? await (async () => {
    const others = await sqlInstance`
      SELECT episode_number, title FROM episodes
      WHERE tenant_id = ${t} AND guest = ${row.guest} AND episode_number != ${episodeNumber}
        AND (episode_type = 'full' OR episode_type IS NULL)
      ORDER BY episode_number DESC LIMIT 10
    `;
    return {
      name: row.guest,
      company: row.guest_company_curated || row.guest_company || null,
      bio: row.guest_bio_curated || row.guest_bio || null,
      linkedin_url: row.guest_linkedin || null,
      authority_score: row.guest_authority || null,
      other_episodes: (others as any[]).map((o) => ({ episode_number: o.episode_number, title: o.title })),
    };
  })() : null;

  // --- Similar episodes (pgvector) ---
  const similarRows = await sqlInstance`
    SELECT e2.episode_number, e2.title, e2.guest, e2.pillar, e2.difficulty,
           es.similarity_score, em2.thumbnail_350
    FROM episode_similarities es
    INNER JOIN episodes e1 ON e1.id = es.episode_id
    INNER JOIN episodes e2 ON e2.id = es.similar_episode_id
    LEFT JOIN episodes_media em2 ON em2.episode_id = e2.id
    WHERE e1.episode_number = ${episodeNumber}
      AND e1.tenant_id = ${t} AND e2.tenant_id = ${t}
    ORDER BY es.similarity_score DESC LIMIT 6
  `;
  const similar_episodes = (similarRows as any[]).map((r) => ({
    episode_number: r.episode_number,
    title: r.title,
    guest: r.guest || '',
    pillar: r.pillar,
    difficulty: r.difficulty,
    similarity: Number(r.similarity_score),
    thumbnail: r.thumbnail_350 || null,
  }));

  // --- Résolution des cross-episodes RSS (titre à jour + existence tenant) ---
  const rssCrossRaw = (row.rss_cross_episodes as any[]) || [];
  let rss_cross_episodes: any[] = [];
  if (rssCrossRaw.length) {
    const nums = rssCrossRaw.map((c) => c.number).filter((n) => typeof n === 'number');
    const existing = nums.length ? await sqlInstance`
      SELECT episode_number, title FROM episodes
      WHERE tenant_id = ${t} AND episode_number = ANY(${nums})
    ` : [];
    const byNum = new Map<number, any>((existing as any[]).map((r) => [r.episode_number, r]));
    rss_cross_episodes = rssCrossRaw.map((c) => {
      const match = byNum.get(c.number);
      return {
        number: c.number,
        title: match?.title || c.title || null,
        exists: !!match,
      };
    });
  }

  // --- Prev/Next (même tenant, type full) ---
  const [prevRow] = (await sqlInstance`
    SELECT episode_number, title FROM episodes
    WHERE tenant_id = ${t} AND episode_number < ${episodeNumber}
      AND (episode_type = 'full' OR episode_type IS NULL)
    ORDER BY episode_number DESC LIMIT 1
  `) as any[];
  const [nextRow] = (await sqlInstance`
    SELECT episode_number, title FROM episodes
    WHERE tenant_id = ${t} AND episode_number > ${episodeNumber}
      AND (episode_type = 'full' OR episode_type IS NULL)
    ORDER BY episode_number ASC LIMIT 1
  `) as any[];

  // --- Enrichment (tags, takeaways) ---
  const enrRows = await sqlInstance`
    SELECT tags, sub_themes FROM episodes_enrichment
    WHERE episode_id = ${row.id} AND tenant_id = ${t} LIMIT 1
  `;
  const enr = (enrRows as any[])[0] || {};

  // Slugify simple pour URLs (cohérent avec src/api.ts côté JSON)
  const slug = (row.title || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

  return {
    episode_number: row.episode_number,
    title: row.title,
    slug,
    pillar: row.pillar,
    difficulty: row.difficulty || 'INTERMEDIAIRE',
    date_created: row.date_created || null,
    duration_seconds: row.duration_seconds || null,
    duration_minutes: row.duration_seconds ? Math.round(row.duration_seconds / 60) : null,
    episode_type: row.episode_type || 'full',
    season: row.season || null,

    abstract: row.abstract || null,
    article_content: row.article_content || null,
    article_html: row.article_html || null,
    chapters: row.chapters || [],
    key_takeaways: row.key_takeaways || [],
    tags: enr.tags || [],
    sub_themes: enr.sub_themes || [],

    rss_description: row.rss_description || null,
    rss_content_encoded: row.rss_content_encoded || null,
    rss_topic: row.rss_topic || null,
    rss_guest_intro: row.rss_guest_intro || null,
    rss_discover: row.rss_discover || [],
    rss_references: row.rss_references || [],
    rss_cross_episodes,
    rss_promo: row.rss_promo || null,
    rss_chapters_ts: row.rss_chapters_ts || [],
    youtube_url: row.youtube_url || null,
    cross_promo: row.cross_promo || null,

    thumbnail_350: row.thumbnail_350 || null,
    thumbnail_full: row.thumbnail_full || null,
    episode_image_url: row.episode_image_url || null,
    audio_url: row.audio_url || null,
    audio_player_url: row.audio_player_url || null,

    url: row.url || null,
    article_url: row.article_url || null,

    guest: guestDetail,
    links,
    similar_episodes,
    sponsors: row.sponsors || [],

    prev_episode: prevRow ? { number: prevRow.episode_number, title: prevRow.title } : null,
    next_episode: nextRow ? { number: nextRow.episode_number, title: nextRow.title } : null,
  };
}

// ============================================================================
// Deep content — chapters split, links stats, guest profile, episode graph
// ============================================================================

export async function getEpisodeChapters(episodeNumber: number) {
  const sqlInstance = neon(process.env.DATABASE_URL!);
  const t = tenant();
  const rows = await sqlInstance`
    SELECT episode_number, title, chapters, article_content
    FROM episodes
    WHERE episode_number = ${episodeNumber} AND tenant_id = ${t}
  `;
  if (!rows.length) return null;
  const ep = rows[0] as any;
  const chapters: Array<{ title: string; order: number; timestamp_seconds?: number }> = ep.chapters || [];
  const article = ep.article_content || '';

  // Si pas de chapitres, retourner 1 chapitre unique
  if (!chapters.length) {
    return {
      episode_number: ep.episode_number,
      title: ep.title,
      chapters: article ? [{
        title: 'Contenu',
        order: 1,
        content: article,
        word_count: article.split(/\s+/).filter(Boolean).length,
      }] : [],
    };
  }

  // Split article_content sur les titres de chapitres (si match plain-text)
  const out: any[] = [];
  let remaining = article;
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    const next = chapters[i + 1];
    let content = '';
    if (article && remaining) {
      // Trouver la position du titre courant et du suivant dans le remaining
      const idx = remaining.indexOf(ch.title);
      if (idx >= 0) {
        const after = remaining.substring(idx + ch.title.length);
        if (next) {
          const nextIdx = after.indexOf(next.title);
          if (nextIdx >= 0) {
            content = after.substring(0, nextIdx).trim();
            remaining = after.substring(nextIdx);
          } else {
            content = after.trim();
            remaining = '';
          }
        } else {
          content = after.trim();
        }
      }
    }
    out.push({
      title: ch.title,
      order: ch.order ?? i + 1,
      timestamp_seconds: ch.timestamp_seconds ?? null,
      content,
      word_count: content ? content.split(/\s+/).filter(Boolean).length : 0,
    });
  }

  return { episode_number: ep.episode_number, title: ep.title, chapters: out };
}

export async function getLinksStats() {
  const sqlInstance = neon(process.env.DATABASE_URL!);
  const t = tenant();

  const [totalRow] = await sqlInstance`
    SELECT count(*)::int AS c FROM episode_links WHERE tenant_id = ${t}
  ` as any[];

  const byType = await sqlInstance`
    SELECT link_type, count(*)::int AS c
    FROM episode_links WHERE tenant_id = ${t}
    GROUP BY link_type ORDER BY c DESC
  ` as any[];

  const topDomains = await sqlInstance`
    SELECT regexp_replace(url, '^https?://(www\\.)?([^/]+).*', '\\2') AS domain, count(*)::int AS c
    FROM episode_links WHERE tenant_id = ${t}
    GROUP BY domain ORDER BY c DESC LIMIT 20
  ` as any[];

  const topTools = await sqlInstance`
    SELECT url, label, count(DISTINCT episode_id)::int AS mentioned_in
    FROM episode_links
    WHERE tenant_id = ${t} AND link_type IN ('tool','company')
    GROUP BY url, label ORDER BY mentioned_in DESC LIMIT 20
  ` as any[];

  const crossRefsTotal = await sqlInstance`
    SELECT count(*)::int AS c FROM episode_links
    WHERE tenant_id = ${t} AND link_type = 'episode_ref'
  ` as any[];

  const episodesRef = await sqlInstance`
    SELECT count(DISTINCT episode_id)::int AS c FROM episode_links
    WHERE tenant_id = ${t} AND link_type = 'episode_ref'
  ` as any[];

  const mostReferenced = await sqlInstance`
    SELECT e.episode_number, e.title, count(*)::int AS referenced_by
    FROM episode_links el
    INNER JOIN episodes e ON e.tenant_id = el.tenant_id AND e.url = el.url
    WHERE el.tenant_id = ${t} AND el.link_type = 'episode_ref'
    GROUP BY e.episode_number, e.title
    ORDER BY referenced_by DESC LIMIT 10
  ` as any[];

  return {
    total: Number(totalRow.c),
    by_type: Object.fromEntries(byType.map(r => [r.link_type, Number(r.c)])),
    top_domains: topDomains.map(r => ({ domain: r.domain, count: Number(r.c) })),
    top_tools: topTools.map(r => ({ url: r.url, label: r.label || r.url, mentioned_in: Number(r.mentioned_in) })),
    cross_references: {
      total: Number(crossRefsTotal[0]?.c || 0),
      episodes_that_reference_others: Number(episodesRef[0]?.c || 0),
      most_referenced_episodes: mostReferenced.map(r => ({
        episode_number: r.episode_number, title: r.title, referenced_by: Number(r.referenced_by),
      })),
    },
  };
}

export async function getGuestProfile(name: string) {
  const sqlInstance = neon(process.env.DATABASE_URL!);
  const t = tenant();

  const guestRows = await sqlInstance`
    SELECT id, name, bio, company, specialty, linkedin_url, authority_score
    FROM guests
    WHERE tenant_id = ${t} AND LOWER(name) = LOWER(${name})
    LIMIT 1
  ` as any[];
  if (!guestRows.length) {
    // Fallback : match épisodes par guest column
    const eps = await sqlInstance`
      SELECT episode_number, title, date_created, pillar, duration_seconds
      FROM episodes
      WHERE tenant_id = ${t} AND guest ILIKE ${name}
        AND (episode_type = 'full' OR episode_type IS NULL)
      ORDER BY episode_number DESC
    ` as any[];
    if (!eps.length) return null;
    const totalMinutes = eps.reduce((s: number, e: any) => s + Math.round((e.duration_seconds || 0) / 60), 0);
    const pillars = [...new Set(eps.map((e: any) => e.pillar).filter(Boolean))];
    return {
      name, bio: null, linkedin_url: null, company: null,
      episodes: eps.map((e: any) => ({
        episode_number: e.episode_number, title: e.title, date: e.date_created,
        pillar: e.pillar, duration_minutes: Math.round((e.duration_seconds || 0) / 60) || null,
      })),
      pillars_covered: pillars, total_minutes: totalMinutes, is_recurring: eps.length > 1,
    };
  }
  const g = guestRows[0];
  const eps = await sqlInstance`
    SELECT e.episode_number, e.title, e.date_created, e.pillar, e.duration_seconds
    FROM episodes e
    INNER JOIN guest_episodes ge ON ge.episode_id = e.id
    WHERE ge.guest_id = ${g.id} AND e.tenant_id = ${t}
      AND (e.episode_type = 'full' OR e.episode_type IS NULL)
    ORDER BY e.episode_number DESC
  ` as any[];
  const totalMinutes = eps.reduce((s: number, e: any) => s + Math.round((e.duration_seconds || 0) / 60), 0);
  const pillars = [...new Set(eps.map((e: any) => e.pillar).filter(Boolean))];
  return {
    name: g.name, bio: g.bio, company: g.company, specialty: g.specialty,
    linkedin_url: g.linkedin_url, authority_score: g.authority_score,
    episodes: eps.map((e: any) => ({
      episode_number: e.episode_number, title: e.title, date: e.date_created,
      pillar: e.pillar, duration_minutes: Math.round((e.duration_seconds || 0) / 60) || null,
    })),
    pillars_covered: pillars, total_minutes: totalMinutes, is_recurring: eps.length > 1,
  };
}

export async function getEpisodeGraph() {
  const sqlInstance = neon(process.env.DATABASE_URL!);
  const t = tenant();

  const nodes = await sqlInstance`
    SELECT episode_number, title, pillar, guest
    FROM episodes
    WHERE tenant_id = ${t} AND (episode_type = 'full' OR episode_type IS NULL)
    ORDER BY episode_number
  ` as any[];

  const edges = await sqlInstance`
    SELECT e1.episode_number AS source, e2.episode_number AS target
    FROM episode_links el
    INNER JOIN episodes e1 ON e1.id = el.episode_id AND e1.tenant_id = el.tenant_id
    INNER JOIN episodes e2 ON e2.url = el.url AND e2.tenant_id = el.tenant_id
    WHERE el.tenant_id = ${t} AND el.link_type = 'episode_ref'
      AND e1.episode_number IS NOT NULL AND e2.episode_number IS NOT NULL
      AND e1.episode_number != e2.episode_number
  ` as any[];

  // Déduper et compter
  const edgeMap = new Map<string, { source: number; target: number; weight: number }>();
  for (const e of edges) {
    const key = `${e.source}->${e.target}`;
    const existing = edgeMap.get(key);
    if (existing) existing.weight += 1;
    else edgeMap.set(key, { source: e.source, target: e.target, weight: 1 });
  }
  const edgeList = Array.from(edgeMap.values()).map(e => ({ ...e, label: 'mentionne' }));

  const connectedSet = new Set<number>();
  for (const e of edgeList) { connectedSet.add(e.source); connectedSet.add(e.target); }
  const connectionCounts = new Map<number, number>();
  for (const e of edgeList) {
    connectionCounts.set(e.target, (connectionCounts.get(e.target) || 0) + e.weight);
  }
  let mostConnected: { episode_number: number; title: string; connections: number } | null = null;
  for (const [num, count] of connectionCounts) {
    if (!mostConnected || count > mostConnected.connections) {
      const n = nodes.find((x: any) => x.episode_number === num);
      mostConnected = { episode_number: num, title: n?.title || '', connections: count };
    }
  }

  return {
    nodes: nodes.map((n: any) => ({
      id: n.episode_number, title: n.title, pillar: n.pillar, guest: n.guest || '',
    })),
    edges: edgeList,
    stats: {
      total_nodes: nodes.length,
      total_edges: edgeList.length,
      connected_episodes: connectedSet.size,
      isolated_episodes: nodes.length - connectedSet.size,
      most_connected: mostConnected,
    },
  };
}

// ============================================================================
// Search par outil : retrouver épisodes qui mentionnent un tool/company/domain.
// ============================================================================

export async function searchByTool(tool: string) {
  const sqlInstance = neon(process.env.DATABASE_URL!);
  const t = tenant();
  const q = `%${tool}%`;
  const rows = await sqlInstance`
    SELECT e.episode_number, e.title, e.guest, e.pillar,
           el.url, el.label, el.link_type
    FROM episode_links el
    INNER JOIN episodes e ON e.id = el.episode_id
    WHERE el.tenant_id = ${t}
      AND (el.label ILIKE ${q} OR el.url ILIKE ${q})
    ORDER BY e.episode_number DESC
    LIMIT 50
  ` as any[];

  // Dédoublonner par episode_number, garder le premier lien comme contexte
  const seen = new Map<number, any>();
  for (const r of rows) {
    if (!seen.has(r.episode_number)) {
      seen.set(r.episode_number, {
        episode_number: r.episode_number,
        title: r.title,
        guest: r.guest || '',
        pillar: r.pillar,
        link_context: { url: r.url, label: r.label, link_type: r.link_type },
      });
    }
  }
  return {
    tool,
    episodes: Array.from(seen.values()),
    total_mentions: rows.length,
  };
}
