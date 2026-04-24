/**
 * Reclassify rss_links JSONB per-tenant (Rail 1)
 * ===============================================
 *
 * Source  : episodes.rss_links JSONB { url, label?, link_type? }[]
 *           classifié avant Rail 1 via un hardcode `lamartingale\.io\/(episode|podcast)`
 *           qui biaisait les 5 autres tenants (tout URL lamartingale.io → episode_ref,
 *           aucun URL gdiy.fr / lepanier.io / ... → episode_ref).
 *
 * But     : re-classifier chaque entrée via classifyUrl(url, websiteHost) pour
 *           aligner avec scrape-deep.ts et permettre, downstream, la levée de la
 *           blacklist episode_ref dans sync-rss-links-to-episode-links.ts.
 *
 * Stratégie : purement in-DB. Lit rss_links, re-classe en TS, écrit le JSONB mis
 * à jour. Ne touche PAS au RSS (pas de re-fetch). Idempotent : si toutes les
 * entrées sont déjà au bon link_type, 0 UPDATE.
 *
 * CLI (explicite obligatoire — cohérent avec sync) :
 *   --dry                         dry-run (default) : compte reclassifs par (old→new)
 *   --write                       exécute les UPDATEs
 *   --tenant <id>                 un seul tenant
 *   --tenants id1,id2,...         plusieurs
 *   --all                         tous (sauf ceux d'--exclude)
 *   --exclude id1,id2,...         à retirer quand --all
 *
 * Ex :
 *   npx tsx scripts/reclassify-rss-links.ts --dry --all --exclude hub
 *   npx tsx scripts/reclassify-rss-links.ts --write --tenant lepanier
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { classifyUrl, websiteHostFromUrl } from '../engine/scraping/rss/extractors';
import { classifyEpisodeRef } from '../engine/classify/episode-ref-rules';
import { getConfigById, listConfigs } from '../engine/config';

const sql = neon(process.env.DATABASE_URL!);

const KNOWN_TENANTS = ['lamartingale', 'gdiy', 'lepanier', 'finscale', 'passionpatrimoine', 'combiencagagne'];

function readFlag(name: string, withValue = false): string | boolean {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return withValue ? '' : false;
  if (!withValue) return true;
  return process.argv[idx + 1] || '';
}

function resolveTenants(): string[] {
  const single = readFlag('--tenant', true) as string;
  const multi = readFlag('--tenants', true) as string;
  const all = readFlag('--all') as boolean;
  const exclude = readFlag('--exclude', true) as string;

  const flags = [single, multi, all ? 'all' : ''].filter(Boolean);
  if (flags.length === 0) {
    console.error('[reclassify] ERREUR : préciser --tenant <id> | --tenants id1,id2 | --all');
    console.error(`  Tenants connus : ${KNOWN_TENANTS.join(', ')}`);
    process.exit(2);
  }
  if (flags.length > 1) {
    console.error(`[reclassify] ERREUR : flags mutuellement exclusifs : ${flags.join(' + ')}`);
    process.exit(2);
  }

  let tenants: string[];
  if (single) tenants = [single.trim()];
  else if (multi) tenants = multi.split(',').map((t) => t.trim()).filter(Boolean);
  else tenants = KNOWN_TENANTS.slice();

  if (exclude) {
    const ex = new Set(exclude.split(',').map((t) => t.trim()));
    tenants = tenants.filter((t) => !ex.has(t));
  }

  const unknown = tenants.filter((t) => !KNOWN_TENANTS.includes(t));
  if (unknown.length) {
    console.error(`[reclassify] ERREUR : tenants inconnus : ${unknown.join(', ')}`);
    console.error(`  Connus : ${KNOWN_TENANTS.join(', ')} | listConfigs() : ${listConfigs().join(', ')}`);
    process.exit(2);
  }
  return tenants;
}

function resolveHost(tenant: string): string | undefined {
  const cfg = getConfigById(tenant);
  if (!cfg) return undefined;
  return websiteHostFromUrl(cfg.website);
}

type Link = { url: string; label?: string; link_type?: string };

type EpisodeRow = { id: number; rss_links: Link[] | null };

async function loadEpisodes(tenant: string): Promise<EpisodeRow[]> {
  return (await sql`
    SELECT id, rss_links
    FROM episodes
    WHERE tenant_id = ${tenant}
      AND rss_links IS NOT NULL
      AND jsonb_array_length(rss_links) > 0
    ORDER BY id
  `) as EpisodeRow[];
}

type Pair = { old: string; new: string };
type Stats = {
  episodesScanned: number;
  episodesChanged: number;
  linksScanned: number;
  linksChanged: number;
  pairCounts: Map<string, number>; // "old→new" → count
  newTypeByKind: Map<string, number>; // post-reclassif distribution
  samples: { old: string; new: string; url: string }[];
  // Option D instrumentation : combien d'URLs self-host ont été écartées par R2/R3
  selfHostTotal: number;
  excludedRoot: number;
  excludedUtility: number;
  utilityPathsSeen: Map<string, number>; // path exact → count
  samplePathsNonUtilitySelfHost: Set<string>; // pour remonter un path utilitaire manquant
};

function incPair(m: Map<string, number>, key: string) {
  m.set(key, (m.get(key) ?? 0) + 1);
}

async function reclassifyTenant(tenant: string, write: boolean): Promise<Stats> {
  const host = resolveHost(tenant);
  if (!host) {
    console.warn(`  [${tenant}] websiteHost absent (cfg.website vide/invalide) — reclassif sans per-tenant episode_ref`);
  }

  const rows = await loadEpisodes(tenant);
  const stats: Stats = {
    episodesScanned: rows.length,
    episodesChanged: 0,
    linksScanned: 0,
    linksChanged: 0,
    pairCounts: new Map(),
    newTypeByKind: new Map(),
    samples: [],
    selfHostTotal: 0,
    excludedRoot: 0,
    excludedUtility: 0,
    utilityPathsSeen: new Map(),
    samplePathsNonUtilitySelfHost: new Set(),
  };

  for (const row of rows) {
    const links = row.rss_links ?? [];
    let changed = false;
    const updated: Link[] = [];
    for (const l of links) {
      stats.linksScanned++;
      const oldType = l.link_type || 'other';
      const newType = classifyUrl(l.url, host);
      incPair(stats.newTypeByKind, newType);

      // Instrumentation Option D : quand l'URL est self-host (même domaine
      // que le tenant), classifyEpisodeRef indique la raison (match/root/utility).
      if (host) {
        const decision = classifyEpisodeRef(l.url, host);
        if (decision !== 'host') {
          stats.selfHostTotal++;
          if (decision === 'root') stats.excludedRoot++;
          else if (decision === 'utility') {
            stats.excludedUtility++;
            try {
              const path = new URL(l.url).pathname;
              incPair(stats.utilityPathsSeen, path);
            } catch { /* no-op */ }
          } else if (decision === 'match' && stats.samplePathsNonUtilitySelfHost.size < 40) {
            try {
              const path = new URL(l.url).pathname;
              stats.samplePathsNonUtilitySelfHost.add(path);
            } catch { /* no-op */ }
          }
        }
      }

      if (oldType !== newType) {
        incPair(stats.pairCounts, `${oldType}→${newType}`);
        stats.linksChanged++;
        if (stats.samples.length < 6) {
          stats.samples.push({ old: oldType, new: newType, url: l.url });
        }
        changed = true;
        updated.push({ ...l, link_type: newType });
      } else {
        updated.push(l);
      }
    }
    if (changed) {
      stats.episodesChanged++;
      if (write) {
        await sql`
          UPDATE episodes SET rss_links = ${JSON.stringify(updated)}::jsonb
          WHERE id = ${row.id}
        `;
      }
    }
  }

  return stats;
}

function formatStats(tenant: string, host: string | undefined, stats: Stats): string {
  const lines: string[] = [];
  lines.push(`\n── ${tenant} ${host ? `(host=${host})` : '(host=∅)'} ──`);
  lines.push(`  episodes scannés   : ${stats.episodesScanned}`);
  lines.push(`  links scannés      : ${stats.linksScanned}`);
  lines.push(`  episodes modifiés  : ${stats.episodesChanged}`);
  lines.push(`  links reclassifiés : ${stats.linksChanged}`);

  if (stats.pairCounts.size > 0) {
    lines.push('  reclassifs (old → new) :');
    const pairs = [...stats.pairCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [k, c] of pairs) lines.push(`    ${k.padEnd(40)} ${String(c).padStart(5)}`);
  } else {
    lines.push('  aucun reclassif (idempotent)');
  }

  lines.push('  distribution post-reclassif :');
  const byKind = [...stats.newTypeByKind.entries()].sort((a, b) => b[1] - a[1]);
  for (const [k, c] of byKind) lines.push(`    ${k.padEnd(22)} ${String(c).padStart(6)}`);

  if (stats.samples.length > 0) {
    lines.push('  sample URLs reclassifiées :');
    for (const s of stats.samples) {
      const url = s.url.length > 80 ? s.url.slice(0, 77) + '...' : s.url;
      lines.push(`    ${s.old} → ${s.new}  ${url}`);
    }
  }

  // Option D instrumentation : R2/R3 counts + paths utilitaires rencontrés
  if (stats.selfHostTotal > 0) {
    const matched = stats.selfHostTotal - stats.excludedRoot - stats.excludedUtility;
    lines.push(`  self-host URLs : ${stats.selfHostTotal} (match=${matched}, exclu R2 racine=${stats.excludedRoot}, exclu R3 utilitaire=${stats.excludedUtility})`);
    if (stats.utilityPathsSeen.size > 0) {
      lines.push('  paths utilitaires matchés (R3) :');
      const paths = [...stats.utilityPathsSeen.entries()].sort((a, b) => b[1] - a[1]);
      for (const [p, c] of paths.slice(0, 15)) lines.push(`    ${p.padEnd(40)} ${String(c).padStart(5)}`);
    }
    if (stats.samplePathsNonUtilitySelfHost.size > 0) {
      lines.push(`  sample paths self-host classés episode_ref (≤40 pour vérif manuelle) :`);
      const paths = [...stats.samplePathsNonUtilitySelfHost].slice(0, 20);
      for (const p of paths) lines.push(`    ${p}`);
    }
  }
  return lines.join('\n');
}

(async () => {
  const tenants = resolveTenants();
  const write = (readFlag('--write') as boolean) && !(readFlag('--dry') as boolean);
  const mode = write ? 'WRITE' : 'DRY-RUN';

  console.log(`\n═══ Reclassify rss_links JSONB (${mode}) ═══`);
  console.log(`Tenants : ${tenants.join(', ')}`);

  const totals = { episodes: 0, links: 0, changed: 0 };
  for (const t of tenants) {
    const host = resolveHost(t);
    const stats = await reclassifyTenant(t, write);
    console.log(formatStats(t, host, stats));
    totals.episodes += stats.episodesScanned;
    totals.links += stats.linksScanned;
    totals.changed += stats.linksChanged;
  }

  console.log(`\n═══ Total (${mode}) ═══`);
  console.log(`  episodes scannés   : ${totals.episodes}`);
  console.log(`  links scannés      : ${totals.links}`);
  console.log(`  links reclassifiés : ${totals.changed}`);
  if (!write) console.log(`\n(dry-run — aucune écriture. Ajoute --write pour exécuter.)`);
})().catch((e) => {
  console.error('[reclassify] fatal', e);
  process.exit(1);
});
