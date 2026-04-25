import * as dotenv from 'dotenv';
dotenv.config({ override: true }); // override : la valeur du .env prime sur l'env shell (évite le cas où ANTHROPIC_API_KEY="" dans le shell masque la vraie clé)
import express from 'express';
import cors from 'cors';
import * as fs from 'fs';
import * as path from 'path';
import type { Episode, Expert, LearningPath, Difficulty, Pillar, UserProfile, Recommendation } from './types';
import { getRecommendations } from './types';
import * as dbQueries from './db/queries';
import { getConfig, toPublicConfig } from './config';
import { getCached, clearCache, cacheStats } from './cache';
import { sendMagicLink } from './auth/resend';
import { createMagicLink, consumeMagicLink } from './auth/magic-link';
import { sign as signSession, cookieSetHeader, cookieClearHeader } from './auth/session';
import { getAccessScope } from './auth/access';
import { requireHubAuth, optionalHubAuth, requireRoot } from './auth/middleware';

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// V2 brand-aligned route
app.get('/v2', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'v2.html'));
});

// Brief invité (MEDIUM-3) — SPA, le slug est lu côté JS depuis window.location.
app.get('/guest-brief/:slug', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'guest-brief.html'));
});

// Public config endpoint — exposé au frontend pour branding dynamique.
// Ne renvoie JAMAIS les sections database ou deploy.
app.get('/api/config', (_req, res) => {
  try {
    res.json(toPublicConfig(getConfig()));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3001;
const USE_DB = process.env.USE_DB === 'true' && !!process.env.DATABASE_URL;

// --- Cache admin ---
app.get('/api/cache/stats', (_req, res) => {
  res.json(cacheStats());
});

app.post('/api/cache/clear', async (req, res) => {
  try {
    const adminToken = process.env.ADMIN_TOKEN;
    if (adminToken && req.headers['x-admin-token'] !== adminToken) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const prefix = (req.query.prefix as string) || undefined;
    const cleared = await clearCache(prefix);
    res.json({ cleared, prefix: prefix || 'all' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- Admin : régénération de brief invité (MEDIUM-3) ---
// Réservé root (cf engine/auth/middleware.ts:requireRoot). Invalide le cache
// public correspondant après UPDATE pour que le GET suivant relise la DB.
app.post('/api/admin/guest-briefs/regenerate', requireRoot, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'DB required' });
    const guestId = Number(req.body?.guestId);
    if (!Number.isInteger(guestId) || guestId <= 0) {
      return res.status(400).json({ error: 'guestId required (positive integer)' });
    }
    const llmModel = req.body?.llmModel === 'haiku' ? 'haiku' : 'sonnet';
    const maxEpisodes = Number.isInteger(req.body?.maxEpisodes) ? req.body.maxEpisodes : undefined;
    const dryRun = req.body?.dryRun === true;
    const { persistGuestBrief } = await import('./agents/wrappers/persistGuestBrief');
    const result = await persistGuestBrief({ guestId, llmModel, maxEpisodes, dryRun });
    if (!dryRun) await clearCache('guest-brief:');
    res.json(result);
  } catch (e: any) {
    console.error('[API] /api/admin/guest-briefs/regenerate error:', e.message);
    const msg = e?.message ?? 'unknown error';
    if (/not found/.test(msg)) return res.status(404).json({ error: msg });
    if (/no tenant_appearances|no usable source/.test(msg)) return res.status(422).json({ error: msg });
    res.status(500).json({ error: msg });
  }
});

// ============================================================================
// JSON Fallback Data Loading (used when USE_DB=false)
// ============================================================================

function loadJSON<T>(filename: string): T {
  const filePath = path.join(__dirname, '..', 'data', filename);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

let episodesData: { episodes: any[] } = { episodes: [] };
let expertsData: { experts: Expert[] } = { experts: [] };
let pathsData: { learning_paths: LearningPath[] } = { learning_paths: [] };
let taxonomyData: any = { pillars: [] };
let mediaData: { by_id: Record<string, any> } = { by_id: {} };
let quizData: any = { questions: [] };
let enrichedData: any = { episodes: [] };
let episodes: Episode[] = [];
let urlMap: Record<number, string> = {};

// Only load JSON if NOT using DB (save memory in DB mode)
if (!USE_DB) {
  episodesData = loadJSON<{ episodes: any[] }>('episodes-complete-index.json');
  expertsData = loadJSON<{ experts: Expert[] }>('experts.json');
  pathsData = loadJSON<{ learning_paths: LearningPath[] }>('learning-paths.json');
  taxonomyData = loadJSON<any>('taxonomy.json');

  const mediaPath = path.join(__dirname, '..', 'data', 'episodes-media.json');
  if (fs.existsSync(mediaPath)) mediaData = JSON.parse(fs.readFileSync(mediaPath, 'utf-8'));

  const scrapedData = loadJSON<{ episodes: any[] }>('episodes-enriched.json');
  for (const ep of scrapedData.episodes) {
    if (ep.id && ep.url && !urlMap[ep.id]) urlMap[ep.id] = ep.url;
  }

  const quizPath = path.join(__dirname, '..', 'data', 'quiz-bank.json');
  if (fs.existsSync(quizPath)) quizData = JSON.parse(fs.readFileSync(quizPath, 'utf-8'));

  const enrichedPath = path.join(__dirname, '..', 'data', 'episodes-ai-enriched.json');
  if (fs.existsSync(enrichedPath)) enrichedData = JSON.parse(fs.readFileSync(enrichedPath, 'utf-8'));

  function mapDifficulty(d: string): Difficulty {
    if (d === 'DEB') return 'DEBUTANT';
    if (d === 'INT') return 'INTERMEDIAIRE';
    if (d === 'AVA') return 'AVANCE';
    return d as Difficulty;
  }

  function slugify(title: string): string {
    return title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 80);
  }

  const urlPattern = getConfig().episodeUrlPattern;
  episodes = episodesData.episodes.map((ep: any) => ({
    id: ep.id, title: ep.title, guest_name: ep.guest, guest_company: '',
    format: 'INTERVIEW' as const, pillar: ep.pillar as Pillar, sub_theme: '', tags: [],
    difficulty: mapDifficulty(ep.difficulty), learning_paths: [],
    url: urlMap[ep.id] || urlPattern.replace('{slug}', slugify(ep.title)),
  }));
}

console.log(`[COUCHE 1] Data source: ${USE_DB ? 'Neon Postgres (Drizzle)' : 'JSON files'}`);

// ============================================================================
// API Routes — dual mode (DB or JSON)
// ============================================================================

// --- Episodes ---

app.get('/api/episodes', async (req, res) => {
  try {
    if (process.env.DATABASE_URL) {
      const params = {
        pillar: (req.query.pillar as string) || '',
        difficulty: (req.query.difficulty as string) || '',
        search: (req.query.search as string) || '',
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
      };
      const cacheKey = `episodes:${params.pillar}:${params.difficulty}:${params.search}:${params.page}:${params.limit}`;
      const ttl = params.search ? 60 : 300; // recherches volatiles, listes stables
      const result = await getCached(cacheKey, ttl, () => dbQueries.getEpisodes(params));
      return res.json(result);
    }

    let result = [...episodes];
    const pillar = req.query.pillar as string;
    if (pillar) result = result.filter(ep => ep.pillar === pillar);
    const difficulty = req.query.difficulty as string;
    if (difficulty) result = result.filter(ep => ep.difficulty === difficulty);
    const search = req.query.search as string;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(ep => ep.title.toLowerCase().includes(q) || ep.guest_name.toLowerCase().includes(q));
    }
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const start = (page - 1) * limit;
    res.json({
      total: result.length, page, limit, pages: Math.ceil(result.length / limit),
      episodes: result.slice(start, start + limit).map(ep => ({ ...ep, thumbnail: mediaData.by_id[ep.id]?.thumbnail_350 || null })),
    });
  } catch (e: any) { console.error('[API] /api/episodes error:', e.message); res.status(500).json({ error: e.message }); }
});

// --- Deep content endpoints (C1) ---

app.get('/api/episodes/:id/full', async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'DB required' });
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid episode id' });
    const result = await getCached(`episode:full:${id}`, 21600, () => dbQueries.getEpisodeFull(id));
    if (!result) return res.status(404).json({ error: 'Episode not found' });
    res.json(result);
  } catch (e: any) { console.error('[API] episodes/:id/full error:', e.message); res.status(500).json({ error: e.message }); }
});

app.get('/api/episodes/:id/chapters', async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'DB required' });
    const id = parseInt(req.params.id);
    const result = await getCached(`chapters:${id}`, 900, () => dbQueries.getEpisodeChapters(id));
    if (!result) return res.status(404).json({ error: 'Episode not found' });
    res.json(result);
  } catch (e: any) { console.error('[API] chapters error:', e.message); res.status(500).json({ error: e.message }); }
});

app.get('/api/links/stats', async (_req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'DB required' });
    res.json(await getCached('links:stats', 600, () => dbQueries.getLinksStats()));
  } catch (e: any) { console.error('[API] links/stats error:', e.message); res.status(500).json({ error: e.message }); }
});

app.get('/api/guests/:name', async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'DB required' });
    const name = decodeURIComponent(req.params.name);
    const result = await getCached(`guest:${name}`, 600, () => dbQueries.getGuestProfile(name));
    if (!result) return res.status(404).json({ error: 'Guest not found' });
    res.json(result);
  } catch (e: any) { console.error('[API] guests/:name error:', e.message); res.status(500).json({ error: e.message }); }
});

app.get('/api/graph/episodes', async (_req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'DB required' });
    res.json(await getCached('graph:episodes', 600, () => dbQueries.getEpisodeGraph()));
  } catch (e: any) { console.error('[API] graph/episodes error:', e.message); res.status(500).json({ error: e.message }); }
});

app.get('/api/episodes/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (process.env.DATABASE_URL) {
      const result = await getCached(`episode:${id}`, 600, () => dbQueries.getEpisodeById(id));
      if (!result) return res.status(404).json({ error: 'Episode not found' });
      return res.json(result);
    }

    const episode = episodes.find(ep => ep.id === id);
    if (!episode) return res.status(404).json({ error: 'Episode not found' });
    const related = episodes.filter(ep => ep.pillar === episode.pillar && ep.id !== episode.id).slice(0, 5);
    const expert = expertsData.experts.find(ex => ex.episodes.includes(episode.id));
    const media = mediaData.by_id[id] || {};
    res.json({
      episode: { ...episode, thumbnail: media.thumbnail_350 || null, thumbnail_full: media.thumbnail_full || null },
      related: related.map(r => ({ ...r, thumbnail: mediaData.by_id[r.id]?.thumbnail_350 || null })),
      expert,
      audio_player: media.audio_player || null,
    });
  } catch (e: any) { console.error('[API] /api/episodes/:id error:', e.message); res.status(500).json({ error: e.message }); }
});

// --- Experts ---

app.get('/api/experts', async (req, res) => {
  try {
    if (process.env.DATABASE_URL) return res.json(await dbQueries.getExperts(req.query.specialty as string));

    let result = [...expertsData.experts];
    const specialty = req.query.specialty as string;
    if (specialty) {
      const q = specialty.toLowerCase();
      result = result.filter(ex => ex.specialty.some(s => s.toLowerCase().includes(q)));
    }
    result.sort((a, b) => b.authority_score - a.authority_score);
    res.json({ total: result.length, experts: result });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/experts/:id', async (req, res) => {
  try {
    if (process.env.DATABASE_URL) {
      const result = await dbQueries.getExpertById(req.params.id);
      if (!result) return res.status(404).json({ error: 'Expert not found' });
      return res.json(result);
    }
    const expert = expertsData.experts.find(ex => ex.id === req.params.id);
    if (!expert) return res.status(404).json({ error: 'Expert not found' });
    const expertEpisodes = episodes.filter(ep => expert.episodes.includes(ep.id));
    res.json({ expert, episodes: expertEpisodes });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- Learning Paths ---

app.get('/api/paths', async (_req, res) => {
  try {
    if (process.env.DATABASE_URL) return res.json(await dbQueries.getPaths());
    const paths = pathsData.learning_paths.map(p => ({
      id: p.id, name: p.name, description: p.description, difficulty: p.difficulty,
      estimated_hours: p.estimated_hours, episode_count: p.episodes_ordered.length,
      target_audience: p.target_audience, outcomes: p.outcomes,
    }));
    res.json({ total: paths.length, paths });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/paths/:id', async (req, res) => {
  try {
    if (process.env.DATABASE_URL) {
      const result = await dbQueries.getPathById(req.params.id);
      if (!result) return res.status(404).json({ error: 'Path not found' });
      return res.json(result);
    }
    const lpath = pathsData.learning_paths.find(p => p.id === req.params.id);
    if (!lpath) return res.status(404).json({ error: 'Path not found' });
    const resolvedSteps = lpath.episodes_ordered.map(step => ({ ...step, episode: episodes.find(ep => ep.id === step.episode_id) }));
    res.json({ path: { ...lpath, steps: resolvedSteps } });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- Taxonomy ---

app.get('/api/taxonomy', async (_req, res) => {
  try {
    if (process.env.DATABASE_URL) return res.json(await dbQueries.getTaxonomy());
    res.json(taxonomyData);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/taxonomy/pillars', async (_req, res) => {
  try {
    if (process.env.DATABASE_URL) {
      const data = await dbQueries.getTaxonomy();
      return res.json({ pillars: data.pillars.map((p: any) => ({ id: p.id, name: p.name, icon: p.icon, color: p.color, episode_count: p.episode_count, sub_theme_count: p.sub_themes.length })) });
    }
    const pillars = taxonomyData.pillars.map((p: any) => ({ id: p.id, name: p.name, icon: p.icon, color: p.color, episode_count: p.episode_count, sub_theme_count: p.sub_themes.length }));
    res.json({ pillars });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/taxonomy/pillars/:id', (req, res) => {
  // Keep JSON-only for now (sub_theme episode resolution is complex)
  const pillar = taxonomyData.pillars?.find((p: any) => p.id === req.params.id);
  if (!pillar) return res.status(404).json({ error: 'Pillar not found' });
  const resolved = {
    ...pillar,
    sub_themes: pillar.sub_themes.map((st: any) => ({
      ...st, episodes: st.episodes?.map((id: number) => episodes.find(ep => ep.id === id)).filter(Boolean) || [],
    })),
  };
  res.json(resolved);
});

// --- Recommendations ---

app.post('/api/recommend', async (req, res) => {
  try {
    const profile: UserProfile = req.body;
    if (!profile.interests || !profile.investment_experience) {
      return res.status(400).json({ error: 'Missing interests or investment_experience' });
    }

    if (process.env.DATABASE_URL) {
      // Fetch all episodes from DB for scoring
      const allEps = await dbQueries.getEpisodes({ limit: 500 });
      const epList: Episode[] = allEps.episodes.map((ep: any) => ({
        ...ep, learning_paths: [], format: 'INTERVIEW' as const, sub_theme: '', tags: [], guest_company: '',
      }));
      const limit = parseInt(req.query.limit as string) || 10;
      const recommendations = getRecommendations(profile, epList, limit);
      return res.json({ total: recommendations.length, recommendations });
    }

    const episodesWithPaths: Episode[] = episodes.map(ep => {
      const enriched = enrichedData.episodes.find((e: any) => e.id === ep.id);
      return { ...ep, learning_paths: enriched?.learning_paths || [] };
    });
    const limit = parseInt(req.query.limit as string) || 10;
    const recommendations = getRecommendations(profile, episodesWithPaths, limit);
    res.json({ total: recommendations.length, recommendations });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- Stats ---

app.get('/api/stats', async (_req, res) => {
  try {
    if (process.env.DATABASE_URL) return res.json(await dbQueries.getStats());

    const pillarCounts: Record<string, number> = {};
    const difficultyCounts: Record<string, number> = {};
    for (const ep of episodes) {
      pillarCounts[ep.pillar] = (pillarCounts[ep.pillar] || 0) + 1;
      difficultyCounts[ep.difficulty] = (difficultyCounts[ep.difficulty] || 0) + 1;
    }
    res.json({
      total_episodes: episodes.length, total_experts: expertsData.experts.length,
      total_paths: pathsData.learning_paths.length, total_pillars: taxonomyData.pillars.length,
      episodes_by_pillar: pillarCounts, episodes_by_difficulty: difficultyCounts,
      top_experts: expertsData.experts.sort((a, b) => b.authority_score - a.authority_score).slice(0, 5)
        .map(e => ({ name: e.name, score: e.authority_score, episodes: e.episodes.length })),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- Analytics (Couche 2) ---

app.get('/api/analytics', async (_req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'Analytics requires DATABASE_URL' });
    const { getAnalytics } = await import('./ai/analytics');
    const data = await getAnalytics();
    res.json(data);
  } catch (e: any) { console.error('[API] /api/analytics error:', e.message); res.status(500).json({ error: e.message }); }
});

app.get('/api/analytics/dashboard', async (_req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'DB required' });
    const result = await getCached('analytics:dashboard', 21600, async () => {
      const { getDashboard } = await import('./ai/dashboard');
      return await getDashboard();
    });
    res.json(result);
  } catch (e: any) { console.error('[API] /api/analytics/dashboard error:', e.message); res.status(500).json({ error: e.message }); }
});

// --- Similar Episodes (Couche 2) ---

app.get('/api/similar/:id', async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'Similarity requires DATABASE_URL' });
    const sql = (await import('@neondatabase/serverless')).neon(process.env.DATABASE_URL!);
    const episodeNumber = parseInt(req.params.id);
    const limit = parseInt(req.query.limit as string) || 10;
    const tenantId = getConfig().database.tenantId;

    const similar = await sql`
      SELECT e2.episode_number, e2.title, e2.guest, e2.pillar, e2.difficulty,
             es.similarity_score,
             em.thumbnail_350
      FROM episode_similarities es
      INNER JOIN episodes e1 ON e1.id = es.episode_id
      INNER JOIN episodes e2 ON e2.id = es.similar_episode_id
      LEFT JOIN episodes_media em ON em.episode_id = e2.id
      WHERE e1.episode_number = ${episodeNumber}
        AND e1.tenant_id = ${tenantId}
        AND e2.tenant_id = ${tenantId}
      ORDER BY es.similarity_score DESC
      LIMIT ${limit}
    `;

    res.json({
      episode_number: episodeNumber,
      count: similar.length,
      similar: similar.map((r: any) => ({
        id: r.episode_number,
        title: r.title,
        guest: r.guest,
        pillar: r.pillar,
        difficulty: r.difficulty,
        similarity: Number(r.similarity_score).toFixed(4),
        thumbnail: r.thumbnail_350,
      })),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- Quiz ---

app.get('/api/quiz', async (req, res) => {
  try {
    if (process.env.DATABASE_URL) return res.json(await dbQueries.getQuiz({
      pillar: req.query.pillar as string,
      difficulty: req.query.difficulty as string,
      limit: parseInt(req.query.limit as string) || 10,
    }));

    let questions = [...quizData.questions];
    const pillar = req.query.pillar as string;
    if (pillar) questions = questions.filter((q: any) => q.pillar === pillar);
    const difficulty = req.query.difficulty as string;
    if (difficulty) questions = questions.filter((q: any) => q.difficulty === difficulty);
    const limit = parseInt(req.query.limit as string) || 10;
    const shuffled = questions.sort(() => Math.random() - 0.5).slice(0, limit);
    res.json({ total_available: questions.length, count: shuffled.length, questions: shuffled });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/quiz/episode/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (process.env.DATABASE_URL) return res.json(await dbQueries.getQuizByEpisode(id));
    const questions = quizData.questions.filter((q: any) => q.episode_id === id);
    res.json({ episode_id: id, count: questions.length, questions });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- Hybrid Search (Couche 3) ---

app.get('/api/search/hybrid', async (req, res) => {
  try {
    if (!process.env.DATABASE_URL || !process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: 'Hybrid search requires DATABASE_URL + OPENAI_API_KEY', db: !!process.env.DATABASE_URL, openai: !!process.env.OPENAI_API_KEY, use_db: USE_DB });
    }
    const q = req.query.q as string;
    if (!q || q.length < 2) return res.status(400).json({ error: 'Query must be at least 2 characters' });
    const limit = parseInt(req.query.limit as string) || 10;
    const depth = (req.query.depth as string) === 'chapter' ? 'chapter' : 'episode';
    const result = await getCached(`search:hybrid:${depth}:${limit}:${q}`, 3600, async () => {
      const { hybridSearch } = await import('./ai/search');
      return await hybridSearch(q, limit, { depth });
    });
    res.json(result);
  } catch (e: any) { console.error('[API] /api/search/hybrid error:', e.message); res.status(500).json({ error: e.message }); }
});

// --- RAG Chat (Couche 3) ---

app.post('/api/chat', async (req, res) => {
  try {
    if (!process.env.DATABASE_URL || !process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: 'Chat requires DATABASE_URL + OPENAI_API_KEY' });
    }
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Missing message' });
    // Normalise pour maximiser les hits cache : lower + trim + collapse whitespace + strip ponctuation finale
    const normalized = String(message).toLowerCase().trim().replace(/\s+/g, ' ').replace(/[?!.,;:]+$/g, '');
    const cacheKey = `chat:${normalized.substring(0, 300)}`;
    const result = await getCached(cacheKey, 86400, async () => {
      const { ragQuery } = await import('./ai/rag');
      return await ragQuery(message);
    });
    res.json(result);
  } catch (e: any) { console.error('[API] /api/chat error:', e.message); res.status(500).json({ error: e.message }); }
});

// --- Cache warm-up (pre-chauffe les queries d\u00e9mo) ---
app.post('/api/cache/warm', async (_req, res) => {
  try {
    if (!process.env.DATABASE_URL || !process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: 'warm requires DATABASE_URL + OPENAI_API_KEY' });
    }
    const queries = [
      'investir en SCPI',
      'ETF ou stock picking',
      'optimiser sa fiscalité',
      'investir dans la crypto',
      'private equity',
      'épargne de précaution',
      'investissement responsable',
      'crowdfunding immobilier',
      'négocier une augmentation',
      'lancer un side business',
    ];

    const { hybridSearch } = await import('./ai/search');
    const { ragQuery } = await import('./ai/rag');

    const t0 = Date.now();
    const [searchResults, chatResults] = await Promise.all([
      Promise.all(queries.map(q =>
        getCached(`search:hybrid:chapter:10:${q}`, 3600, () => hybridSearch(q, 10, { depth: 'chapter' }))
          .then(() => ({ q, ok: true }))
          .catch((e: any) => ({ q, ok: false, error: e.message }))
      )),
      Promise.all(queries.map(q => {
        const normalized = q.toLowerCase().trim().replace(/\s+/g, ' ');
        return getCached(`chat:${normalized.substring(0, 300)}`, 86400, () => ragQuery(q))
          .then(() => ({ q, ok: true }))
          .catch((e: any) => ({ q, ok: false, error: e.message }));
      })),
    ]);

    res.json({
      warmed_ms: Date.now() - t0,
      queries_count: queries.length,
      search: searchResults,
      chat: chatResults,
    });
  } catch (e: any) { console.error('[API] /api/cache/warm error:', e.message); res.status(500).json({ error: e.message }); }
});

// --- POC Chantier 6 weekend 2026-04-25 — knowledge query (LM only) ---
// Endpoint isolé, code dans engine/poc-rag/. À supprimer ou industrialiser.
app.post('/api/knowledge/query', async (req, res) => {
  try {
    if (!process.env.DATABASE_URL || !process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: 'POC requires DATABASE_URL + OPENAI_API_KEY' });
    }
    const { question } = req.body || {};
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Body must contain { "question": "string" }' });
    }
    const { knowledgeQuery } = await import('./poc-rag/handler');
    const result = await knowledgeQuery(question);
    res.json(result);
  } catch (e: any) {
    console.error('[API] /api/knowledge/query error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// --- Demo summary (cheat sheet pitch) ---
// Endpoint pitch (non consommé par les frontends standalone).
// Filtre hosts via HOST_NAME_PATTERNS (dérivé de config, cf. cross-queries.ts)
// → ajouter un host à gdiy.config.coHosts ou à la config d'un nouveau podcast
// suffit à propager le filtre sans toucher au SQL.
app.get('/api/demo/summary', async (_req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'DB required' });
    const result = await getCached('demo:summary', 21600, async () => {
      const { neon } = await import('@neondatabase/serverless');
      const { ensureUniverseInit, HOST_NAME_PATTERNS } = await import('./db/cross-queries');
      await ensureUniverseInit();
      const sql = neon(process.env.DATABASE_URL!);

      async function statsFor(tenant: string) {
        const [ov, sponsor, guest, quizCount, articles] = await Promise.all([
          sql`SELECT count(*)::int AS episodes,
                     COALESCE(SUM(duration_seconds),0)::bigint AS total_seconds,
                     count(DISTINCT COALESCE(NULLIF(guest,''), guest_from_title))
                       FILTER (WHERE COALESCE(NULLIF(guest,''), guest_from_title) IS NOT NULL)::int AS guests
              FROM episodes
              WHERE tenant_id = ${tenant}
                AND (episode_type='full' OR episode_type IS NULL)`,
          sql`SELECT label, count(DISTINCT episode_id)::int AS mentions
              FROM episode_links
              WHERE tenant_id = ${tenant} AND link_type IN ('company','tool')
                AND label IS NOT NULL AND length(label) BETWEEN 2 AND 30
                AND label !~* '^(ce |c[''’]est |cliquez|voir |\u00e9coutez|d\u00e9couvr|https?://|le podcast|tous|ici|lien|site)'
                AND label !~* '(podcast|orso media|cosavostra|deezer|spotify|apple|youtube|apple podcasts|google podcasts|la martingale|g\u00e9n\u00e9ration do it)'
                AND label ~ '[A-Za-z]'
              GROUP BY label ORDER BY mentions DESC LIMIT 1`,
          sql`SELECT COALESCE(NULLIF(guest,''), guest_from_title) AS g, count(*)::int AS eps
              FROM episodes WHERE tenant_id = ${tenant}
                AND COALESCE(NULLIF(guest,''), guest_from_title) IS NOT NULL
                AND (episode_type='full' OR episode_type IS NULL)
                AND lower(COALESCE(NULLIF(guest,''), guest_from_title)) NOT LIKE ALL(${HOST_NAME_PATTERNS}::text[])
              GROUP BY g ORDER BY eps DESC LIMIT 1`,
          sql`SELECT count(*)::int AS c FROM quiz_questions WHERE tenant_id = ${tenant}`,
          sql`SELECT count(*)::int AS c FROM episodes
              WHERE tenant_id = ${tenant}
                AND article_content IS NOT NULL AND length(article_content) > 200`,
        ]) as any[];
        const linksCount = (await sql`SELECT count(*)::int AS c FROM episode_links WHERE tenant_id = ${tenant}`)[0]?.c ?? 0;
        const crossRefs = (await sql`SELECT count(*)::int AS c FROM episode_links WHERE tenant_id = ${tenant} AND link_type = 'episode_ref'`)[0]?.c ?? 0;
        return {
          episodes: Number(ov[0]?.episodes || 0),
          hours: Math.round(Number(ov[0]?.total_seconds || 0) / 3600),
          guests: Number(ov[0]?.guests || 0),
          articles: Number(articles[0]?.c || 0),
          links: Number(linksCount),
          quiz: Number(quizCount[0]?.c || 0),
          top_sponsor: sponsor[0] ? `${sponsor[0].label} (${sponsor[0].mentions} mentions)` : null,
          top_guest: guest[0] ? `${guest[0].g} (${guest[0].eps} eps)` : null,
          cross_references: Number(crossRefs),
        };
      }

      const [lm, gdiy] = await Promise.all([statsFor('lamartingale'), statsFor('gdiy')]);

      // Invités partagés entre les deux tenants (fallback guest_from_title pour GDIY)
      const sharedGuestsRow = await sql`
        WITH lm AS (
          SELECT DISTINCT lower(trim(COALESCE(NULLIF(guest,''), guest_from_title))) AS g
          FROM episodes WHERE tenant_id = 'lamartingale'
            AND COALESCE(NULLIF(guest,''), guest_from_title) IS NOT NULL
        ),
        gd AS (
          SELECT DISTINCT lower(trim(COALESCE(NULLIF(guest,''), guest_from_title))) AS g
          FROM episodes WHERE tenant_id = 'gdiy'
            AND COALESCE(NULLIF(guest,''), guest_from_title) IS NOT NULL
        )
        SELECT count(*)::int AS c FROM lm INNER JOIN gd ON lm.g = gd.g
      ` as any[];
      const sharedGuests = Number(sharedGuestsRow[0]?.c || 0);

      return {
        lamartingale: lm,
        gdiy,
        cross_podcast: {
          shared_guests: sharedGuests,
          total_cross_refs: lm.cross_references + gdiy.cross_references,
          combined_hours: lm.hours + gdiy.hours,
          combined_episodes: lm.episodes + gdiy.episodes,
          combined_articles: lm.articles + gdiy.articles,
          combined_links: lm.links + gdiy.links,
          combined_quiz: lm.quiz + gdiy.quiz,
        },
      };
    });
    res.json(result);
  } catch (e: any) { console.error('[API] /api/demo/summary error:', e.message); res.status(500).json({ error: e.message }); }
});

// --- Adaptive Quiz (Couche 3) ---

app.post('/api/quiz/next', async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'Adaptive quiz requires DATABASE_URL' });
    const { getNextQuestion, initProfile } = await import('./ai/quiz-adaptive');
    const profile = req.body.profile || initProfile();
    const question = await getNextQuestion(profile);
    if (!question) return res.json({ done: true, message: 'Toutes les questions ont été répondues' });
    res.json(question);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/quiz/answer', async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'Adaptive quiz requires DATABASE_URL' });
    const { processAnswer } = await import('./ai/quiz-adaptive');
    const { question_id, answer, profile } = req.body;
    if (!question_id || answer === undefined || !profile) {
      return res.status(400).json({ error: 'Missing question_id, answer, or profile' });
    }
    const result = await processAnswer(question_id, answer, profile);
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- Clustering data (Couche 2) ---

app.get('/api/clustering', (_req, res) => {
  try {
    const clusterPath = path.join(__dirname, '..', 'data', 'clustering.json');
    if (fs.existsSync(clusterPath)) {
      res.json(JSON.parse(fs.readFileSync(clusterPath, 'utf-8')));
    } else {
      res.status(404).json({ error: 'Clustering data not available. Run scripts/clustering.py' });
    }
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- Episode Relation Graph (always JSON-based, graph is structural) ---

app.get('/api/graph', async (_req, res) => {
  try {
    if (process.env.DATABASE_URL) {
      // Fetch all episodes for graph
      const allEps = await dbQueries.getEpisodes({ limit: 500 });
      const expertData = await dbQueries.getExperts();
      const pathData = await dbQueries.getPaths();

      const nodes = allEps.episodes.map((ep: any) => ({
        id: ep.id, title: ep.title, guest: ep.guest_name, pillar: ep.pillar, difficulty: ep.difficulty, tags: [],
      }));

      const edges: any[] = [];
      const edgeSet = new Set<string>();
      const addEdge = (source: number, target: number, type: string, extra: any = {}) => {
        const key = `${Math.min(source, target)}-${Math.max(source, target)}-${type}`;
        if (!edgeSet.has(key)) { edgeSet.add(key); edges.push({ source, target, type, ...extra }); }
      };

      // Guest edges from guest_name
      const byGuest: Record<string, number[]> = {};
      for (const ep of allEps.episodes) {
        if (!ep.guest_name || ep.guest_name.length < 3) continue;
        const key = ep.guest_name.toLowerCase().trim();
        if (!byGuest[key]) byGuest[key] = [];
        byGuest[key].push(ep.id as number);
      }
      for (const epIds of Object.values(byGuest)) {
        if (epIds.length < 2) continue;
        for (let i = 0; i < epIds.length - 1; i++) {
          for (let j = i + 1; j < epIds.length; j++) {
            addEdge(epIds[i], epIds[j], 'same_guest', { weight: 2 });
          }
        }
      }

      const degree: Record<number, number> = {};
      for (const edge of edges) { degree[edge.source] = (degree[edge.source] || 0) + 1; degree[edge.target] = (degree[edge.target] || 0) + 1; }
      const nodesWithDegree = nodes.map((n: any) => ({ ...n, degree: degree[n.id] || 0 }));

      return res.json({ nodes: nodesWithDegree, edges, metadata: { node_count: nodes.length, edge_count: edges.length } });
    }

    // JSON fallback (original code)
    const nodes = episodes.map(ep => ({
      id: ep.id, title: ep.title, guest: ep.guest_name, pillar: ep.pillar, difficulty: ep.difficulty,
      tags: (enrichedData.episodes.find((e: any) => e.id === ep.id) as any)?.tags || [],
    }));
    const edges: any[] = [];
    const edgeSet = new Set<string>();
    const addEdge = (source: number, target: number, type: string, extra: any = {}) => {
      const key = `${Math.min(source, target)}-${Math.max(source, target)}-${type}`;
      if (!edgeSet.has(key)) { edgeSet.add(key); edges.push({ source, target, type, ...extra }); }
    };
    for (const expert of expertsData.experts) {
      const eps = expert.episodes.filter((id: number) => episodes.some(e => e.id === id));
      for (let i = 0; i < eps.length - 1; i++) { for (let j = i + 1; j < eps.length; j++) { addEdge(eps[i], eps[j], 'same_expert', { expert: expert.name, weight: 4 }); } }
    }
    for (const lp of pathsData.learning_paths) {
      for (let i = 0; i < lp.episodes_ordered.length - 1; i++) {
        addEdge(lp.episodes_ordered[i].episode_id, lp.episodes_ordered[i + 1].episode_id, 'learning_path', { path_id: lp.id, weight: 2 });
      }
    }
    const byGuest: Record<string, number[]> = {};
    for (const ep of episodes) { if (!ep.guest_name || ep.guest_name.length < 3) continue; const key = ep.guest_name.toLowerCase().trim(); if (!byGuest[key]) byGuest[key] = []; byGuest[key].push(ep.id); }
    for (const epIds of Object.values(byGuest)) { if (epIds.length < 2) continue; for (let i = 0; i < epIds.length - 1; i++) { for (let j = i + 1; j < epIds.length; j++) { addEdge(epIds[i], epIds[j], 'same_guest', { weight: 2 }); } } }
    const degree: Record<number, number> = {};
    for (const edge of edges) { degree[edge.source] = (degree[edge.source] || 0) + 1; degree[edge.target] = (degree[edge.target] || 0) + 1; }
    res.json({ nodes: nodes.map(n => ({ ...n, degree: degree[n.id] || 0 })), edges, metadata: { node_count: nodes.length, edge_count: edges.length } });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================================================================
// Cross-tenant endpoints — univers MS (agrégats multi-podcasts)
// Rétrocompat : les requêtes mono-tenant ne sont pas impactées.
// ============================================================================

app.get('/api/cross/stats', async (_req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'DB required' });
    const result = await getCached('cross:stats', 600, async () => {
      const { getCrossStats } = await import('./db/cross-queries');
      return await getCrossStats();
    });
    res.json(result);
  } catch (e: any) { console.error('[API] /api/cross/stats error:', e.message); res.status(500).json({ error: e.message }); }
});

app.get('/api/cross/guests', async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'DB required' });
    const limit = parseInt(req.query.limit as string) || 100;
    const result = await getCached(`cross:guests:${limit}`, 600, async () => {
      const { getCrossGuests } = await import('./db/cross-queries');
      return await getCrossGuests({ limit });
    });
    res.json(result);
  } catch (e: any) { console.error('[API] /api/cross/guests error:', e.message); res.status(500).json({ error: e.message }); }
});

app.get('/api/cross/guests/shared', async (_req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'DB required' });
    const result = await getCached('cross:guests:shared', 600, async () => {
      const { getCrossGuests } = await import('./db/cross-queries');
      return await getCrossGuests({ sharedOnly: true });
    });
    res.json(result);
  } catch (e: any) { console.error('[API] /api/cross/guests/shared error:', e.message); res.status(500).json({ error: e.message }); }
});

app.get('/api/cross/guests/:name', async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'DB required' });
    const name = decodeURIComponent(req.params.name);
    const result = await getCached(`cross:guest:${name}`, 600, async () => {
      const { getCrossGuestByName } = await import('./db/cross-queries');
      return await getCrossGuestByName(name);
    });
    if (!result) return res.status(404).json({ error: 'Guest not found in universe' });
    res.json(result);
  } catch (e: any) { console.error('[API] /api/cross/guests/:name error:', e.message); res.status(500).json({ error: e.message }); }
});

// GET brief invité par slug (MEDIUM-3, vitrine guest-brief.html).
// Slug = lower(canonical_name) avec [^a-z0-9]+ → '-'. 24h TTL via getCached.
app.get('/api/cross/guests/:slug/brief', async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'DB required' });
    const slug = decodeURIComponent(req.params.slug).toLowerCase();
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ error: 'invalid slug' });
    }
    const result = await getCached(`guest-brief:${slug}`, 86400, async () => {
      const { neon } = await import('@neondatabase/serverless');
      const sql = neon(process.env.DATABASE_URL!);
      const rows = (await sql`
        SELECT
          id,
          canonical_name,
          display_name,
          linkedin_url,
          tenant_appearances,
          brief_md,
          key_positions,
          quotes,
          original_questions,
          brief_generated_at,
          brief_model
        FROM cross_podcast_guests
        WHERE lower(regexp_replace(canonical_name, '[^a-zA-Z0-9]+', '-', 'g')) = ${slug}
        LIMIT 1
      `) as any[];
      const guest = rows[0];
      if (!guest) return null;

      // Enrichissement source_* — sous-sites routent /episode/:n sur episode_number
      // (clé éditoriale, pas id DB). canonical_url pointe vers le site officiel
      // du podcast quand l'URL existe en DB ; sinon null → frontend fallback plain text.
      const positions = Array.isArray(guest.key_positions) ? guest.key_positions : [];
      const quotes = Array.isArray(guest.quotes) ? guest.quotes : [];
      const refs = new Map<string, { tenant: string; id: number }>();
      for (const p of [...positions, ...quotes]) {
        const tenant = p?.source_podcast;
        const id = Number(p?.source_episode_id);
        if (tenant && Number.isInteger(id) && id > 0) refs.set(`${tenant}:${id}`, { tenant, id });
      }
      const epMap = new Map<string, { episode_number: number | null; canonical_url: string | null }>();
      if (refs.size > 0) {
        const tenants = [...new Set([...refs.values()].map((r) => r.tenant))];
        const ids = [...new Set([...refs.values()].map((r) => r.id))];
        const epRows = (await sql`
          SELECT tenant_id, id, episode_number, url, article_url
          FROM episodes
          WHERE tenant_id = ANY(${tenants}::text[])
            AND id = ANY(${ids}::int[])
        `) as any[];
        for (const r of epRows) {
          const canonical = (r.url && String(r.url).trim()) || (r.article_url && String(r.article_url).trim()) || null;
          epMap.set(`${r.tenant_id}:${r.id}`, {
            episode_number: r.episode_number != null ? Number(r.episode_number) : null,
            canonical_url: canonical,
          });
        }
      }
      const PODCAST_DISPLAY_NAMES: Record<string, string> = {
        lamartingale: 'La Martingale',
        gdiy: 'Génération Do It Yourself',
        lepanier: 'Le Panier',
        finscale: 'Finscale',
        passionpatrimoine: 'Passion Patrimoine',
        combiencagagne: 'Combien ça gagne',
      };
      const enrich = (arr: any[]) =>
        arr.map((p) => {
          const key = `${p?.source_podcast}:${Number(p?.source_episode_id)}`;
          const meta = epMap.get(key);
          return {
            ...p,
            source_episode_number: meta?.episode_number ?? null,
            source_canonical_url: meta?.canonical_url ?? null,
            source_podcast_display: PODCAST_DISPLAY_NAMES[p?.source_podcast] ?? p?.source_podcast ?? null,
          };
        });
      return { ...guest, key_positions: enrich(positions), quotes: enrich(quotes) };
    });
    if (!result) return res.status(404).json({ error: 'Guest not found' });
    if (!result.brief_md) return res.status(404).json({ error: 'No brief generated for this guest' });
    res.json(result);
  } catch (e: any) {
    console.error('[API] /api/cross/guests/:slug/brief error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/cross/search', async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'DB required' });
    const q = req.query.q as string;
    if (!q || q.length < 2) return res.status(400).json({ error: 'Query must be at least 2 characters' });
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await getCached(`cross:search:${limit}:${q}`, 3600, async () => {
      const { crossSearch } = await import('./db/cross-queries');
      return await crossSearch(q, limit);
    });
    res.json(result);
  } catch (e: any) { console.error('[API] /api/cross/search error:', e.message); res.status(500).json({ error: e.message }); }
});

app.get('/api/cross/references', async (_req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'DB required' });
    const result = await getCached('cross:references', 600, async () => {
      const { getCrossReferences } = await import('./db/cross-queries');
      return await getCrossReferences();
    });
    res.json(result);
  } catch (e: any) { console.error('[API] /api/cross/references error:', e.message); res.status(500).json({ error: e.message }); }
});

app.get('/api/cross/sponsors', async (_req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'DB required' });
    const result = await getCached('cross:sponsors', 600, async () => {
      const { getCrossSponsors } = await import('./db/cross-queries');
      return await getCrossSponsors();
    });
    res.json(result);
  } catch (e: any) { console.error('[API] /api/cross/sponsors error:', e.message); res.status(500).json({ error: e.message }); }
});

app.get('/api/cross/timeline', async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'DB required' });
    const limit = parseInt(req.query.limit as string) || 500;
    const result = await getCached(`cross:timeline:${limit}`, 600, async () => {
      const { getCrossTimeline } = await import('./db/cross-queries');
      return await getCrossTimeline({ limit });
    });
    res.json(result);
  } catch (e: any) { console.error('[API] /api/cross/timeline error:', e.message); res.status(500).json({ error: e.message }); }
});

app.get('/api/episodes/:id/cross-similar', async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'DB required' });
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid episode id' });
    const limit = parseInt(req.query.limit as string) || 5;
    const result = await getCached(`cross:similar:${id}:${limit}`, 3600, async () => {
      const { getCrossSimilarEpisodes } = await import('./db/cross-queries');
      return await getCrossSimilarEpisodes(id, limit);
    });
    res.json(result);
  } catch (e: any) { console.error('[API] /api/episodes/:id/cross-similar error:', e.message); res.status(500).json({ error: e.message }); }
});

app.post('/api/cross/chat', async (req, res) => {
  try {
    if (!process.env.DATABASE_URL || !process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: 'Chat requires DATABASE_URL + OPENAI_API_KEY' });
    }
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Missing message' });
    const normalized = String(message).toLowerCase().trim().replace(/\s+/g, ' ').replace(/[?!.,;:]+$/g, '');
    const cacheKey = `cross:chat:${normalized.substring(0, 300)}`;
    const result = await getCached(cacheKey, 86400, async () => {
      const { crossChat } = await import('./db/cross-queries');
      return await crossChat(message);
    });
    res.json(result);
  } catch (e: any) { console.error('[API] /api/cross/chat error:', e.message); res.status(500).json({ error: e.message }); }
});

app.get('/api/cross/analytics', async (_req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'DB required' });
    const result = await getCached('cross:analytics', 1800, async () => {
      const { getCrossAnalytics } = await import('./db/cross-queries');
      return await getCrossAnalytics();
    });
    res.json(result);
  } catch (e: any) { console.error('[API] /api/cross/analytics error:', e.message); res.status(500).json({ error: e.message }); }
});

// ============================================================================
// Auth — Phase E (magic link passwordless + podcast_access scoping)
// ============================================================================

function isValidEmail(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const v = s.trim();
  if (v.length < 5 || v.length > 320) return false;
  // RFC 5322 light — suffisant pour une input de formulaire public.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function baseUrl(req: express.Request): string {
  const envBase = process.env.AUTH_BASE_URL;
  if (envBase) return envBase.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'localhost';
  return `${proto}://${host}`;
}

// POST /api/auth/request-link — body { email } → envoie le magic-link.
// Réponse neutre (pas d'énumération : 200 même si l'email n'a pas d'accès,
// l'autorisation est vérifiée au moment du consume).
app.post('/api/auth/request-link', async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'DB required' });
    const email = (req.body?.email || '').toString();
    if (!isValidEmail(email)) return res.status(400).json({ error: 'invalid_email' });
    const normalizedEmail = email.toLowerCase().trim();
    const { token } = await createMagicLink(normalizedEmail);
    const result = await sendMagicLink({ email: normalizedEmail, token, baseUrl: baseUrl(req) });
    // En mode noop (dev sans RESEND_API_KEY) on expose le lien pour debug.
    const payload: any = { ok: true, sent: result.sent, provider: result.provider };
    if (!result.sent && process.env.NODE_ENV !== 'production') payload.dev_link = result.link;
    if (result.error) payload.error = result.error;
    res.json(payload);
  } catch (e: any) { console.error('[auth] request-link error:', e.message); res.status(500).json({ error: e.message }); }
});

// GET /api/auth/consume?token=... — consomme le token + set cookie + redirige
// vers `next` (ou `/`). Si Accept: application/json → renvoie JSON à la place.
app.get('/api/auth/consume', async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'DB required' });
    const token = (req.query.token as string) || '';
    const wantsJson = (req.headers.accept || '').includes('application/json');
    const consumed = await consumeMagicLink(token);
    if (!consumed) {
      if (wantsJson) return res.status(400).json({ error: 'invalid_or_expired_token' });
      return res.redirect(302, '/login?error=invalid_or_expired_token');
    }
    // Vérifier que l'email a bien un accès (évite d'émettre une session inutile).
    const scope = await getAccessScope(consumed.email);
    if (!scope.isRoot && scope.tenantIds.length === 0) {
      if (wantsJson) return res.status(403).json({ error: 'no_access' });
      return res.redirect(302, '/login?error=no_access');
    }
    const { cookie, expiresAt } = signSession(consumed.email);
    res.setHeader('Set-Cookie', cookieSetHeader(cookie, expiresAt));
    if (wantsJson) return res.json({ ok: true, email: consumed.email, isRoot: scope.isRoot, tenantIds: scope.tenantIds });
    const next = (req.query.next as string) || '/';
    res.redirect(302, next);
  } catch (e: any) { console.error('[auth] consume error:', e.message); res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/logout', (_req, res) => {
  res.setHeader('Set-Cookie', cookieClearHeader());
  res.json({ ok: true });
});

// GET /api/auth/me — retourne la session active (null si déconnecté).
app.get('/api/auth/me', optionalHubAuth, (req, res) => {
  if (!req.session || !req.accessScope) return res.json({ authenticated: false });
  res.json({
    authenticated: true,
    email: req.session.email,
    expiresAt: req.session.expiresAt,
    isRoot: req.accessScope.isRoot,
    tenantIds: req.accessScope.tenantIds,
  });
});

// --- Hub Univers MS ---------------------------------------------------------
// Agrégat des 6 tenants actifs (hors `hub`) pour `frontend/hub.html`.
// Protégé : requireHubAuth → 401 si pas de session, 403 si 0 accès.
// Cache 1h (contenu universe brut partagé) puis filtré per-session à la sortie
// — le scoping est dynamique, donc on ne cache pas la version filtrée.
// Invalidation brute via /api/cache/clear?prefix=universe (ADMIN_TOKEN requis).
app.get('/api/universe', requireHubAuth, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'DB required' });
    const full = await getCached('universe', 3600, async () => {
      const { getUniverse } = await import('./universe');
      return await getUniverse();
    });
    const scope = req.accessScope!;
    if (scope.isRoot) {
      // Bypass filtre : root voit tout.
      return res.json(full);
    }
    // Filtrage : garde uniquement les tenants autorisés. Re-calcule totals
    // + cross refs/pairStats/guests restreints à cet ensemble.
    const allowed = new Set(scope.tenantIds);
    const filtered = filterUniverseByTenants(full as any, allowed);
    res.json(filtered);
  } catch (e: any) { console.error('[API] /api/universe error:', e.message); res.status(500).json({ error: e.message }); }
});

// Helper pur (testable) — filtre la réponse /api/universe à un sous-ensemble de tenants.
export function filterUniverseByTenants(full: any, allowed: Set<string>): any {
  const podcasts = (full.podcasts || []).filter((p: any) => allowed.has(p.id));
  const pairStats = (full.cross?.pairStats || []).filter((s: any) => allowed.has(s.from) && allowed.has(s.to));
  const episodeRefs = (full.cross?.episodeRefs || []).filter((r: any) =>
    allowed.has(r.from?.podcast) && allowed.has(r.to?.podcast),
  );
  const guests = (full.cross?.guests || []).filter((g: any) =>
    (g.podcasts || []).some((p: string) => allowed.has(p)),
  ).map((g: any) => ({
    ...g,
    appearances: (g.appearances || []).filter((a: any) => allowed.has(a.podcast)),
  })).filter((g: any) => g.appearances.length > 0);

  const totalEpisodes = podcasts.reduce((s: number, p: any) => s + (p.stats?.episodes || 0), 0);
  const totalHours = podcasts.reduce((s: number, p: any) => s + (p.stats?.hours || 0), 0);
  const totalGuests = podcasts.reduce((s: number, p: any) => s + (p.stats?.guests || 0), 0);
  const crossEpisodeRefs = pairStats.reduce((s: number, p: any) => s + (p.count || 0), 0);

  return {
    ...full,
    universe: {
      ...full.universe,
      totals: {
        podcasts: podcasts.length,
        episodes: totalEpisodes,
        hours: totalHours,
        guests: totalGuests,
        crossGuests: guests.length,
        crossEpisodeRefs,
      },
    },
    podcasts,
    cross: { guests, episodeRefs, pairStats },
  };
}

// --- Enriched Episode Data ---

app.get('/api/enriched/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (process.env.DATABASE_URL) {
      const result = await dbQueries.getEnrichedById(id);
      if (!result) return res.status(404).json({ error: 'Enriched data not found' });
      return res.json(result);
    }
    const enriched = enrichedData.episodes.find((e: any) => e.id === id);
    if (!enriched) return res.status(404).json({ error: 'Enriched data not found' });
    res.json(enriched);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- Media ---

app.get('/api/media', async (_req, res) => {
  try {
    if (process.env.DATABASE_URL) return res.json(await dbQueries.getMediaAll());
    res.json(mediaData.by_id);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/media/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (process.env.DATABASE_URL) {
      const result = await dbQueries.getMediaById(id);
      if (!result) return res.status(404).json({ error: 'No media for this episode' });
      return res.json(result);
    }
    const media = mediaData.by_id[req.params.id];
    if (!media) return res.status(404).json({ error: 'No media for this episode' });
    res.json(media);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- Tags ---

app.get('/api/tags', async (_req, res) => {
  try {
    if (process.env.DATABASE_URL) return res.json(await dbQueries.getTags());
    const tagCounts: Record<string, number> = {};
    for (const ep of enrichedData.episodes) { for (const tag of (ep.tags || [])) { tagCounts[tag] = (tagCounts[tag] || 0) + 1; } }
    const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count }));
    res.json({ total_tags: sorted.length, tags: sorted });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- Search ---

app.get('/api/search', async (req, res) => {
  try {
    // Tool search mode — retrouver épisodes mentionnant un outil/entreprise
    const tool = req.query.tool as string;
    if (tool) {
      if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'DB required' });
      return res.json(await dbQueries.searchByTool(tool));
    }

    const q = (req.query.q as string || '').toLowerCase();
    if (!q || q.length < 2) return res.status(400).json({ error: 'Query must be at least 2 characters' });

    if (process.env.DATABASE_URL) return res.json(await dbQueries.searchAll(q));

    const enrichedLookup: Record<number, any> = {};
    for (const e of enrichedData.episodes) { enrichedLookup[e.id] = e; }
    const matchedEpisodes = episodes.filter(ep => {
      if (ep.title.toLowerCase().includes(q)) return true;
      if (ep.guest_name.toLowerCase().includes(q)) return true;
      const en = enrichedLookup[ep.id];
      if (!en) return false;
      if ((en.search_text || '').includes(q)) return true;
      if ((en.tags || []).some((t: string) => t.includes(q))) return true;
      return false;
    }).map(ep => ({ ...ep, tags: enrichedLookup[ep.id]?.tags || [], sub_themes: enrichedLookup[ep.id]?.sub_themes || [] })).slice(0, 20);
    const matchedExperts = expertsData.experts.filter(ex => ex.name.toLowerCase().includes(q) || ex.company.toLowerCase().includes(q) || ex.specialty.some(s => s.toLowerCase().includes(q))).slice(0, 10);
    const matchedPaths = pathsData.learning_paths.filter(p => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
    res.json({ query: q, episodes: matchedEpisodes, experts: matchedExperts, paths: matchedPaths.map(p => ({ id: p.id, name: p.name, description: p.description })) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================================================================
// Start Server
// ============================================================================

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n=== ${getConfig().name} API ===`);
    console.log(`Server: http://localhost:${PORT}`);
    console.log(`Data source: ${USE_DB ? 'Neon Postgres' : 'JSON files'}`);
    console.log(`Endpoints: 20+ (episodes, experts, paths, quiz, graph, search, media, tags, stats, recommend)`);
  });
}

export default app;
