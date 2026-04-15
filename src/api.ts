import express from 'express';
import cors from 'cors';
import * as fs from 'fs';
import * as path from 'path';
import type { Episode, Expert, LearningPath, Difficulty, Pillar, UserProfile, Recommendation } from './types';
import { getRecommendations } from './types';

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// V2 brand-aligned route
app.get('/v2', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'v2.html'));
});

const PORT = process.env.PORT || 3001;

// ============================================================================
// Data Loading
// ============================================================================

function loadJSON<T>(filename: string): T {
  const filePath = path.join(__dirname, '..', 'data', filename);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

const episodesData = loadJSON<{ episodes: any[] }>('episodes-complete-index.json');
const expertsData = loadJSON<{ experts: Expert[] }>('experts.json');
const pathsData = loadJSON<{ learning_paths: LearningPath[] }>('learning-paths.json');
const taxonomyData = loadJSON<any>('taxonomy.json');

// Map difficulty abbreviations
function mapDifficulty(d: string): Difficulty {
  if (d === 'DEB') return 'DEBUTANT';
  if (d === 'INT') return 'INTERMEDIAIRE';
  if (d === 'AVA') return 'AVANCE';
  return d as Difficulty;
}

// Normalize episodes from compact index
const episodes: Episode[] = episodesData.episodes.map((ep: any) => ({
  id: ep.id,
  title: ep.title,
  guest_name: ep.guest,
  guest_company: '',
  format: 'INTERVIEW' as const,
  pillar: ep.pillar as Pillar,
  sub_theme: '',
  tags: [],
  difficulty: mapDifficulty(ep.difficulty),
  learning_paths: [],
  url: `https://lamartingale.io/episodes/${ep.id}`,
}));

// ============================================================================
// API Routes
// ============================================================================

// --- Episodes ---

app.get('/api/episodes', (req, res) => {
  let result = [...episodes];

  // Filter by pillar
  const pillar = req.query.pillar as string;
  if (pillar) {
    result = result.filter(ep => ep.pillar === pillar);
  }

  // Filter by difficulty
  const difficulty = req.query.difficulty as string;
  if (difficulty) {
    result = result.filter(ep => ep.difficulty === difficulty);
  }

  // Search by title or guest
  const search = req.query.search as string;
  if (search) {
    const q = search.toLowerCase();
    result = result.filter(ep =>
      ep.title.toLowerCase().includes(q) ||
      ep.guest_name.toLowerCase().includes(q)
    );
  }

  // Pagination
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const start = (page - 1) * limit;

  res.json({
    total: result.length,
    page,
    limit,
    pages: Math.ceil(result.length / limit),
    episodes: result.slice(start, start + limit),
  });
});

app.get('/api/episodes/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const episode = episodes.find(ep => ep.id === id);
  if (!episode) return res.status(404).json({ error: 'Episode not found' });

  // Find related episodes from same pillar
  const related = episodes
    .filter(ep => ep.pillar === episode.pillar && ep.id !== episode.id)
    .slice(0, 5);

  // Find expert
  const expert = expertsData.experts.find(ex =>
    ex.episodes.includes(episode.id)
  );

  res.json({ episode, related, expert });
});

// --- Experts ---

app.get('/api/experts', (req, res) => {
  let result = [...expertsData.experts];

  const specialty = req.query.specialty as string;
  if (specialty) {
    const q = specialty.toLowerCase();
    result = result.filter(ex =>
      ex.specialty.some(s => s.toLowerCase().includes(q))
    );
  }

  // Sort by authority score
  result.sort((a, b) => b.authority_score - a.authority_score);

  res.json({ total: result.length, experts: result });
});

app.get('/api/experts/:id', (req, res) => {
  const expert = expertsData.experts.find(ex => ex.id === req.params.id);
  if (!expert) return res.status(404).json({ error: 'Expert not found' });

  const expertEpisodes = episodes.filter(ep => expert.episodes.includes(ep.id));
  res.json({ expert, episodes: expertEpisodes });
});

// --- Learning Paths ---

app.get('/api/paths', (_req, res) => {
  const paths = pathsData.learning_paths.map(p => ({
    id: p.id,
    name: p.name,
    description: p.description,
    difficulty: p.difficulty,
    estimated_hours: p.estimated_hours,
    episode_count: p.episodes_ordered.length,
    target_audience: p.target_audience,
    outcomes: p.outcomes,
  }));
  res.json({ total: paths.length, paths });
});

app.get('/api/paths/:id', (req, res) => {
  const lpath = pathsData.learning_paths.find(p => p.id === req.params.id);
  if (!lpath) return res.status(404).json({ error: 'Path not found' });

  // Resolve episodes
  const resolvedSteps = lpath.episodes_ordered.map(step => ({
    ...step,
    episode: episodes.find(ep => ep.id === step.episode_id),
  }));

  res.json({ path: { ...lpath, steps: resolvedSteps } });
});

// --- Taxonomy ---

app.get('/api/taxonomy', (_req, res) => {
  res.json(taxonomyData);
});

app.get('/api/taxonomy/pillars', (_req, res) => {
  const pillars = taxonomyData.pillars.map((p: any) => ({
    id: p.id,
    name: p.name,
    icon: p.icon,
    color: p.color,
    episode_count: p.episode_count,
    sub_theme_count: p.sub_themes.length,
  }));
  res.json({ pillars });
});

app.get('/api/taxonomy/pillars/:id', (req, res) => {
  const pillar = taxonomyData.pillars.find((p: any) => p.id === req.params.id);
  if (!pillar) return res.status(404).json({ error: 'Pillar not found' });

  // Resolve episodes in sub_themes
  const resolved = {
    ...pillar,
    sub_themes: pillar.sub_themes.map((st: any) => ({
      ...st,
      episodes: st.episodes.map((id: number) => episodes.find(ep => ep.id === id)).filter(Boolean),
    })),
  };

  res.json(resolved);
});

// --- Recommendations ---

app.post('/api/recommend', (req, res) => {
  const profile: UserProfile = req.body;

  if (!profile.interests || !profile.investment_experience) {
    return res.status(400).json({ error: 'Missing interests or investment_experience' });
  }

  // Enrich episodes with learning_paths before scoring
  const episodesWithPaths: Episode[] = episodes.map(ep => {
    const enriched = enrichedData.episodes.find((e: any) => e.id === ep.id);
    return { ...ep, learning_paths: enriched?.learning_paths || [] };
  });

  const limit = parseInt(req.query.limit as string) || 10;
  const recommendations = getRecommendations(profile, episodesWithPaths, limit);

  res.json({
    total: recommendations.length,
    recommendations,
  });
});

// --- Stats ---

app.get('/api/stats', (_req, res) => {
  const pillarCounts: Record<string, number> = {};
  const difficultyCounts: Record<string, number> = {};

  for (const ep of episodes) {
    pillarCounts[ep.pillar] = (pillarCounts[ep.pillar] || 0) + 1;
    difficultyCounts[ep.difficulty] = (difficultyCounts[ep.difficulty] || 0) + 1;
  }

  res.json({
    total_episodes: episodes.length,
    total_experts: expertsData.experts.length,
    total_paths: pathsData.learning_paths.length,
    total_pillars: taxonomyData.pillars.length,
    episodes_by_pillar: pillarCounts,
    episodes_by_difficulty: difficultyCounts,
    top_experts: expertsData.experts
      .sort((a, b) => b.authority_score - a.authority_score)
      .slice(0, 5)
      .map(e => ({ name: e.name, score: e.authority_score, episodes: e.episodes.length })),
  });
});

// --- Quiz ---

let quizData: any = { questions: [] };
const quizPath = path.join(__dirname, '..', 'data', 'quiz-bank.json');
if (fs.existsSync(quizPath)) {
  quizData = JSON.parse(fs.readFileSync(quizPath, 'utf-8'));
}

let enrichedData: any = { episodes: [] };
const enrichedPath = path.join(__dirname, '..', 'data', 'episodes-ai-enriched.json');
if (fs.existsSync(enrichedPath)) {
  enrichedData = JSON.parse(fs.readFileSync(enrichedPath, 'utf-8'));
}

app.get('/api/quiz', (req, res) => {
  let questions = [...quizData.questions];

  // Filter by pillar
  const pillar = req.query.pillar as string;
  if (pillar) questions = questions.filter((q: any) => q.pillar === pillar);

  // Filter by difficulty
  const difficulty = req.query.difficulty as string;
  if (difficulty) questions = questions.filter((q: any) => q.difficulty === difficulty);

  // Shuffle and limit
  const limit = parseInt(req.query.limit as string) || 10;
  const shuffled = questions.sort(() => Math.random() - 0.5).slice(0, limit);

  res.json({
    total_available: questions.length,
    count: shuffled.length,
    questions: shuffled,
  });
});

app.get('/api/quiz/episode/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const questions = quizData.questions.filter((q: any) => q.episode_id === id);
  res.json({ episode_id: id, count: questions.length, questions });
});

// --- Episode Relation Graph ---

app.get('/api/graph', (_req, res) => {
  const nodes = episodes.map(ep => ({
    id: ep.id,
    title: ep.title,
    guest: ep.guest_name,
    pillar: ep.pillar,
    difficulty: ep.difficulty,
    tags: (enrichedData.episodes.find((e: any) => e.id === ep.id) as any)?.tags || [],
  }));

  const edges: any[] = [];
  const edgeSet = new Set<string>();

  const addEdge = (source: number, target: number, type: string, extra: any = {}) => {
    const key = `${Math.min(source, target)}-${Math.max(source, target)}-${type}`;
    if (!edgeSet.has(key)) {
      edgeSet.add(key);
      edges.push({ source, target, type, ...extra });
    }
  };

  // Same-guest edges: episodes sharing the same main expert
  for (const expert of expertsData.experts) {
    const eps = expert.episodes.filter(id => episodes.some(e => e.id === id));
    for (let i = 0; i < eps.length - 1; i++) {
      for (let j = i + 1; j < eps.length; j++) {
        addEdge(eps[i], eps[j], 'same_expert', { expert: expert.name, weight: 4 });
      }
    }
  }

  // Learning path edges: ordered progression within each path
  for (const lp of pathsData.learning_paths) {
    for (let i = 0; i < lp.episodes_ordered.length - 1; i++) {
      addEdge(
        lp.episodes_ordered[i].episode_id,
        lp.episodes_ordered[i + 1].episode_id,
        'learning_path',
        { path_id: lp.id, weight: 2 }
      );
    }
  }

  // Same-guest from episode data (guests appearing in multiple episodes)
  const byGuest: Record<string, number[]> = {};
  for (const ep of episodes) {
    if (!ep.guest_name || ep.guest_name.length < 3) continue;
    const key = ep.guest_name.toLowerCase().trim();
    if (!byGuest[key]) byGuest[key] = [];
    byGuest[key].push(ep.id);
  }
  for (const epIds of Object.values(byGuest)) {
    if (epIds.length < 2) continue;
    for (let i = 0; i < epIds.length - 1; i++) {
      for (let j = i + 1; j < epIds.length; j++) {
        addEdge(epIds[i], epIds[j], 'same_guest', { weight: 2 });
      }
    }
  }

  // Compute degree for each node
  const degree: Record<number, number> = {};
  for (const edge of edges) {
    degree[edge.source] = (degree[edge.source] || 0) + 1;
    degree[edge.target] = (degree[edge.target] || 0) + 1;
  }
  const nodesWithDegree = nodes.map(n => ({ ...n, degree: degree[n.id] || 0 }));

  res.json({
    nodes: nodesWithDegree,
    edges,
    metadata: { node_count: nodes.length, edge_count: edges.length },
  });
});

// --- Enriched Episode Data ---

app.get('/api/enriched/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const enriched = enrichedData.episodes.find((e: any) => e.id === id);
  if (!enriched) return res.status(404).json({ error: 'Enriched data not found' });
  res.json(enriched);
});

// --- Tags ---

app.get('/api/tags', (_req, res) => {
  const tagCounts: Record<string, number> = {};
  for (const ep of enrichedData.episodes) {
    for (const tag of (ep.tags || [])) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }

  const sorted = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ tag, count }));

  res.json({ total_tags: sorted.length, tags: sorted });
});

// --- Search ---

app.get('/api/search', (req, res) => {
  const q = (req.query.q as string || '').toLowerCase();
  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }

  // Build enriched lookup for full-text search
  const enrichedLookup: Record<number, any> = {};
  for (const e of enrichedData.episodes) {
    enrichedLookup[e.id] = e;
  }

  const matchedEpisodes = episodes.filter(ep => {
    if (ep.title.toLowerCase().includes(q)) return true;
    if (ep.guest_name.toLowerCase().includes(q)) return true;
    const enriched = enrichedLookup[ep.id];
    if (!enriched) return false;
    if ((enriched.search_text || '').includes(q)) return true;
    if ((enriched.tags || []).some((t: string) => t.includes(q))) return true;
    if ((enriched.sub_themes || []).some((s: string) => s.toLowerCase().includes(q))) return true;
    return false;
  }).map(ep => ({
    ...ep,
    tags: enrichedLookup[ep.id]?.tags || [],
    sub_themes: enrichedLookup[ep.id]?.sub_themes || [],
  })).slice(0, 20);

  const matchedExperts = expertsData.experts.filter(ex =>
    ex.name.toLowerCase().includes(q) ||
    ex.company.toLowerCase().includes(q) ||
    ex.specialty.some(s => s.toLowerCase().includes(q))
  ).slice(0, 10);

  const matchedPaths = pathsData.learning_paths.filter(p =>
    p.name.toLowerCase().includes(q) ||
    p.description.toLowerCase().includes(q)
  );

  res.json({
    query: q,
    episodes: matchedEpisodes,
    experts: matchedExperts,
    paths: matchedPaths.map(p => ({ id: p.id, name: p.name, description: p.description })),
  });
});

// ============================================================================
// Start Server
// ============================================================================

// Only listen when run directly (not imported by Vercel)
if (require.main === module) {
app.listen(PORT, () => {
  console.log(`\n=== La Martingale API ===`);
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`\nEndpoints:`);
  console.log(`  GET  /api/episodes          - List episodes (filter: pillar, difficulty, search)`);
  console.log(`  GET  /api/episodes/:id      - Episode detail + related`);
  console.log(`  GET  /api/experts           - List experts`);
  console.log(`  GET  /api/experts/:id       - Expert detail + episodes`);
  console.log(`  GET  /api/paths             - Learning paths`);
  console.log(`  GET  /api/paths/:id         - Path detail with steps`);
  console.log(`  GET  /api/taxonomy          - Full taxonomy`);
  console.log(`  GET  /api/taxonomy/pillars  - Pillars summary`);
  console.log(`  GET  /api/taxonomy/pillars/:id - Pillar detail`);
  console.log(`  POST /api/recommend         - Personalized recommendations`);
  console.log(`  GET  /api/stats             - Dashboard stats`);
  console.log(`  GET  /api/search?q=...      - Global search`);
  console.log(`  GET  /api/quiz             - Random quiz (filter: pillar, difficulty, limit)`);
  console.log(`  GET  /api/quiz/episode/:id  - Quiz for specific episode`);
  console.log(`  GET  /api/enriched/:id     - Enriched episode data (tags, sub-themes)`);
  console.log(`  GET  /api/tags             - All tags with counts`);
  console.log(`  GET  /api/graph            - Episode relation graph (nodes + edges)`);
  console.log(`\nData: ${episodes.length} episodes, ${expertsData.experts.length} experts, ${pathsData.learning_paths.length} paths, ${quizData.questions.length} quiz questions\n`);
});
}

export default app;
