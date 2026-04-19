import { getConfig } from './config';

// ============================================================================
// Cache layer — Vercel KV en prod, in-memory LRU en local/fallback
// ============================================================================
// Usage : const data = await getCached('key', 60, async () => fetchData());
// Namespaced par tenant automatiquement pour éviter les collisions multi-podcast.
// ============================================================================

interface Entry { value: any; expiresAt: number }

const MEM = new Map<string, Entry>();
const MEM_MAX = 500;

let kvClient: any = null;
let kvResolved = false;

async function resolveKV() {
  if (kvResolved) return kvClient;
  kvResolved = true;
  const hasKV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  if (!hasKV) return null;
  try {
    const mod = await import('@vercel/kv');
    kvClient = mod.kv;
    return kvClient;
  } catch {
    return null;
  }
}

function tenantKey(key: string): string {
  const tenant = getConfig().database.tenantId;
  return `cache:${tenant}:${key}`;
}

export async function getCached<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> {
  const fullKey = tenantKey(key);
  const now = Date.now();

  // 1. Memory cache (fastest)
  const memHit = MEM.get(fullKey);
  if (memHit && memHit.expiresAt > now) {
    return memHit.value as T;
  }

  // 2. KV (prod)
  const kv = await resolveKV();
  if (kv) {
    try {
      const kvHit = await kv.get(fullKey);
      if (kvHit !== null && kvHit !== undefined) {
        setMem(fullKey, kvHit, ttlSec);
        return kvHit as T;
      }
    } catch { /* fallthrough */ }
  }

  // 3. Miss — compute + store
  const value = await fn();
  setMem(fullKey, value, ttlSec);
  if (kv) {
    try { await kv.set(fullKey, value, { ex: ttlSec }); } catch { /* ignore */ }
  }
  return value;
}

function setMem(key: string, value: any, ttlSec: number) {
  if (MEM.size >= MEM_MAX) {
    const firstKey = MEM.keys().next().value;
    if (firstKey) MEM.delete(firstKey);
  }
  MEM.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
}

export async function clearCache(prefix?: string): Promise<number> {
  const tenantPrefix = tenantKey(prefix || '');
  let cleared = 0;

  for (const k of [...MEM.keys()]) {
    if (k.startsWith(tenantPrefix)) { MEM.delete(k); cleared++; }
  }

  const kv = await resolveKV();
  if (kv) {
    try {
      const keys: string[] = await kv.keys(`${tenantPrefix}*`);
      if (keys.length) {
        await kv.del(...keys);
        cleared += keys.length;
      }
    } catch { /* ignore */ }
  }
  return cleared;
}

export function cacheStats() {
  return {
    memory_entries: MEM.size,
    memory_max: MEM_MAX,
    kv_enabled: !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN),
  };
}
