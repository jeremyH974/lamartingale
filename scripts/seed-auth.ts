/**
 * Seed podcast_access — Phase E.
 *
 * Usage (obligatoire --write pour muter) :
 *   npx tsx scripts/seed-auth.ts                        # dry : liste les inserts prévus
 *   npx tsx scripts/seed-auth.ts --write                # applique les inserts
 *   npx tsx scripts/seed-auth.ts --list                 # affiche la table actuelle
 *
 * Convention root : tenant_id='*' + role='root' → accès à tous les tenants.
 *
 * Note Phase 4a : seed uniquement l'admin root (jeremyhenry974@gmail.com).
 * Les accès Orso/Matthieu seront ajoutés en Phase 4a step "seed initial" après
 * validation humaine de la liste (email × scope) via prompt Claude.
 */

import 'dotenv/config';
import { grantAccess, listAccess } from '../engine/auth/access';

interface SeedEntry {
  email: string;
  tenantId: string; // '*' pour root
  role: 'viewer' | 'root';
}

const SEED: SeedEntry[] = [
  { email: 'jeremyhenry974@gmail.com', tenantId: '*', role: 'root' },
];

async function main() {
  const args = process.argv.slice(2);
  const isWrite = args.includes('--write');
  const isList = args.includes('--list');

  if (isList) {
    const rows = await listAccess();
    console.log(`[seed-auth] ${rows.length} row(s) in podcast_access :`);
    for (const r of rows) console.log(`  ${r.email.padEnd(40)} ${r.tenantId.padEnd(22)} ${r.role}`);
    return;
  }

  console.log(`[seed-auth] mode=${isWrite ? 'WRITE' : 'DRY'}`);
  console.log(`[seed-auth] ${SEED.length} entry(ies) to upsert :`);
  for (const e of SEED) console.log(`  ${e.email.padEnd(40)} ${e.tenantId.padEnd(22)} ${e.role}`);

  if (!isWrite) {
    console.log('[seed-auth] DRY — pass --write to apply. (--list to inspect current state)');
    return;
  }

  for (const e of SEED) {
    await grantAccess(e.email, e.tenantId, e.role);
    console.log(`[seed-auth] ✓ granted ${e.email} → ${e.tenantId} (${e.role})`);
  }

  const after = await listAccess();
  console.log(`[seed-auth] post-seed: ${after.length} row(s) total`);
}

main().catch((e) => { console.error(e); process.exit(1); });
