import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response } from 'express';
import { createRateLimit } from '../middleware/rate-limit';
import { MemoryStore } from '../middleware/rate-limit-stores';

function mkReq(opts: { ip?: string; xff?: string; token?: string } = {}): Request {
  const headers: Record<string, string> = {};
  if (opts.xff) headers['x-forwarded-for'] = opts.xff;
  return {
    headers,
    socket: { remoteAddress: opts.ip || '127.0.0.1' },
    sillonToken: opts.token,
  } as unknown as Request;
}

function mkRes() {
  const headers: Record<string, string> = {};
  const res: any = {
    headers,
    statusCode: 200,
    setHeader: vi.fn((k: string, v: string) => { headers[k] = v; }),
    status: vi.fn((c: number) => { res.statusCode = c; return res; }),
    json: vi.fn(() => res),
  };
  return res as Response & { headers: Record<string, string>; statusCode: number };
}

describe('createRateLimit middleware', () => {
  let store: MemoryStore;
  beforeEach(() => { store = new MemoryStore(); });

  it('allows up to defaultLimit then 429s for non-trusted IP', async () => {
    const mw = createRateLimit({
      keyPrefix: 'cs',
      windowSec: 60,
      defaultLimit: 3,
      trustedLimit: 10,
      store,
    });
    const next = vi.fn();
    for (let i = 0; i < 3; i++) {
      const res = mkRes();
      await mw(mkReq({ ip: '1.2.3.4' }), res, next);
      expect(res.statusCode).toBe(200);
    }
    expect(next).toHaveBeenCalledTimes(3);

    const res4 = mkRes();
    await mw(mkReq({ ip: '1.2.3.4' }), res4, next);
    expect(res4.statusCode).toBe(429);
    expect(res4.headers['Retry-After']).toBe('60');
    expect(next).toHaveBeenCalledTimes(3);
  });

  it('uses higher trusted limit when sillonToken present', async () => {
    const mw = createRateLimit({
      keyPrefix: 'cs',
      windowSec: 60,
      defaultLimit: 2,
      trustedLimit: 5,
      store,
    });
    const next = vi.fn();
    for (let i = 0; i < 5; i++) {
      const res = mkRes();
      await mw(mkReq({ token: 'alpha' }), res, next);
      expect(res.statusCode).toBe(200);
    }
    expect(next).toHaveBeenCalledTimes(5);

    const res6 = mkRes();
    await mw(mkReq({ token: 'alpha' }), res6, next);
    expect(res6.statusCode).toBe(429);
  });

  it('isolates buckets per IP', async () => {
    const mw = createRateLimit({
      keyPrefix: 'cs', windowSec: 60, defaultLimit: 1, trustedLimit: 10, store,
    });
    const next = vi.fn();
    const r1 = mkRes(), r2 = mkRes();
    await mw(mkReq({ ip: '1.1.1.1' }), r1, next);
    await mw(mkReq({ ip: '2.2.2.2' }), r2, next);
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('isolates buckets per trusted token', async () => {
    const mw = createRateLimit({
      keyPrefix: 'cs', windowSec: 60, defaultLimit: 1, trustedLimit: 1, store,
    });
    const next = vi.fn();
    const ra = mkRes(), rb = mkRes();
    await mw(mkReq({ token: 'alpha' }), ra, next);
    await mw(mkReq({ token: 'beta' }), rb, next);
    expect(ra.statusCode).toBe(200);
    expect(rb.statusCode).toBe(200);
  });

  it('reads x-forwarded-for first hop when present', async () => {
    const mw = createRateLimit({
      keyPrefix: 'cs', windowSec: 60, defaultLimit: 1, trustedLimit: 10, store,
    });
    const next = vi.fn();
    const r1 = mkRes(), r2 = mkRes();
    await mw(mkReq({ xff: '9.9.9.9, 8.8.8.8' }), r1, next);
    await mw(mkReq({ xff: '9.9.9.9, 7.7.7.7' }), r2, next);
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(429);
  });

  it('sets X-RateLimit-Limit and X-RateLimit-Remaining', async () => {
    const mw = createRateLimit({
      keyPrefix: 'cs', windowSec: 60, defaultLimit: 5, trustedLimit: 10, store,
    });
    const res = mkRes();
    await mw(mkReq({ ip: '1.2.3.4' }), res, vi.fn());
    expect(res.headers['X-RateLimit-Limit']).toBe('5');
    expect(res.headers['X-RateLimit-Remaining']).toBe('4');
  });

  it('fail-open when store throws', async () => {
    const errStore = {
      hit: vi.fn(async () => { throw new Error('boom'); }),
    };
    const mw = createRateLimit({
      keyPrefix: 'cs', windowSec: 60, defaultLimit: 1, trustedLimit: 10, store: errStore,
    });
    const next = vi.fn();
    const res = mkRes();
    await mw(mkReq({ ip: '1.2.3.4' }), res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });

  it('429 carries JSON body with limit + windowSec', async () => {
    const mw = createRateLimit({
      keyPrefix: 'cs', windowSec: 3600, defaultLimit: 1, trustedLimit: 10, store,
    });
    const next = vi.fn();
    await mw(mkReq({ ip: '1.2.3.4' }), mkRes(), next);
    const res2 = mkRes();
    await mw(mkReq({ ip: '1.2.3.4' }), res2, next);
    expect(res2.statusCode).toBe(429);
    expect((res2.json as any).mock.calls[0][0]).toEqual({
      error: 'rate_limit_exceeded',
      limit: 1,
      windowSec: 3600,
    });
  });
});
