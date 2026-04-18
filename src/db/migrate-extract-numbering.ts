/**
 * Migration M4-fix : separer numerotation extracts vs full episodes.
 *
 * Contexte : le RSS GDIY contient, pour chaque epsiode, un full + 1-2 bonuses
 * qui partagent le meme <itunes:episode>. A l'ingestion, ON CONFLICT ecrase
 * les full par les bonus qui arrivent apres -> le vrai episode #535 de 3h a
 * ete remplace par son extrait [EXTRAIT].
 *
 * Fix :
 *   1. AJOUTE colonne episodes.parent_episode_number INT NULL
 *   2. AJOUTE unique (tenant_id, guid) — upsert alt key pour bonuses
 *   3. BACKFILL GDIY : bonus/trailer -> episode_number=NULL,
 *      parent_episode_number=<old episode_number>
 *
 * Idempotent : re-exec sans effet.
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL!);

async function columnExists(table: string, col: string) {
  const [r] = await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_name=${table} AND column_name=${col}
  ` as any[];
  return !!r;
}

async function constraintExists(name: string) {
  const [r] = await sql`SELECT 1 FROM pg_constraint WHERE conname=${name}` as any[];
  return !!r;
}

(async () => {
  console.log('[M4-FIX] migrate-extract-numbering…');

  // 1. parent_episode_number
  if (!(await columnExists('episodes', 'parent_episode_number'))) {
    await sql`ALTER TABLE episodes ADD COLUMN parent_episode_number INT NULL`;
    console.log('  [+] episodes.parent_episode_number');
  } else {
    console.log('  [=] parent_episode_number (exists)');
  }

  // 2. unique (tenant_id, guid) — permet upsert sur guid pour bonuses (episode_number NULL)
  if (!(await constraintExists('uq_episodes_tenant_guid'))) {
    // GUID peut etre NULL — unique autorise plusieurs NULLs en PG donc OK
    await sql`
      ALTER TABLE episodes
      ADD CONSTRAINT uq_episodes_tenant_guid UNIQUE (tenant_id, guid)
    `;
    console.log('  [+] UNIQUE (tenant_id, guid)');
  } else {
    console.log('  [=] uq_episodes_tenant_guid');
  }

  // 3. Backfill GDIY : bonus + trailer -> parent_episode_number + episode_number=NULL
  const [{ c: toMove }] = await sql`
    SELECT count(*)::int as c FROM episodes
    WHERE tenant_id='gdiy' AND episode_type IN ('bonus','trailer') AND episode_number IS NOT NULL
  ` as any[];
  console.log(`  [backfill] ${toMove} bonuses/trailers a namespacer`);

  if (toMove > 0) {
    const moved = await sql`
      UPDATE episodes
      SET parent_episode_number = episode_number,
          episode_number = NULL
      WHERE tenant_id='gdiy'
        AND episode_type IN ('bonus','trailer')
        AND episode_number IS NOT NULL
      RETURNING id
    ` as any[];
    console.log(`  [ok] ${moved.length} lignes migrees`);
  }

  // Verif finale
  const dist = await sql`
    SELECT
      episode_type,
      count(*)::int as c,
      count(*) FILTER (WHERE episode_number IS NOT NULL)::int as with_num,
      count(*) FILTER (WHERE parent_episode_number IS NOT NULL)::int as with_parent
    FROM episodes WHERE tenant_id='gdiy'
    GROUP BY episode_type ORDER BY c DESC
  ` as any[];
  console.log('\n[verif] GDIY apres migration :');
  for (const r of dist) {
    console.log(`  ${(r.episode_type||'<null>').padEnd(10)} : ${r.c} rows (episode_number=${r.with_num}, parent=${r.with_parent})`);
  }

  console.log('\n[M4-FIX] DONE');
})().catch((e) => { console.error(e); process.exit(1); });
