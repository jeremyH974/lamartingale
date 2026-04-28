/**
 * Phase C (2026-04-28) — Bulk génération briefs invités cross-tenant.
 *
 * Cible : top N guests cross_podcast_guests ayant ≥ 2 podcasts, non-host,
 * sans brief existant (brief_md NULL). Tri par total_podcasts DESC,
 * total_episodes DESC. Reprise naturelle (le filtre `brief_md IS NULL`
 * agit comme checkpoint).
 *
 * Wrapper : engine/agents/wrappers/persistGuestBrief.ts (Sonnet 4.6).
 * Coût observé sur Joseph Choueifaty (3 pods, 4 eps) : 4.17 cents.
 *
 * Modes :
 *   --dry  (default) : SELECT seulement, log liste + estimation coût.
 *   --write          : exécution réelle persistGuestBrief.
 *   --max <N>        : nombre max de guests (default 50, hard cap 100).
 *   --batch <N>      : taille de batch (default 10).
 *   --force          : override skip si brief_md déjà non-null
 *                      (rarement utile, garde-fou explicite).
 *
 * Caps budget :
 *   - alerte intermédiaire si cumul > $5 (continue)
 *   - alerte hard si cumul > $10 (continue)
 *   - STOP automatique si cumul > $15 (cap absolu)
 *
 * Pour limiter le risque sur batch 1, ce script accepte --batch 10 et
 * fait un STOP propre après le N-ième batch indiqué via --batches <N>.
 *
 * Idempotent : re-run safe (rejoint là où interrompu via filter brief_md NULL).
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { Command } from 'commander';
import { persistGuestBrief } from '../engine/agents/wrappers/persistGuestBrief';

const program = new Command();
program
  .option('--dry', 'dry-run sans UPDATE DB (default)')
  .option('--write', 'écriture DB explicite (opt-in)')
  .option('--max <n>', 'nombre max guests (cap absolu 100)', (v) => parseInt(v, 10), 50)
  .option('--batch <n>', 'taille de batch', (v) => parseInt(v, 10), 10)
  .option('--batches <n>', 'nb max de batches à exécuter (default ∞)', (v) => parseInt(v, 10), Infinity)
  .option('--force', 'override skip si brief_md déjà non-null')
  .option('--model <m>', 'sonnet | haiku', 'sonnet')
  .option('--max-episodes <n>', 'cap nb épisodes par brief', (v) => parseInt(v, 10), 10);
program.parse(process.argv);
const opts = program.opts<any>();

const WRITE = !!opts.write;
const MAX_GUESTS = Math.min(opts.max ?? 50, 100); // hard cap
const BATCH_SIZE = opts.batch ?? 10;
const MAX_BATCHES = opts.batches ?? Infinity;
const FORCE = !!opts.force;

const ALERT_5 = 500;   // cents
const ALERT_10 = 1000; // cents
const STOP_15 = 1500;  // cents (hard cap)

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log(`\n━━━ Phase C bulk briefs ${WRITE ? '(--write)' : '(--dry)'} ━━━`);
  console.log(`max=${MAX_GUESTS}, batch=${BATCH_SIZE}, batches=${MAX_BATCHES === Infinity ? '∞' : MAX_BATCHES}, force=${FORCE}, model=${opts.model}\n`);

  // 1. Baseline counts
  const beforeStats = (await sql`
    SELECT
      COUNT(*) FILTER (WHERE brief_md IS NOT NULL)::int AS with_brief,
      COUNT(*) FILTER (WHERE total_podcasts >= 2 AND is_host = false)::int AS cross_tenant_pool
    FROM cross_podcast_guests
  `) as any[];
  console.log(`Baseline : ${beforeStats[0].with_brief} briefs existants, ${beforeStats[0].cross_tenant_pool} guests cross-tenant pool`);

  // 2. SELECT cible
  const selectQuery = FORCE
    ? sql`
        SELECT id, canonical_name, display_name, total_podcasts, total_episodes
        FROM cross_podcast_guests
        WHERE total_podcasts >= 2 AND is_host = false
        ORDER BY total_podcasts DESC, total_episodes DESC
        LIMIT ${MAX_GUESTS}
      `
    : sql`
        SELECT id, canonical_name, display_name, total_podcasts, total_episodes
        FROM cross_podcast_guests
        WHERE total_podcasts >= 2 AND is_host = false
          AND (brief_md IS NULL OR length(brief_md) < 50)
        ORDER BY total_podcasts DESC, total_episodes DESC
        LIMIT ${MAX_GUESTS}
      `;
  const targets = (await selectQuery) as any[];
  console.log(`\nCibles sélectionnées : ${targets.length} guests`);
  console.log('Top 10 cibles :');
  for (const t of targets.slice(0, 10)) {
    console.log(`  id=${String(t.id).padStart(4)} pods=${t.total_podcasts} eps=${t.total_episodes} "${t.display_name || t.canonical_name}"`);
  }

  // 3. Estimation coût
  const COST_PER_BRIEF_CENTS = 4.17; // observé sur Choueifaty
  const estimatedTotalCents = targets.length * COST_PER_BRIEF_CENTS;
  console.log(`\nEstimation : ${targets.length} briefs × ~${COST_PER_BRIEF_CENTS}¢ = ~${(estimatedTotalCents / 100).toFixed(2)}$`);

  if (!WRITE) {
    console.log('\n[--dry] STOP. Pour exécuter : --write');
    return;
  }

  // 4. Bulk run par batch
  let cumulCents = 0;
  let batchNum = 0;
  let processed = 0;
  let succeeded = 0;
  let failed: { id: number; name: string; error: string }[] = [];
  const results: any[] = [];

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    batchNum++;
    if (batchNum > MAX_BATCHES) {
      console.log(`\n[STOP] Limite --batches=${MAX_BATCHES} atteinte. Arrêt propre.`);
      break;
    }
    const batch = targets.slice(i, i + BATCH_SIZE);
    console.log(`\n═══ Batch ${batchNum} : ${batch.length} guests ═══`);

    for (const t of batch) {
      // Hard cap LLM
      if (cumulCents >= STOP_15) {
        console.error(`\n🚨 [STOP HARD] Cumul ${(cumulCents / 100).toFixed(2)}$ >= 15$, arrêt immédiat.`);
        break;
      }
      const t0 = Date.now();
      try {
        const r = await persistGuestBrief({
          guestId: t.id,
          llmModel: opts.model,
          maxEpisodes: opts.maxEpisodes,
          dryRun: false,
        });
        cumulCents += r.costEstimateCents;
        processed++;
        succeeded++;
        results.push({
          id: t.id,
          name: t.display_name || t.canonical_name,
          pods: t.total_podcasts,
          eps: r.episodesUsed,
          source_quality_avg: r.brief?.metadata?.sourceQualityAvg ?? null,
          cost_cents: r.costEstimateCents,
          duration_ms: r.durationMs,
        });
        console.log(`  ✅ id=${t.id} ${(r.costEstimateCents).toFixed(2)}¢ ${r.durationMs}ms eps=${r.episodesUsed} qa=${r.brief?.metadata?.sourceQualityAvg?.toFixed(2) ?? '?'} "${(t.display_name || t.canonical_name).slice(0, 50)}"`);
      } catch (e: any) {
        processed++;
        failed.push({ id: t.id, name: t.display_name || t.canonical_name, error: e.message });
        console.error(`  ❌ id=${t.id} FAILED ${(Date.now() - t0)}ms : ${e.message?.slice(0, 80)}`);
      }
    }

    console.log(`\nBatch ${batchNum} done. Cumul session: ${(cumulCents / 100).toFixed(2)}$`);
    if (cumulCents >= ALERT_10) {
      console.warn(`⚠️ [ALERTE] Cumul ${(cumulCents / 100).toFixed(2)}$ >= 10$, cap proche. Continue.`);
    } else if (cumulCents >= ALERT_5) {
      console.warn(`⚠️ [ALERTE] Cumul ${(cumulCents / 100).toFixed(2)}$ >= 5$, alerte intermédiaire. Continue.`);
    }

    if (cumulCents >= STOP_15) break;
  }

  // 5. Résumé
  console.log('\n━━━ Résumé ━━━');
  console.log(`Processed : ${processed} / ${targets.length}`);
  console.log(`Succeeded : ${succeeded}`);
  console.log(`Failed    : ${failed.length}`);
  console.log(`Coût réel : ${(cumulCents / 100).toFixed(2)}$`);
  if (failed.length > 0) {
    console.log('\nFailures :');
    for (const f of failed) console.log(`  id=${f.id} "${f.name}" → ${f.error?.slice(0, 100)}`);
  }

  // Average source quality
  if (results.length > 0) {
    const avgQ = results.filter(r => r.source_quality_avg != null).reduce((s, r) => s + r.source_quality_avg, 0) / results.filter(r => r.source_quality_avg != null).length;
    console.log(`Avg sourceQualityAvg : ${avgQ.toFixed(3)}`);
  }

  // 6. Counts post
  const afterStats = (await sql`
    SELECT
      COUNT(*) FILTER (WHERE brief_md IS NOT NULL)::int AS with_brief
    FROM cross_podcast_guests
  `) as any[];
  console.log(`\nBriefs en DB après run : ${afterStats[0].with_brief} (vs ${beforeStats[0].with_brief} avant, +${afterStats[0].with_brief - beforeStats[0].with_brief})`);
}

main().catch((e) => {
  console.error('[FATAL]', e);
  process.exit(1);
});
