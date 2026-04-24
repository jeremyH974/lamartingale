/**
 * Podcast access queries — résout les tenants autorisés pour un email.
 *
 * Convention root : 1 ligne podcast_access avec tenant_id='*' et role='root'
 * → bypass du filtre (accès à tous les tenants).
 */

import { neon } from '@neondatabase/serverless';

export interface AccessScope {
  email: string;
  isRoot: boolean;
  tenantIds: string[]; // liste explicite, ou [] si root (caller doit bypass filtre)
}

export async function getAccessScope(email: string): Promise<AccessScope> {
  if (!process.env.DATABASE_URL) {
    throw new Error('[auth.access] DATABASE_URL required');
  }
  const sql = neon(process.env.DATABASE_URL);
  const normalizedEmail = email.toLowerCase().trim();

  const rows = (await sql`
    SELECT tenant_id, role FROM podcast_access WHERE email = ${normalizedEmail}
  `) as any[];

  const isRoot = rows.some((r) => r.role === 'root' || r.tenant_id === '*');
  const tenantIds = rows
    .filter((r) => r.tenant_id !== '*')
    .map((r) => String(r.tenant_id));

  return { email: normalizedEmail, isRoot, tenantIds };
}

/**
 * Insère un droit (email × tenant_id). Idempotent via UNIQUE.
 * Pour seed scripts + admin UI future.
 */
export async function grantAccess(
  email: string,
  tenantId: string,
  role: 'viewer' | 'root' = 'viewer',
): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
  const sql = neon(process.env.DATABASE_URL);
  await sql`
    INSERT INTO podcast_access (email, tenant_id, role)
    VALUES (${email.toLowerCase().trim()}, ${tenantId}, ${role})
    ON CONFLICT (email, tenant_id) DO UPDATE SET role = EXCLUDED.role
  `;
}

export async function revokeAccess(email: string, tenantId: string): Promise<number> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
  const sql = neon(process.env.DATABASE_URL);
  const r = (await sql`
    DELETE FROM podcast_access WHERE email = ${email.toLowerCase().trim()} AND tenant_id = ${tenantId}
  `) as any;
  return r?.rowCount || r?.length || 0;
}

export async function listAccess(): Promise<Array<{ email: string; tenantId: string; role: string }>> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
  const sql = neon(process.env.DATABASE_URL);
  const rows = (await sql`
    SELECT email, tenant_id, role FROM podcast_access ORDER BY email, tenant_id
  `) as any[];
  return rows.map((r) => ({ email: r.email, tenantId: r.tenant_id, role: r.role }));
}
