/**
 * Sessions stateless — cookie signé HMAC-SHA256.
 *
 * Format du cookie `hub_session` :
 *   base64url(email) . expEpochSec . hex(hmac-sha256(email + '.' + exp, SESSION_SECRET))
 *
 * Pas de table sessions (garde le schéma à 2 tables auth comme spec). Logout =
 * effacer le cookie côté client (on renvoie Set-Cookie Max-Age=0).
 *
 * TTL 30 jours par défaut, override via SESSION_TTL_DAYS.
 */

import crypto from 'crypto';

const COOKIE_NAME = 'hub_session';
const DEFAULT_TTL_DAYS = 30;

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    // Fallback dev : clé dérivée de DATABASE_URL pour éviter le random-at-restart.
    // En prod, SESSION_SECRET DOIT être défini (>= 32 chars random).
    const fallback = process.env.DATABASE_URL || 'dev-fallback-secret-not-for-prod';
    return crypto.createHash('sha256').update(`session:${fallback}`).digest('hex');
  }
  return s;
}

function b64url(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf;
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64').toString('utf8');
}

function hmac(payload: string): string {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
}

export interface Session {
  email: string;
  expiresAt: number; // epoch seconds
}

export function sign(email: string, ttlDays?: number): { cookie: string; expiresAt: number } {
  const envDays = Number(process.env.SESSION_TTL_DAYS);
  const days = ttlDays ?? (Number.isFinite(envDays) && envDays > 0 ? envDays : DEFAULT_TTL_DAYS);
  const exp = Math.floor(Date.now() / 1000) + days * 86400;
  const emailEnc = b64url(email.toLowerCase().trim());
  const payload = `${emailEnc}.${exp}`;
  const sig = hmac(payload);
  return { cookie: `${payload}.${sig}`, expiresAt: exp };
}

export function verify(cookie: string | undefined | null): Session | null {
  if (!cookie) return null;
  const parts = cookie.split('.');
  if (parts.length !== 3) return null;
  const [emailEnc, expStr, sig] = parts;
  const payload = `${emailEnc}.${expStr}`;
  const expected = hmac(payload);
  if (!crypto.timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(expected, 'utf8'))) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
  try {
    return { email: b64urlDecode(emailEnc), expiresAt: exp };
  } catch {
    return null;
  }
}

export function cookieSetHeader(value: string, expiresAt: number): string {
  const maxAgeSec = Math.max(0, expiresAt - Math.floor(Date.now() / 1000));
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}

export function cookieClearHeader(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function readCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const pairs = cookieHeader.split(';').map((p) => p.trim());
  for (const p of pairs) {
    const eq = p.indexOf('=');
    if (eq < 0) continue;
    const name = p.substring(0, eq).trim();
    if (name === COOKIE_NAME) return p.substring(eq + 1);
  }
  return null;
}

export const AUTH_COOKIE_NAME = COOKIE_NAME;
