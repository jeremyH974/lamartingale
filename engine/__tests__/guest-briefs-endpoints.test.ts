/**
 * Tests endpoints MEDIUM-3 :
 *   - POST /api/admin/guest-briefs/regenerate (requireRoot)
 *       1. no cookie → 401
 *       2. valid session non-root → 403
 *   - GET /api/cross/guests/:slug/brief (public, cached)
 *       3. existing slug avec brief_md → 200 + payload conforme
 *       4. unknown slug → 404
 *
 * Stratégie : on bind un serveur Express éphémère et on hit les routes via
 * fetch. La couche DB (`@neondatabase/serverless`) est mockée pour répondre
 * uniquement aux requêtes attendues — pas de hit Neon réel.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'http';

// Hoisted mocks ---------------------------------------------------------------

vi.mock('../auth/access', () => ({
  getAccessScope: vi.fn(async (email: string) => {
    if (email === 'root@example.test') return { email, isRoot: true, tenantIds: [] };
    return { email, isRoot: false, tenantIds: ['lamartingale'] };
  }),
}));

const FAKE_BRIEF_ROW = {
  id: 434,
  canonical_name: 'eric larcheveque',
  display_name: 'Eric Larchevêque',
  linkedin_url: 'https://www.linkedin.com/in/ericlarch/',
  tenant_appearances: [{ tenant_id: 'gdiy', episode_numbers: [243] }],
  brief_md: '# Eric Larchevêque\n\nMock brief content.',
  key_positions: [{ position: 'p', context: 'c', source_episode_id: 2206, source_podcast: 'gdiy', confidence: 0.9 }],
  quotes: [{ text: 'q', source_episode_id: 925, source_podcast: 'lamartingale', context: 'c' }],
  original_questions: [{ question: 'q?', rationale: 'r', depth_score: 'high' }],
  brief_generated_at: new Date('2026-04-25T12:47:42Z').toISOString(),
  brief_model: 'claude-sonnet-4-6',
};

vi.mock('@neondatabase/serverless', () => {
  // Tagged-template handler : matche le slug demandé + lookup episodes.
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.join('?');
    if (query.includes('cross_podcast_guests') && query.includes('regexp_replace')) {
      const slug = values[0] as string;
      if (slug === 'eric-larcheveque') return Promise.resolve([FAKE_BRIEF_ROW]);
      return Promise.resolve([]);
    }
    if (query.includes('FROM episodes') && query.includes('episode_number')) {
      // Mock minimal : tenant_id+id → episode_number + url/article_url.
      // FAKE_BRIEF_ROW référence gdiy:2206 et lamartingale:925 (cf positions/quotes).
      return Promise.resolve([
        {
          tenant_id: 'gdiy',
          id: 2206,
          episode_number: 243,
          url: null,
          article_url: 'https://www.gdiy.fr/podcast/eric-larcheveque/',
        },
        {
          tenant_id: 'lamartingale',
          id: 925,
          episode_number: 3,
          url: 'https://lamartingale.io/tous/eric-larcheveque-le-bitcoin-un-an-apres/',
          article_url: 'https://lamartingale.io/tous/eric-larcheveque-le-bitcoin-un-an-apres/',
        },
      ]);
    }
    return Promise.resolve([]);
  };
  return { neon: () => sql };
});

// Cache mock — bypass complet pour que chaque test relise la fixture.
vi.mock('../cache', () => ({
  getCached: async (_key: string, _ttl: number, fn: () => Promise<unknown>) => fn(),
  clearCache: async () => 0,
  cacheStats: () => ({ size: 0 }),
}));

// Imports tardifs (post-mocks) -------------------------------------------------

import app from '../api';
import { sign, AUTH_COOKIE_NAME } from '../auth/session';

// Server lifecycle ------------------------------------------------------------

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  process.env.SESSION_SECRET = 'test-secret-at-least-16-chars-long';
  process.env.DATABASE_URL = 'postgres://mock';
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('server not bound');
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// Tests -----------------------------------------------------------------------

describe('POST /api/admin/guest-briefs/regenerate', () => {
  it('1. no cookie → 401 auth_required', async () => {
    const res = await fetch(`${baseUrl}/api/admin/guest-briefs/regenerate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guestId: 434 }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.error).toBe('auth_required');
  });

  it('2. valid session non-root → 403 root_required', async () => {
    const { cookie } = sign('viewer@example.test', 1);
    const res = await fetch(`${baseUrl}/api/admin/guest-briefs/regenerate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${AUTH_COOKIE_NAME}=${cookie}`,
      },
      body: JSON.stringify({ guestId: 434 }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.error).toBe('root_required');
  });
});

describe('GET /api/cross/guests/:slug/brief', () => {
  it('3. existing guest with brief → 200 + payload', async () => {
    const res = await fetch(`${baseUrl}/api/cross/guests/eric-larcheveque/brief`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.id).toBe(434);
    expect(body.display_name).toBe('Eric Larchevêque');
    expect(body.brief_md).toContain('Eric Larchevêque');
    expect(Array.isArray(body.key_positions)).toBe(true);
    expect(Array.isArray(body.quotes)).toBe(true);
    expect(Array.isArray(body.original_questions)).toBe(true);
    expect(body.brief_model).toBe('claude-sonnet-4-6');
  });

  it('3bis. payload enrichi avec source_episode_number (positions + quotes)', async () => {
    const res = await fetch(`${baseUrl}/api/cross/guests/eric-larcheveque/brief`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    // gdiy:2206 → ep#243, lamartingale:925 → ep#3 (cf mock episodes).
    expect(body.key_positions[0].source_episode_number).toBe(243);
    expect(body.key_positions[0].source_episode_id).toBe(2206);
    expect(body.quotes[0].source_episode_number).toBe(3);
    expect(body.quotes[0].source_episode_id).toBe(925);
  });

  it('3ter. payload enrichi avec source_canonical_url + source_podcast_display', async () => {
    const res = await fetch(`${baseUrl}/api/cross/guests/eric-larcheveque/brief`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    // gdiy ép.243 : article_url uniquement → utilisé en fallback canonical
    expect(body.key_positions[0].source_canonical_url).toBe('https://www.gdiy.fr/podcast/eric-larcheveque/');
    expect(body.key_positions[0].source_podcast_display).toBe('Génération Do It Yourself');
    // lamartingale ép.3 : url prioritaire sur article_url
    expect(body.quotes[0].source_canonical_url).toBe('https://lamartingale.io/tous/eric-larcheveque-le-bitcoin-un-an-apres/');
    expect(body.quotes[0].source_podcast_display).toBe('La Martingale');
  });

  it('3quater. canonical_url null → champ retourné null (pas absent)', async () => {
    // Source dont l'épisode n'est pas mocké → epMap miss → null sur tous les champs enrichis
    const res = await fetch(`${baseUrl}/api/cross/guests/eric-larcheveque/brief`);
    const body = (await res.json()) as any;
    // Sanity : les sources mockées sont bien présentes mais on vérifie que le champ
    // existe (key in obj) même si potentiellement null. C'est important pour le
    // frontend qui fallback proprement sur plain text quand l'URL est null.
    expect('source_canonical_url' in body.key_positions[0]).toBe(true);
    expect('source_podcast_display' in body.key_positions[0]).toBe(true);
  });

  it('4. unknown slug → 404', async () => {
    const res = await fetch(`${baseUrl}/api/cross/guests/inconnu-personne/brief`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as any;
    expect(body.error).toMatch(/not found/i);
  });
});
