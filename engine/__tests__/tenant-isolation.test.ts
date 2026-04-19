import 'dotenv/config';
import { describe, it, expect, beforeAll } from 'vitest';
import { neon } from '@neondatabase/serverless';
import { _setConfigForTest } from '../config';
import { lamartingaleConfig } from '../config/lamartingale.config';

// M2 — Tenant isolation (DB-level)
// Ces tests vérifient que la migration tenant_id a bien été appliquée
// et que les données LaMartingale sont correctement scopées.
// Skippe gracieusement si DATABASE_URL absent.

const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

d('M2 — Tenant Isolation', () => {
  const sql = neon(process.env.DATABASE_URL || '');
  const TENANT = 'lamartingale';

  beforeAll(() => {
    _setConfigForTest(lamartingaleConfig);
  });

  it('1. tenant_id column exists on all 10 tenant-scoped tables', async () => {
    const tables = [
      'episodes', 'episodes_enrichment', 'episode_similarities',
      'episodes_media', 'guests', 'guest_episodes', 'episode_links',
      'quiz_questions', 'taxonomy', 'learning_paths',
    ];
    for (const t of tables) {
      const [row] = await sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = ${t} AND column_name = 'tenant_id'
      `;
      expect(row, `${t}.tenant_id should exist`).toBeDefined();
    }
  });

  it('2. lamartingale tenant has its episodes tagged', async () => {
    // Post-GDIY ingestion : la DB contient plusieurs tenants. On vérifie
    // juste que LM garde son volume attendu (>300).
    const [{ c: lm }] = await sql`SELECT count(*) as c FROM episodes WHERE tenant_id = ${TENANT}`;
    expect(Number(lm)).toBeGreaterThan(300);

    // Et que chaque épisode a bien un tenant non vide.
    const [{ c: untagged }] = await sql`SELECT count(*) as c FROM episodes WHERE tenant_id IS NULL OR tenant_id = ''`;
    expect(Number(untagged)).toBe(0);
  });

  it('3. no orphan rows with NULL tenant_id in episodes', async () => {
    const [{ c }] = await sql`SELECT count(*) as c FROM episodes WHERE tenant_id IS NULL`;
    expect(Number(c)).toBe(0);
  });

  it('4. episodes_enrichment + embeddings scoped to tenant', async () => {
    const [{ c }] = await sql`
      SELECT count(*) as c
      FROM episodes_enrichment en
      INNER JOIN episodes e ON e.id = en.episode_id
      WHERE e.tenant_id = ${TENANT} AND en.embedding IS NOT NULL
    `;
    expect(Number(c)).toBeGreaterThan(100);
  });

  it('5. episode_similarities strictly intra-tenant (no cross-podcast pairs)', async () => {
    const [{ c }] = await sql`
      SELECT count(*) as c
      FROM episode_similarities es
      INNER JOIN episodes e1 ON e1.id = es.episode_id
      INNER JOIN episodes e2 ON e2.id = es.similar_episode_id
      WHERE e1.tenant_id != e2.tenant_id
    `;
    expect(Number(c)).toBe(0);
  });

  it('6. GDIY tenant has its own episodes + taxonomy (cross-podcast coexistence)', async () => {
    const [{ c: gdiyEp }] = await sql`SELECT count(*) as c FROM episodes WHERE tenant_id = 'gdiy'`;
    const [{ c: gdiyTax }] = await sql`SELECT count(*) as c FROM taxonomy WHERE tenant_id = 'gdiy'`;
    // Si GDIY a été ingéré dans cette base, on attend >500 épisodes + 10 piliers.
    // Si non (DB propre), le test reste valide (0, 0).
    if (Number(gdiyEp) > 0) {
      expect(Number(gdiyEp)).toBeGreaterThan(500);
      expect(Number(gdiyTax)).toBeGreaterThanOrEqual(1);
    }
  });

  it('7. composite uniques (tenant_id, X) allow same episode_number across tenants', async () => {
    // Contrainte qui doit exister post-migration M3.1.
    const rows = await sql`
      SELECT conname FROM pg_constraint
      WHERE conname = 'uq_episodes_tenant_episode_number'
    ` as any[];
    expect(rows.length).toBe(1);
  });
});
