/**
 * Rate-limit middleware Express — Phase Alpha T1.3 (29/04/2026).
 *
 * Quotas distincts selon que la requête porte un token Sillon trusted
 * (`req.sillonToken` set par `identifySillonToken`) ou non.
 *
 * Comportement :
 *  - non-trusted : clé `rl:<prefix>:ip:<ip>` (X-Forwarded-For ou socket)
 *  - trusted     : clé `rl:<prefix>:t:<token>`
 *  - dépassement : 429 + Retry-After + JSON `{ error, limit, windowSec }`
 *  - erreur store: fail-open avec console.warn (ne bloque pas le service)
 *
 * Headers de réponse : X-RateLimit-Limit, X-RateLimit-Remaining.
 */

import type { Request, Response, NextFunction } from 'express';
import { autoStore, type RateLimitStore } from './rate-limit-stores';

export interface RateLimitOptions {
  /** Préfixe utilisé dans la clé Redis (ex: "cross-search"). */
  keyPrefix: string;
  /** Fenêtre en secondes (ex: 3600 = 1 h). */
  windowSec: number;
  /** Quota pour requêtes non-trusted (par IP). */
  defaultLimit: number;
  /** Quota pour requêtes trusted (par token). */
  trustedLimit: number;
  /** Store custom (tests). Par défaut : autoStore() lazy. */
  store?: RateLimitStore;
}

function clientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

export function createRateLimit(opts: RateLimitOptions) {
  const lazyStore: { current: RateLimitStore | null } = { current: opts.store || null };
  return async function rateLimit(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!lazyStore.current) lazyStore.current = autoStore();
    const store = lazyStore.current;

    const trusted = typeof req.sillonToken === 'string' && req.sillonToken.length > 0;
    const limit = trusted ? opts.trustedLimit : opts.defaultLimit;
    const id = trusted ? `t:${req.sillonToken}` : `ip:${clientIp(req)}`;
    const key = `rl:${opts.keyPrefix}:${id}`;

    let count: number;
    try {
      count = await store.hit(key, opts.windowSec);
    } catch (e: any) {
      console.warn('[rate-limit] store error, fail-open:', e?.message ?? e);
      return next();
    }

    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - count)));

    if (count > limit) {
      res.setHeader('Retry-After', String(opts.windowSec));
      res.status(429).json({
        error: 'rate_limit_exceeded',
        limit,
        windowSec: opts.windowSec,
      });
      return;
    }
    next();
  };
}
