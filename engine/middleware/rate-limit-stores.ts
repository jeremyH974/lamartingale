/**
 * Rate-limit store abstraction — Phase Alpha T1.3 (29/04/2026).
 *
 * Chaque store implémente `hit(key, windowSec)` qui :
 *  - incrémente le compteur stocké à `key`
 *  - applique TTL = windowSec à la première occurrence
 *  - retourne le nouveau compteur
 *
 * Stores disponibles :
 *  - UpstashStore  → Upstash Redis REST (UPSTASH_REDIS_REST_URL + TOKEN)
 *  - VercelKVStore → Vercel KV (KV_REST_API_URL ou KV_URL)
 *  - MemoryStore   → tests uniquement (in-memory, perdu cold-start)
 *  - NoopStore     → fallback log-warn quand aucun provider configuré
 *
 * `autoStore()` fait l'auto-détection prod selon les env vars.
 */

export interface RateLimitStore {
  /** Incrémente le compteur lié à `key` et renvoie sa nouvelle valeur. */
  hit(key: string, windowSec: number): Promise<number>;
}

export class MemoryStore implements RateLimitStore {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  async hit(key: string, windowSec: number): Promise<number> {
    const now = Date.now();
    const cur = this.buckets.get(key);
    if (!cur || cur.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowSec * 1000 });
      return 1;
    }
    cur.count += 1;
    return cur.count;
  }

  /** Test helper. */
  reset(): void { this.buckets.clear(); }
}

export class UpstashStore implements RateLimitStore {
  constructor(private url: string, private token: string) {}

  async hit(key: string, windowSec: number): Promise<number> {
    const n = await this.cmd(['INCR', key]);
    if (n === 1) await this.cmd(['EXPIRE', key, String(windowSec)]);
    return Number(n);
  }

  private async cmd(parts: string[]): Promise<number | string> {
    const path = parts.map(encodeURIComponent).join('/');
    const res = await fetch(`${this.url}/${path}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) throw new Error(`Upstash ${res.status}`);
    const json: any = await res.json();
    return json.result;
  }
}

export class VercelKVStore implements RateLimitStore {
  async hit(key: string, windowSec: number): Promise<number> {
    const mod = await import('@vercel/kv');
    const n = await mod.kv.incr(key);
    if (n === 1) await mod.kv.expire(key, windowSec);
    return Number(n);
  }
}

export class NoopStore implements RateLimitStore {
  async hit(): Promise<number> { return 0; }
}

export function autoStore(): RateLimitStore {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return new UpstashStore(
      process.env.UPSTASH_REDIS_REST_URL,
      process.env.UPSTASH_REDIS_REST_TOKEN,
    );
  }
  if (process.env.KV_REST_API_URL || process.env.KV_URL) {
    return new VercelKVStore();
  }
  console.warn('[rate-limit] No store configured (UPSTASH_REDIS_REST_URL ou KV_REST_API_URL absents). Requêtes non rate-limitées.');
  return new NoopStore();
}
