import { describe, it, expect, beforeAll } from 'vitest';
import { sign, verify, readCookie, cookieSetHeader, cookieClearHeader, AUTH_COOKIE_NAME } from '../auth/session';

describe('auth/session — signed cookie HMAC-SHA256', () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = 'test-secret-at-least-16-chars-long';
  });

  it('sign → verify roundtrip', () => {
    const { cookie, expiresAt } = sign('jeremy@example.com', 1);
    const sess = verify(cookie);
    expect(sess).not.toBeNull();
    expect(sess!.email).toBe('jeremy@example.com');
    expect(sess!.expiresAt).toBe(expiresAt);
  });

  it('verify rejects tampered signature', () => {
    const { cookie } = sign('jeremy@example.com', 1);
    const parts = cookie.split('.');
    // Flip one char in the HMAC segment.
    parts[2] = parts[2].slice(0, -1) + (parts[2].slice(-1) === 'a' ? 'b' : 'a');
    const tampered = parts.join('.');
    expect(verify(tampered)).toBeNull();
  });

  it('verify rejects tampered email', () => {
    const { cookie } = sign('jeremy@example.com', 1);
    const parts = cookie.split('.');
    // Replace the email segment while keeping signature.
    const { cookie: other } = sign('attacker@evil.com', 1);
    parts[0] = other.split('.')[0];
    expect(verify(parts.join('.'))).toBeNull();
  });

  it('verify rejects expired session', () => {
    // ttlDays = 0 → expiresAt = now → considéré expiré au check suivant.
    const past = Math.floor(Date.now() / 1000) - 10;
    // Forger manuellement un cookie expiré via sign avec TTL 0 puis attendre 2s serait lent.
    // À la place, on construit directement un cookie expiré et vérifie qu'il est rejeté.
    const emailB64 = Buffer.from('jeremy@example.com', 'utf8').toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    const payload = `${emailB64}.${past}`;
    // HMAC légitime mais exp < now → rejet attendu.
    const crypto = require('crypto');
    const sig = crypto.createHmac('sha256', process.env.SESSION_SECRET!).update(payload).digest('hex');
    expect(verify(`${payload}.${sig}`)).toBeNull();
  });

  it('verify rejects malformed cookie', () => {
    expect(verify(undefined)).toBeNull();
    expect(verify('')).toBeNull();
    expect(verify('foo.bar')).toBeNull();
    expect(verify('one.two.three.four')).toBeNull();
  });

  it('readCookie extracts hub_session from Cookie header', () => {
    expect(readCookie(undefined)).toBeNull();
    expect(readCookie(`${AUTH_COOKIE_NAME}=abc.def.ghi; other=xyz`)).toBe('abc.def.ghi');
    expect(readCookie(`other=xyz; ${AUTH_COOKIE_NAME}=v1`)).toBe('v1');
    expect(readCookie('other=xyz')).toBeNull();
  });

  it('cookieSetHeader / cookieClearHeader format', () => {
    const { cookie, expiresAt } = sign('a@b.c', 1);
    const set = cookieSetHeader(cookie, expiresAt);
    expect(set).toContain(`${AUTH_COOKIE_NAME}=${cookie}`);
    expect(set).toContain('HttpOnly');
    expect(set).toContain('SameSite=Lax');
    expect(set).toContain('Max-Age=');

    const clear = cookieClearHeader();
    expect(clear).toContain('Max-Age=0');
  });

  it('normalise email lowercase+trim at sign', () => {
    const { cookie } = sign('  JEREMY@Example.COM  ', 1);
    const sess = verify(cookie);
    expect(sess!.email).toBe('jeremy@example.com');
  });

  it('expiresAt is a finite number (no NaN leak) — regression guard', () => {
    delete process.env.SESSION_TTL_DAYS; // simulate default path
    const { cookie, expiresAt } = sign('a@b.c');
    expect(Number.isFinite(expiresAt)).toBe(true);
    expect(expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    // Cookie string must not contain "NaN" anywhere.
    expect(cookie).not.toContain('NaN');
  });

  it('respects SESSION_TTL_DAYS env var when set', () => {
    process.env.SESSION_TTL_DAYS = '7';
    const { expiresAt } = sign('a@b.c');
    const delta = expiresAt - Math.floor(Date.now() / 1000);
    // Within a minute of 7 days.
    expect(delta).toBeGreaterThan(7 * 86400 - 60);
    expect(delta).toBeLessThan(7 * 86400 + 60);
    delete process.env.SESSION_TTL_DAYS;
  });
});
