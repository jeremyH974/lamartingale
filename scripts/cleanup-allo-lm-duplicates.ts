/**
 * Phase B7 (2026-04-28) — cleanup doublon Allo La Martingale.
 *
 * Contexte : avant Phase A.5.2, le flux Allo LM était ingéré via
 * `lamartingale.config.ts` secondary feed → les ~58 episodes Allo LM
 * étaient stockés en DB sous tenant_id='lamartingale'. Phase A.5.2 a créé
 * un tenant séparé `allolamartingale` et A.5.5a l'a ingéré séparément →
 * mêmes ~58 rows existent maintenant DEUX FOIS (tenant lamartingale +
 * tenant allolamartingale).
 *
 * Stratégie de matching :
 *   1. tenant=allolamartingale est la source canonique (créée Phase A.5.2)
 *   2. Les rows lamartingale qui ont le même `guid` qu'un row allolamartingale
 *      sont les doublons à supprimer.
 *   3. Fallback si guid manquant : matching par audio_url ou (title + date).
 *
 * Modes :
 *   --dry  (default) : log la liste à supprimer, ZERO write.
 *   --write          : DELETE FROM episodes WHERE id IN (<liste>).
 *
 * Backup JSON pre-DELETE : .audit-hub/cleanup-allo-lm-B7.json.
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import * as fs from 'fs';

const sql = neon(process.env.DATABASE_URL!);
const args = new Set(process.argv.slice(2));
const WRITE = args.has('--write');

(async () => {
  console.log(`━━━ B7 cleanup Allo LM doublon ${WRITE ? '(--write)' : '(--dry)'} ━━━\n`);

  // 1. Counts avant
  const counts = (await sql`
    SELECT tenant_id, COUNT(*)::int AS n FROM episodes
    WHERE tenant_id IN ('lamartingale','allolamartingale')
    GROUP BY tenant_id ORDER BY tenant_id
  `) as any[];
  console.log('[1] Counts avant :');
  for (const r of counts) console.log(`  ${r.tenant_id.padEnd(20)} ${r.n}`);

  // 2. Identification doublons par guid
  const dupByGuid = (await sql`
    SELECT lm.id AS lm_id, lm.title AS lm_title, lm.guid, lm.episode_number AS lm_ep_num,
           allo.id AS allo_id, allo.title AS allo_title, allo.episode_number AS allo_ep_num
    FROM episodes lm
    JOIN episodes allo ON allo.guid = lm.guid AND allo.tenant_id = 'allolamartingale'
    WHERE lm.tenant_id = 'lamartingale' AND lm.guid IS NOT NULL
    ORDER BY lm.id
  `) as any[];
  console.log(`\n[2] Doublons par guid (lm vs allo) : ${dupByGuid.length}`);
  for (const r of dupByGuid.slice(0, 10)) {
    console.log(`  lm/${r.lm_id} (#${r.lm_ep_num}) ↔ allo/${r.allo_id} (#${r.allo_ep_num})`);
    console.log(`    "${(r.lm_title || '').slice(0, 70)}"`);
  }
  if (dupByGuid.length > 10) console.log(`  … (${dupByGuid.length - 10} autres)`);

  // 3. Fallback : matching par audio_url si guid manquant côté lm
  const dupByAudio = (await sql`
    SELECT lm.id AS lm_id, lm.title AS lm_title, lm.audio_url, lm.episode_number AS lm_ep_num,
           allo.id AS allo_id, allo.title AS allo_title
    FROM episodes lm
    JOIN episodes allo ON allo.audio_url = lm.audio_url AND allo.tenant_id = 'allolamartingale'
    WHERE lm.tenant_id = 'lamartingale'
      AND lm.audio_url IS NOT NULL
      AND lm.id NOT IN (SELECT lm_id FROM (SELECT lm.id AS lm_id FROM episodes lm JOIN episodes allo ON allo.guid = lm.guid AND allo.tenant_id = 'allolamartingale' WHERE lm.tenant_id = 'lamartingale' AND lm.guid IS NOT NULL) sub)
    ORDER BY lm.id
  `) as any[];
  console.log(`\n[3] Doublons additionnels par audio_url (non couverts par guid) : ${dupByAudio.length}`);
  for (const r of dupByAudio.slice(0, 5)) {
    console.log(`  lm/${r.lm_id} (#${r.lm_ep_num}) ↔ allo/${r.allo_id}`);
    console.log(`    "${(r.lm_title || '').slice(0, 70)}"`);
  }

  // 4. Total doublons
  const dupIds = [...new Set([...dupByGuid.map((r: any) => r.lm_id), ...dupByAudio.map((r: any) => r.lm_id)])];
  console.log(`\n[4] Total IDs lm à supprimer : ${dupIds.length}`);

  if (dupIds.length === 0) {
    console.log('  no-op : aucun doublon trouvé.');
    return;
  }

  if (!WRITE) {
    console.log('\n[--dry] STOP. Pour exécuter : --write');
    return;
  }

  // 5. Backup
  const fullRows = (await sql`
    SELECT * FROM episodes WHERE id = ANY(${dupIds})
  `) as any[];
  const backupPath = 'C:/Users/jerem/lamartingale/.audit-hub/cleanup-allo-lm-B7.json';
  fs.writeFileSync(backupPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    purpose: 'Backup pre-DELETE Phase B7 — Allo LM duplicate rows in tenant lamartingale',
    ids_deleted: dupIds,
    rows: fullRows,
  }, null, 2), 'utf8');
  const sz = fs.statSync(backupPath).size;
  console.log(`[5] Backup → ${backupPath} (${(sz / 1024).toFixed(1)} KB)`);

  // 6. DELETE — toutes les tables enfants (FK referencing episodes via
  // (episode_id, tenant_id)) doivent être nettoyées avant le DELETE
  // d'episodes. Les FK avec ON DELETE CASCADE (episode_links, claims) sont
  // gérées automatiquement par Postgres ; les autres (episodes_media,
  // episodes_enrichment, quiz_questions, episode_similarities,
  // guest_episodes) doivent être nettoyées manuellement.
  console.log('\n[6] DELETE rows lamartingale doublons…');
  const childTables = [
    'episodes_media',
    'episodes_enrichment',
    'quiz_questions',
    'episode_similarities',
    'guest_episodes',
  ];
  for (const tbl of childTables) {
    try {
      // Filter par tenant_id='lamartingale' pour ne PAS toucher les rows allo
      const res = (await sql.query(
        `DELETE FROM ${tbl} WHERE episode_id = ANY($1) AND tenant_id = 'lamartingale'`,
        [dupIds],
      )) as any;
      console.log(`  ${tbl} : ${res.rowCount ?? 'n/a'} rows`);
    } catch (e: any) {
      console.log(`  ${tbl} : skip (${e.message?.slice(0, 80) || 'error'})`);
    }
  }
  // episode_similarities a 2 FK (episode_id + similar_episode_id), on a déjà
  // nettoyé episode_id, il faut aussi similar_episode_id
  try {
    const res = (await sql.query(
      `DELETE FROM episode_similarities WHERE similar_episode_id = ANY($1) AND tenant_id = 'lamartingale'`,
      [dupIds],
    )) as any;
    console.log(`  episode_similarities (similar_episode_id) : ${res.rowCount ?? 'n/a'} rows`);
  } catch (e: any) {
    console.log(`  episode_similarities (similar_episode_id) : skip`);
  }
  // episode_links et claims ont ON DELETE CASCADE → automatic
  const epRes = (await sql`DELETE FROM episodes WHERE id = ANY(${dupIds}) AND tenant_id = 'lamartingale'`) as any;
  console.log(`  episodes : ${epRes.count ?? 'n/a'} rows`);

  // 7. Verify
  const countsAfter = (await sql`
    SELECT tenant_id, COUNT(*)::int AS n FROM episodes
    WHERE tenant_id IN ('lamartingale','allolamartingale')
    GROUP BY tenant_id ORDER BY tenant_id
  `) as any[];
  console.log('\n[7] Counts après :');
  for (const r of countsAfter) console.log(`  ${r.tenant_id.padEnd(20)} ${r.n}`);
})().catch(e => { console.error(e); process.exit(1); });
