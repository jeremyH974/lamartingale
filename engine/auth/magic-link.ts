/**
 * Magic-link DB layer — création + consommation one-shot.
 */

import crypto from 'crypto';
import { neon } from '@neondatabase/serverless';

const MAGIC_LINK_TTL_MIN = 15;

export interface MagicLinkRecord {
  token: string;
  email: string;
  expiresAt: Date;
  consumed: boolean;
}

function sql() {
  if (!process.env.DATABASE_URL) throw new Error('[auth.magic-link] DATABASE_URL required');
  return neon(process.env.DATABASE_URL);
}

export async function createMagicLink(email: string): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString('hex');
  const normalizedEmail = email.toLowerCase().trim();
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MIN * 60_000);
  await sql()`
    INSERT INTO magic_link (token, email, expires_at, consumed)
    VALUES (${token}, ${normalizedEmail}, ${expiresAt}, false)
  `;
  return { token, expiresAt };
}

/**
 * Consomme un token (one-shot). Retourne l'email associé si valide, null sinon.
 * Conditions de validité :
 *   - token existe
 *   - expires_at > now()
 *   - consumed = false (pas encore utilisé)
 *
 * Le token est marqué consumed=true dans la même transaction.
 */
export async function consumeMagicLink(token: string): Promise<{ email: string } | null> {
  if (!token || typeof token !== 'string' || token.length !== 64) return null;

  // Atomic : UPDATE ... WHERE ... RETURNING évite la race entre SELECT et UPDATE.
  const rows = (await sql()`
    UPDATE magic_link
    SET consumed = true
    WHERE token = ${token}
      AND consumed = false
      AND expires_at > now()
    RETURNING email
  `) as any[];

  if (!rows.length) return null;
  return { email: String(rows[0].email) };
}

/**
 * Diagnostic helper (tests + admin).
 */
export async function getMagicLink(token: string): Promise<MagicLinkRecord | null> {
  const rows = (await sql()`
    SELECT token, email, expires_at, consumed FROM magic_link WHERE token = ${token}
  `) as any[];
  if (!rows.length) return null;
  const r = rows[0];
  return {
    token: r.token,
    email: r.email,
    expiresAt: new Date(r.expires_at),
    consumed: !!r.consumed,
  };
}

/**
 * Cleanup périodique des tokens expirés/consommés (> 24h).
 * À appeler depuis un cron ou post-deploy hook.
 */
export async function pruneMagicLinks(): Promise<number> {
  const rows = (await sql()`
    DELETE FROM magic_link
    WHERE (consumed = true OR expires_at < now())
      AND created_at < now() - interval '24 hours'
    RETURNING token
  `) as any[];
  return rows.length;
}
