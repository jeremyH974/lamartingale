/**
 * Tests requireRoot middleware — 3 cas :
 *   1. No cookie → 401 auth_required
 *   2. Valid session but non-root → 403 root_required
 *   3. Valid session + root → next() called, no res.status()
 *
 * `getAccessScope` est mocké via vi.mock pour isoler le middleware de la DB.
 * Les sessions sont signées via le vrai HMAC (pas de mock).
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

// Mock access avant l'import du middleware (hoisting vi.mock).
vi.mock('../auth/access', () => ({
  getAccessScope: vi.fn(async (email: string) => {
    if (email === 'root@example.test') return { email, isRoot: true, tenantIds: [] };
    if (email === 'viewer@example.test') return { email, isRoot: false, tenantIds: ['lamartingale'] };
    return { email, isRoot: false, tenantIds: [] };
  }),
}));

import { requireRoot } from '../auth/middleware';
import { sign, AUTH_COOKIE_NAME } from '../auth/session';

function mockReqRes(cookieValue?: string) {
  const req: any = {
    headers: cookieValue ? { cookie: `${AUTH_COOKIE_NAME}=${cookieValue}` } : {},
  };
  const res: any = {
    statusCode: 0,
    body: null as any,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: any) { this.body = payload; return this; },
  };
  let nextCalled = false;
  const next = () => { nextCalled = true; };
  return { req, res, next, getNextCalled: () => nextCalled };
}

describe('auth/requireRoot middleware', () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = 'test-secret-at-least-16-chars-long';
  });

  it('1. no cookie → 401 auth_required', async () => {
    const { req, res, next, getNextCalled } = mockReqRes();
    await requireRoot(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'auth_required', message: 'Connexion requise' });
    expect(getNextCalled()).toBe(false);
  });

  it('2. valid session but non-root → 403 root_required', async () => {
    const { cookie } = sign('viewer@example.test', 1);
    const { req, res, next, getNextCalled } = mockReqRes(cookie);
    await requireRoot(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'root_required', message: 'Accès admin requis' });
    expect(getNextCalled()).toBe(false);
    // accessScope doit avoir été résolu pour permettre le check
    expect(req.accessScope?.isRoot).toBe(false);
  });

  it('3. valid session + root → next() called, no status set', async () => {
    const { cookie } = sign('root@example.test', 1);
    const { req, res, next, getNextCalled } = mockReqRes(cookie);
    await requireRoot(req, res, next);
    expect(res.statusCode).toBe(0); // res.status() jamais appelé
    expect(res.body).toBeNull();
    expect(getNextCalled()).toBe(true);
    expect(req.accessScope?.isRoot).toBe(true);
    expect(req.session?.email).toBe('root@example.test');
  });

  it('4. tampered cookie → 401 (verify rejects, treated as no session)', async () => {
    const { cookie } = sign('root@example.test', 1);
    const tampered = cookie.slice(0, -1) + (cookie.slice(-1) === 'a' ? 'b' : 'a');
    const { req, res, next, getNextCalled } = mockReqRes(tampered);
    await requireRoot(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(getNextCalled()).toBe(false);
  });
});
