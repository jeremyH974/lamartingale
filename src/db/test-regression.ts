import 'dotenv/config';

// ============================================================================
// Test de non-régression : compare réponses JSON vs DB pour chaque endpoint
// ============================================================================

const BASE = 'http://localhost:3001/api';

interface TestResult {
  endpoint: string;
  status: '✅' | '❌' | '⚠️';
  detail: string;
}

async function fetchJSON(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function testEndpoint(name: string, url: string, validate: (data: any) => string | null): Promise<TestResult> {
  try {
    const data = await fetchJSON(url);
    const err = validate(data);
    if (err) return { endpoint: name, status: '❌', detail: err };
    return { endpoint: name, status: '✅', detail: 'OK' };
  } catch (e: any) {
    return { endpoint: name, status: '❌', detail: e.message };
  }
}

async function testPost(name: string, url: string, body: any, validate: (data: any) => string | null): Promise<TestResult> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const err = validate(data);
    if (err) return { endpoint: name, status: '❌', detail: err };
    return { endpoint: name, status: '✅', detail: 'OK' };
  } catch (e: any) {
    return { endpoint: name, status: '❌', detail: e.message };
  }
}

async function main() {
  console.log('[COUCHE 1][TEST] Starting non-regression tests...\n');

  const results: TestResult[] = [];

  // 1. Stats
  results.push(await testEndpoint('GET /api/stats', `${BASE}/stats`, (d) => {
    if (d.total_episodes < 300) return `Only ${d.total_episodes} episodes (expected 307)`;
    if (!d.episodes_by_pillar) return 'Missing episodes_by_pillar';
    if (!d.episodes_by_difficulty) return 'Missing episodes_by_difficulty';
    return null;
  }));

  // 2. Episodes list
  results.push(await testEndpoint('GET /api/episodes', `${BASE}/episodes?limit=5`, (d) => {
    if (!d.episodes || d.episodes.length === 0) return 'No episodes returned';
    if (!d.total || d.total < 300) return `Total too low: ${d.total}`;
    const ep = d.episodes[0];
    if (!ep.id || !ep.title || !ep.pillar) return 'Missing fields in episode';
    return null;
  }));

  // 3. Episode detail
  results.push(await testEndpoint('GET /api/episodes/312', `${BASE}/episodes/312`, (d) => {
    if (!d.episode) return 'Missing episode';
    if (d.episode.id !== 312) return `Wrong episode: ${d.episode.id}`;
    if (!d.episode.title) return 'Missing title';
    if (!d.audio_player && d.audio_player !== null) return 'Missing audio_player field';
    if (!d.related || !Array.isArray(d.related)) return 'Missing related';
    return null;
  }));

  // 4. Experts
  results.push(await testEndpoint('GET /api/experts', `${BASE}/experts`, (d) => {
    if (!d.experts || d.experts.length < 20) return `Only ${d.experts?.length} experts`;
    return null;
  }));

  // 5. Paths
  results.push(await testEndpoint('GET /api/paths', `${BASE}/paths`, (d) => {
    if (!d.paths || d.paths.length < 5) return `Only ${d.paths?.length} paths`;
    return null;
  }));

  // 6. Path detail
  results.push(await testEndpoint('GET /api/paths/debutant_fondamentaux', `${BASE}/paths/debutant_fondamentaux`, (d) => {
    if (!d.path) return 'Missing path';
    if (!d.path.name) return 'Missing name';
    if (!d.path.steps || d.path.steps.length === 0) return 'No steps';
    return null;
  }));

  // 7. Taxonomy
  results.push(await testEndpoint('GET /api/taxonomy', `${BASE}/taxonomy`, (d) => {
    if (!d.pillars || d.pillars.length < 10) return `Only ${d.pillars?.length} pillars`;
    return null;
  }));

  // 8. Quiz
  results.push(await testEndpoint('GET /api/quiz?limit=5', `${BASE}/quiz?limit=5`, (d) => {
    if (!d.questions || d.questions.length === 0) return 'No questions';
    const q = d.questions[0];
    if (!q.question || !q.options) return 'Missing fields in question';
    return null;
  }));

  // 9. Quiz by episode
  results.push(await testEndpoint('GET /api/quiz/episode/312', `${BASE}/quiz/episode/312`, (d) => {
    if (d.count === undefined) return 'Missing count';
    return null;
  }));

  // 10. Enriched
  results.push(await testEndpoint('GET /api/enriched/312', `${BASE}/enriched/312`, (d) => {
    if (!d.tags && !d.id) return 'Missing enriched data';
    return null;
  }));

  // 11. Search
  results.push(await testEndpoint('GET /api/search?q=bitcoin', `${BASE}/search?q=bitcoin`, (d) => {
    if (!d.episodes || d.episodes.length === 0) return 'No search results';
    return null;
  }));

  // 12. Tags
  results.push(await testEndpoint('GET /api/tags', `${BASE}/tags`, (d) => {
    if (!d.tags || d.tags.length === 0) return 'No tags';
    return null;
  }));

  // 13. Media
  results.push(await testEndpoint('GET /api/media/312', `${BASE}/media/312`, (d) => {
    if (!d.thumbnail_350 && !d.thumbnail_full) return 'No media data';
    return null;
  }));

  // 14. Graph
  results.push(await testEndpoint('GET /api/graph', `${BASE}/graph`, (d) => {
    if (!d.nodes || d.nodes.length < 200) return `Only ${d.nodes?.length} nodes`;
    return null;
  }));

  // 15. Recommend
  results.push(await testPost('POST /api/recommend', `${BASE}/recommend?limit=5`, {
    investment_experience: 'DEBUTANT',
    interests: ['IMMOBILIER', 'BOURSE'],
    goals: ['BUY_HOME'],
    completed_episodes: [],
    age_range: '25-35',
    patrimony_level: 'STARTER',
  }, (d) => {
    if (!d.recommendations || d.recommendations.length === 0) return 'No recommendations';
    return null;
  }));

  // --- Report ---
  console.log('\n  Endpoint                           | Status | Detail');
  console.log('  -----------------------------------|--------|-------');
  let passed = 0, failed = 0;
  for (const r of results) {
    console.log(`  ${r.endpoint.padEnd(37)}| ${r.status}     | ${r.detail}`);
    if (r.status === '✅') passed++;
    else failed++;
  }
  console.log(`\n  TOTAL: ${passed}/${results.length} passed, ${failed} failed`);
  console.log(`  ${failed === 0 ? '✅ ALL TESTS PASSED — ready for deploy' : '❌ SOME TESTS FAILED'}`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
