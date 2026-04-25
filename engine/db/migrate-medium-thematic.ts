import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

/**
 * Migration idempotente — Stratégie MEDIUM (3 chantiers).
 *
 * Crée 2 tables + étend `cross_podcast_guests` pour supporter :
 *   - MEDIUM-1 (carte cross-podcast) : pas de schema (lit cross_podcast_guests + episode_links existants)
 *   - MEDIUM-2 (use cases thématiques) : `claims` (scoped tenant) + `themes` (global)
 *   - MEDIUM-3 (kits invités briefs) : extension `cross_podcast_guests` (brief_md + métadata)
 *
 * Décisions architecturales (cf. docs/AGENTS.md) :
 *   - `claims` est SCOPED tenant (FK composites vers episodes + guests)
 *   - `themes` est GLOBAL (no tenant_id), aligné sur `cross_podcast_guests`
 *   - briefs = colonnes ajoutées à `cross_podcast_guests`, PAS de table dédiée
 *
 * Convention :
 *   - DDL idempotent (IF NOT EXISTS partout)
 *   - --dry par défaut (print SQL + counts existants), --write pour exécuter
 *   - Atomic via BEGIN/COMMIT en mode --write
 *
 * Usage :
 *   npx tsx engine/db/migrate-medium-thematic.ts          (dry = print SQL + checks)
 *   npx tsx engine/db/migrate-medium-thematic.ts --write  (exécute, BEGIN/COMMIT)
 */

const STATEMENTS: { label: string; sql: string }[] = [
  // ─── Section A : claims (SCOPED tenant) ─────────────────────────────────────
  // Une "claim" = position/affirmation extraite d'un épisode par un invité, taggée
  // par sujet (`subject`) pour permettre l'agrégation thématique cross-épisode.
  // Source : pipeline themeAnalysisAgent (MEDIUM-2). FK composites pour garantir
  // qu'un episode_id appartient bien au tenant_id (pas de fuite cross-tenant).
  {
    label: 'A.1 — table claims (scoped tenant)',
    sql: `
      CREATE TABLE IF NOT EXISTS claims (
        id           SERIAL PRIMARY KEY,
        tenant_id    TEXT NOT NULL,
        episode_id   INTEGER NOT NULL,
        guest_id     INTEGER,
        subject      TEXT NOT NULL,
        position     TEXT NOT NULL,
        evidence     TEXT,
        confidence   REAL DEFAULT 0.0,
        chapter_idx  INTEGER,
        timestamp_ms INTEGER,
        model        TEXT,
        created_at   TIMESTAMP DEFAULT now(),
        CONSTRAINT claims_episode_tenant_fkey
          FOREIGN KEY (episode_id, tenant_id)
          REFERENCES episodes(id, tenant_id)
          ON DELETE CASCADE,
        CONSTRAINT claims_guest_tenant_fkey
          FOREIGN KEY (guest_id, tenant_id)
          REFERENCES guests(id, tenant_id)
          ON DELETE SET NULL
      );
    `,
  },
  {
    label: 'A.2 — idx_claims_tenant_episode',
    sql: `CREATE INDEX IF NOT EXISTS idx_claims_tenant_episode ON claims (tenant_id, episode_id);`,
  },
  {
    label: 'A.3 — idx_claims_subject (partial, lowercase)',
    sql: `CREATE INDEX IF NOT EXISTS idx_claims_subject_lower ON claims (lower(subject)) WHERE subject IS NOT NULL;`,
  },
  {
    label: 'A.4 — idx_claims_tenant_guest',
    sql: `CREATE INDEX IF NOT EXISTS idx_claims_tenant_guest ON claims (tenant_id, guest_id) WHERE guest_id IS NOT NULL;`,
  },

  // ─── Section B : themes (GLOBAL, no tenant_id) ──────────────────────────────
  // Référentiel thématique global (univers MS). Chaque tenant peut "apparaître"
  // sur un thème via `tenant_appearances` JSONB. Pattern aligné sur
  // `cross_podcast_guests` (table cross-univers).
  // Slug stable, label affichable, description pédagogique.
  {
    label: 'B.1 — table themes (global)',
    sql: `
      CREATE TABLE IF NOT EXISTS themes (
        id                  SERIAL PRIMARY KEY,
        slug                TEXT NOT NULL UNIQUE,
        label               TEXT NOT NULL,
        description         TEXT,
        tenant_appearances  JSONB DEFAULT '[]'::jsonb,
        total_episodes      INTEGER DEFAULT 0,
        total_claims        INTEGER DEFAULT 0,
        is_active           BOOLEAN DEFAULT true,
        created_at          TIMESTAMP DEFAULT now(),
        updated_at          TIMESTAMP DEFAULT now()
      );
    `,
  },
  {
    label: 'B.2 — idx_themes_slug',
    sql: `CREATE INDEX IF NOT EXISTS idx_themes_slug ON themes (slug);`,
  },
  {
    label: 'B.3 — idx_themes_active',
    sql: `CREATE INDEX IF NOT EXISTS idx_themes_active ON themes (is_active) WHERE is_active = true;`,
  },

  // ─── Section C : extension cross_podcast_guests (briefs MEDIUM-3) ──────────
  // Le brief invité est une fiche markdown générée à partir de tous les épisodes
  // où l'invité apparaît (cross-tenant). On l'attache directement sur
  // `cross_podcast_guests` (1 row = 1 invité unifié) plutôt que de créer une
  // table dédiée. Permet aussi le cache via `brief_generated_at`.
  {
    label: 'C.1 — cross_podcast_guests.brief_md',
    sql: `ALTER TABLE cross_podcast_guests ADD COLUMN IF NOT EXISTS brief_md TEXT;`,
  },
  {
    label: 'C.2 — cross_podcast_guests.key_positions',
    sql: `ALTER TABLE cross_podcast_guests ADD COLUMN IF NOT EXISTS key_positions JSONB DEFAULT '[]'::jsonb;`,
  },
  {
    label: 'C.3 — cross_podcast_guests.quotes',
    sql: `ALTER TABLE cross_podcast_guests ADD COLUMN IF NOT EXISTS quotes JSONB DEFAULT '[]'::jsonb;`,
  },
  {
    label: 'C.4 — cross_podcast_guests.original_questions',
    sql: `ALTER TABLE cross_podcast_guests ADD COLUMN IF NOT EXISTS original_questions JSONB DEFAULT '[]'::jsonb;`,
  },
  {
    label: 'C.5 — cross_podcast_guests.brief_generated_at',
    sql: `ALTER TABLE cross_podcast_guests ADD COLUMN IF NOT EXISTS brief_generated_at TIMESTAMP;`,
  },
  {
    label: 'C.6 — cross_podcast_guests.brief_model',
    sql: `ALTER TABLE cross_podcast_guests ADD COLUMN IF NOT EXISTS brief_model TEXT;`,
  },
];

async function checkExistingState(sql: any) {
  // État avant migration : volumes des objets impactés
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('claims', 'themes', 'cross_podcast_guests', 'episodes', 'guests')
    ORDER BY table_name
  ` as any[];

  console.log('[migrate-medium] tables existantes :');
  for (const t of tables) {
    console.log(`  - ${t.table_name}`);
  }

  // cross_podcast_guests : colonnes existantes (pour vérifier les ALTER)
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cross_podcast_guests'
    ORDER BY ordinal_position
  ` as any[];
  const colSet = new Set(cols.map((c: any) => c.column_name));
  const briefCols = ['brief_md', 'key_positions', 'quotes', 'original_questions', 'brief_generated_at', 'brief_model'];
  console.log('[migrate-medium] cross_podcast_guests — colonnes brief :');
  for (const c of briefCols) {
    console.log(`  - ${c.padEnd(22)} ${colSet.has(c) ? '✓ déjà présente' : '✗ à ajouter'}`);
  }

  // Counts si tables déjà créées (cas re-run)
  if (tables.find((t: any) => t.table_name === 'claims')) {
    const [{ c }] = await sql`SELECT count(*)::int AS c FROM claims` as any[];
    console.log(`[migrate-medium] claims.rows = ${c}`);
  }
  if (tables.find((t: any) => t.table_name === 'themes')) {
    const [{ c }] = await sql`SELECT count(*)::int AS c FROM themes` as any[];
    console.log(`[migrate-medium] themes.rows = ${c}`);
  }
  const [{ c: cpgCount }] = await sql`SELECT count(*)::int AS c FROM cross_podcast_guests` as any[];
  console.log(`[migrate-medium] cross_podcast_guests.rows = ${cpgCount}`);
}

async function main() {
  const write = process.argv.includes('--write');
  if (!process.env.DATABASE_URL) {
    console.error('[migrate-medium] DATABASE_URL required');
    process.exit(1);
  }
  const sql = neon(process.env.DATABASE_URL);

  console.log(`[migrate-medium] mode=${write ? 'WRITE' : 'DRY'}`);
  console.log(`[migrate-medium] ${STATEMENTS.length} statements à exécuter`);
  console.log('');

  await checkExistingState(sql);
  console.log('');

  if (!write) {
    // Dry-run : affiche le SQL exact qui serait exécuté
    for (const s of STATEMENTS) {
      console.log(`[migrate-medium] → ${s.label}`);
      console.log(s.sql.trim());
      console.log('');
    }
    console.log('[migrate-medium] DRY-RUN OK. Re-run with --write to apply.');
    return;
  }

  // Mode write : atomic transaction
  console.log('[migrate-medium] BEGIN transaction…');
  await sql.query('BEGIN');
  try {
    for (const s of STATEMENTS) {
      console.log(`[migrate-medium] → ${s.label}`);
      await sql.query(s.sql);
    }
    await sql.query('COMMIT');
    console.log('[migrate-medium] COMMIT OK.');
  } catch (e) {
    await sql.query('ROLLBACK');
    console.error('[migrate-medium] ROLLBACK — error:', e);
    throw e;
  }

  // Post-write verification
  console.log('');
  console.log('[migrate-medium] post-write verification :');
  await checkExistingState(sql);
  console.log('[migrate-medium] done.');
}

main().catch((e) => { console.error('[migrate-medium] FATAL', e); process.exit(1); });
