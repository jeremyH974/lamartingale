/**
 * Integration tests auth — hit la vraie DB Neon via DATABASE_URL.
 *
 * Skipped automatiquement si DATABASE_URL absent (CI headless).
 * Ne teste PAS l'envoi d'email (RESEND_API_KEY optionnel, mode noop).
 *
 * Couverture :
 *   - magic-link create → consume (happy path)
 *   - consume refuse token expiré
 *   - consume refuse token déjà consommé (one-shot)
 *   - consume refuse token inconnu
 *   - access scope : 0 accès / 1 accès / N accès / root
 */

import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { neon } from '@neondatabase/serverless';
import { createMagicLink, consumeMagicLink, getMagicLink } from '../auth/magic-link';
import { getAccessScope, grantAccess, revokeAccess } from '../auth/access';

// Re-check env after dotenv loads.
const HAS_DB = !!process.env.DATABASE_URL;
if (!HAS_DB) console.log('[auth-integration] DATABASE_URL absent — tests skipped');
const describeDb = HAS_DB ? describe : describe.skip;

// Emails de test dédiés — cleanup en afterAll pour rester idempotent.
const TEST_EMAILS = [
  'test-auth-zero@example.test',
  'test-auth-one@example.test',
  'test-auth-multi@example.test',
  'test-auth-root@example.test',
];

async function cleanup() {
  if (!HAS_DB) return;
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM magic_link WHERE email = ANY(${TEST_EMAILS})`;
  await sql`DELETE FROM podcast_access WHERE email = ANY(${TEST_EMAILS})`;
}

describeDb('auth/magic-link — lifecycle one-shot', () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it('create → consume returns email, marks consumed', async () => {
    const { token } = await createMagicLink('test-auth-zero@example.test');
    const before = await getMagicLink(token);
    expect(before?.consumed).toBe(false);

    const result = await consumeMagicLink(token);
    expect(result?.email).toBe('test-auth-zero@example.test');

    const after = await getMagicLink(token);
    expect(after?.consumed).toBe(true);
  });

  it('consume refuses already-consumed token (one-shot)', async () => {
    const { token } = await createMagicLink('test-auth-zero@example.test');
    await consumeMagicLink(token); // first use
    const second = await consumeMagicLink(token);
    expect(second).toBeNull();
  });

  it('consume refuses unknown token', async () => {
    const result = await consumeMagicLink('0'.repeat(64));
    expect(result).toBeNull();
  });

  it('consume refuses expired token', async () => {
    const sql = neon(process.env.DATABASE_URL!);
    const { token } = await createMagicLink('test-auth-zero@example.test');
    // Force expiration à now() - 1min
    await sql`UPDATE magic_link SET expires_at = now() - interval '1 minute' WHERE token = ${token}`;
    const result = await consumeMagicLink(token);
    expect(result).toBeNull();
  });

  it('consume refuses malformed token', async () => {
    expect(await consumeMagicLink('')).toBeNull();
    expect(await consumeMagicLink('short')).toBeNull();
    expect(await consumeMagicLink(null as any)).toBeNull();
  });

  it('email is lowercased+trimmed at creation', async () => {
    const { token } = await createMagicLink('  TEST-AUTH-ZERO@Example.TEST  ');
    const rec = await getMagicLink(token);
    expect(rec?.email).toBe('test-auth-zero@example.test');
  });
});

describeDb('auth/access — scope resolution', () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it('returns empty tenantIds for unknown email', async () => {
    const scope = await getAccessScope('test-auth-zero@example.test');
    expect(scope.isRoot).toBe(false);
    expect(scope.tenantIds).toEqual([]);
  });

  it('returns 1 tenant for email with 1 grant', async () => {
    await grantAccess('test-auth-one@example.test', 'lamartingale', 'viewer');
    const scope = await getAccessScope('test-auth-one@example.test');
    expect(scope.isRoot).toBe(false);
    expect(scope.tenantIds).toEqual(['lamartingale']);
  });

  it('returns N tenants for email with N grants', async () => {
    await grantAccess('test-auth-multi@example.test', 'lamartingale', 'viewer');
    await grantAccess('test-auth-multi@example.test', 'gdiy', 'viewer');
    await grantAccess('test-auth-multi@example.test', 'lepanier', 'viewer');
    const scope = await getAccessScope('test-auth-multi@example.test');
    expect(scope.isRoot).toBe(false);
    expect(scope.tenantIds.sort()).toEqual(['gdiy', 'lamartingale', 'lepanier']);
  });

  it('detects root via tenant_id=* + role=root', async () => {
    await grantAccess('test-auth-root@example.test', '*', 'root');
    const scope = await getAccessScope('test-auth-root@example.test');
    expect(scope.isRoot).toBe(true);
  });

  it('grantAccess is idempotent (UPSERT on conflict)', async () => {
    await grantAccess('test-auth-one@example.test', 'lamartingale', 'viewer');
    await grantAccess('test-auth-one@example.test', 'lamartingale', 'viewer');
    const scope = await getAccessScope('test-auth-one@example.test');
    expect(scope.tenantIds.filter((t) => t === 'lamartingale').length).toBe(1);
  });

  it('revokeAccess removes the row', async () => {
    await grantAccess('test-auth-one@example.test', 'lamartingale', 'viewer');
    await revokeAccess('test-auth-one@example.test', 'lamartingale');
    const scope = await getAccessScope('test-auth-one@example.test');
    expect(scope.tenantIds).not.toContain('lamartingale');
  });

  it('email lowercased+trimmed at grant + lookup', async () => {
    await grantAccess('  TEST-AUTH-ONE@Example.TEST  ', 'gdiy', 'viewer');
    const scope = await getAccessScope('test-auth-one@example.test');
    expect(scope.tenantIds).toContain('gdiy');
  });
});
