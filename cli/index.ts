#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync, SpawnSyncOptions } from 'child_process';

// ============================================================================
// Podcast Factory CLI — instancie, ingère, déploie et supervise les podcasts
// gérés par le moteur. Usage :
//   npx tsx cli/index.ts <command> [options]
// ============================================================================

const ROOT = path.resolve(__dirname, '..');
const INSTANCES_DIR = path.join(ROOT, 'instances');
const VERCEL_CONFIGS_DIR = path.join(ROOT, 'vercel-configs');
const TEMPLATE_PATH = path.join(INSTANCES_DIR, '_template.config.ts');

function slug(s: string): string {
  return s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
}

function runStep(label: string, cmd: string, args: string[], extraEnv: Record<string, string> = {}): { ok: boolean; ms: number } {
  const t0 = Date.now();
  process.stdout.write(`  ${label}... `);
  const opts: SpawnSyncOptions = {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
    shell: process.platform === 'win32',
  };
  const r = spawnSync(cmd, args, opts);
  const ms = Date.now() - t0;
  const ok = r.status === 0;
  console.log(ok ? `OK (${(ms / 1000).toFixed(1)}s)` : `ECHEC`);
  return { ok, ms };
}

async function fetchRssMetadata(url: string): Promise<{ title?: string; image?: string; language?: string; itemCount?: number; categories?: string[] }> {
  try {
    const resp = await fetch(url);
    const xml = await resp.text();
    const title = xml.match(/<title[^>]*>(?:<!\[CDATA\[)?([^<\]]+)\]?\]?>/)?.[1]?.trim();
    const image = xml.match(/<itunes:image\s+href=['"]([^'"]+)['"]/)?.[1];
    const language = xml.match(/<language>([^<]+)<\/language>/)?.[1];
    const itemCount = (xml.match(/<item\b/g) || []).length;
    const cats = Array.from(xml.matchAll(/<itunes:category\s+text=['"]([^'"]+)['"]/g)).map(m => m[1]);
    return { title, image, language, itemCount, categories: [...new Set(cats)] };
  } catch {
    return {};
  }
}

// ============================================================================
// init
// ============================================================================

async function cmdInit(opts: { name: string; id?: string; rss: string; color: string; font?: string; host?: string }): Promise<void> {
  const id = (opts.id || slug(opts.name)).toLowerCase();
  if (!id) throw new Error('id vide — précise --id');
  const target = path.join(INSTANCES_DIR, `${id}.config.ts`);
  if (fs.existsSync(target)) {
    throw new Error(`instances/${id}.config.ts existe deja. Choisis un autre --id.`);
  }
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(`Template manquant : ${TEMPLATE_PATH}`);
  }

  console.log(`\nFetch RSS ${opts.rss}...`);
  const meta = await fetchRssMetadata(opts.rss);

  let body = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
  body = body
    .replace(/\{\{ID\}\}/g, id)
    .replace(/\{\{NAME\}\}/g, opts.name)
    .replace(/\{\{RSS_URL\}\}/g, opts.rss)
    .replace(/\{\{COLOR\}\}/g, opts.color)
    .replace(/\{\{FONT\}\}/g, opts.font || 'Inter')
    .replace(/\{\{HOST\}\}/g, opts.host || '');

  // Exporter sous un nom typable (ex: legratinConfig) en plus du default
  body = body.replace(
    /export default config;/,
    `export const ${id}Config = config;\nexport default config;`,
  );

  fs.writeFileSync(target, body, 'utf-8');

  // Vercel config par defaut (copie LM — route vers v2.html)
  const vercelConfig = {
    version: 2,
    builds: [
      { src: 'api/index.ts', use: '@vercel/node' },
      { src: 'frontend/**', use: '@vercel/static' },
    ],
    rewrites: [
      { source: '/api/(.*)', destination: '/api/index.ts' },
      { source: '/', destination: '/frontend/v2.html' },
      { source: '/index.html', destination: '/frontend/v2.html' },
      { source: '/episode/:id', destination: '/frontend/episode.html' },
      { source: '/episode', destination: '/frontend/episode.html' },
      { source: '/(.*)', destination: '/frontend/$1' },
    ],
  };
  const vercelPath = path.join(VERCEL_CONFIGS_DIR, `vercel-${id}.json`);
  fs.writeFileSync(vercelPath, JSON.stringify(vercelConfig, null, 2) + '\n', 'utf-8');

  console.log(`\nPodcast "${opts.name}" initialise\n`);
  console.log(`  Config    instances/${id}.config.ts`);
  if (meta.itemCount) console.log(`  RSS       ${meta.itemCount} episodes detectes`);
  if (meta.title) console.log(`  Titre RSS ${meta.title}`);
  if (meta.language) console.log(`  Langue    ${meta.language}`);
  if (meta.categories?.length) console.log(`  Categories ${meta.categories.join(', ')}`);
  console.log(`  Vercel    vercel-configs/vercel-${id}.json`);
  console.log(`\nProchaine etape : npx tsx cli/index.ts ingest --podcast ${id}\n`);
}

// ============================================================================
// ingest
// ============================================================================

async function cmdIngest(opts: { podcast: string; force?: boolean }): Promise<void> {
  const id = opts.podcast;
  const cfgPath = path.join(INSTANCES_DIR, `${id}.config.ts`);
  if (!fs.existsSync(cfgPath)) throw new Error(`instances/${id}.config.ts introuvable. Lance d'abord cli init.`);

  const env = { PODCAST_ID: id };
  const t0 = Date.now();
  console.log(`\n=== Ingest ${id} ===\n`);

  const steps = [
    { label: '[1/6] Ingest RSS (INSERT+UPDATE)', cmd: 'npx', args: ['tsx', 'engine/scraping/ingest-rss.ts'] },
    { label: '[2/6] Parse descriptions RSS', cmd: 'npx', args: ['tsx', 'engine/scraping/rss/backfill-parsed.ts'] },
    { label: '[3/6] Deep scrape site', cmd: 'npx', args: ['tsx', 'engine/scraping/scrape-deep.ts'], optional: true },
    { label: '[4/6] Generate quiz', cmd: 'npx', args: ['tsx', 'engine/ai/generate-quiz.ts', '--write'], optional: true },
    { label: '[5/6] Embeddings', cmd: 'npx', args: ['tsx', 'engine/ai/embeddings.ts'] },
    { label: '[6/6] Similarities', cmd: 'npx', args: ['tsx', 'engine/ai/similarity.ts'] },
  ];

  let failures = 0;
  for (const s of steps) {
    const r = runStep(s.label, s.cmd, s.args, env);
    if (!r.ok) {
      failures++;
      if (!s.optional) {
        console.log(`\nEtape obligatoire echouee. Stop.\n`);
        process.exit(1);
      }
    }
  }

  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`\nIngest ${id} termine en ${mins} min (${failures} etape(s) optionnelle(s) en echec)`);
  console.log(`Prochaine etape : npx tsx cli/index.ts deploy --podcast ${id}\n`);
}

// ============================================================================
// deploy
// ============================================================================

async function cmdDeploy(opts: { podcast: string }): Promise<void> {
  const id = opts.podcast;
  const cfgPath = path.join(INSTANCES_DIR, `${id}.config.ts`);
  const vercelPath = path.join(VERCEL_CONFIGS_DIR, `vercel-${id}.json`);
  if (!fs.existsSync(cfgPath)) throw new Error(`instances/${id}.config.ts introuvable.`);
  if (!fs.existsSync(vercelPath)) throw new Error(`vercel-configs/vercel-${id}.json introuvable.`);

  // Charge la config pour recuperer vercelProject
  const cfg = require(cfgPath);
  const podcastCfg = cfg.default ?? cfg[`${id}Config`] ?? cfg.config;
  const project = podcastCfg?.deploy?.vercelProject || `${id}-v2`;
  const scope = podcastCfg?.deploy?.vercelScope || 'jeremyh974s-projects';

  console.log(`\n=== Deploy ${id} -> ${project} ===\n`);

  // Re-link .vercel vers le projet cible
  const vercelDir = path.join(ROOT, '.vercel');
  if (fs.existsSync(vercelDir)) fs.rmSync(vercelDir, { recursive: true, force: true });

  const linkArgs = ['link', '--yes', '--scope', scope, '--project', project];
  const linkR = spawnSync('vercel', linkArgs, { cwd: ROOT, stdio: 'inherit', shell: true });
  if (linkR.status !== 0) {
    console.log(`\nvercel link echoue. Le projet ${project} existe-t-il ? Cree-le sur vercel.com d'abord.\n`);
    process.exit(1);
  }

  const deployArgs = ['--yes', '--prod', '--scope', scope, '--local-config', `vercel-configs/vercel-${id}.json`];
  const deployR = spawnSync('vercel', deployArgs, { cwd: ROOT, stdio: 'inherit', shell: true });
  if (deployR.status !== 0) { console.log(`\nvercel deploy echoue.\n`); process.exit(1); }

  console.log(`\nDeploy ${id} OK\n  URL https://${project}.vercel.app\n`);
}

// ============================================================================
// refresh
// ============================================================================

async function cmdRefresh(opts: { podcast: string }): Promise<void> {
  const id = opts.podcast;
  const cfgPath = path.join(INSTANCES_DIR, `${id}.config.ts`);
  if (!fs.existsSync(cfgPath)) throw new Error(`instances/${id}.config.ts introuvable.`);

  const env = { PODCAST_ID: id };
  console.log(`\n=== Refresh ${id} ===\n`);

  runStep('Scrape RSS (nouveaux)', 'npx', ['tsx', 'engine/scraping/scrape-rss.ts'], env);
  runStep('Parse descriptions RSS', 'npx', ['tsx', 'engine/scraping/rss/backfill-parsed.ts'], env);
  runStep('Embeddings (nouveaux)', 'npx', ['tsx', 'engine/ai/embeddings.ts'], env);
  runStep('Recalcul similarites', 'npx', ['tsx', 'engine/ai/similarity.ts'], env);
  console.log(`\nRefresh ${id} termine. Relance 'deploy' pour pousser.\n`);
}

// ============================================================================
// status
// ============================================================================

async function cmdStatus(): Promise<void> {
  // Liste les configs dispo
  const files = fs.readdirSync(INSTANCES_DIR).filter(f => f.endsWith('.config.ts') && !f.startsWith('_'));
  const ids = files.map(f => f.replace(/\.config\.ts$/, ''));

  if (!process.env.DATABASE_URL) {
    console.log('\nDATABASE_URL absent — stats DB non disponibles.\n');
    console.log('Podcasts configures :');
    ids.forEach(id => console.log(`  - ${id}`));
    return;
  }

  const { neon } = require('@neondatabase/serverless') as typeof import('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL);

  console.log('\n' + '-'.repeat(90));
  console.log('Podcast'.padEnd(22) + 'Episodes'.padStart(10) + 'Hours'.padStart(8) + 'Articles'.padStart(10) + 'Embeds'.padStart(10) + '  URL');
  console.log('-'.repeat(90));

  let totEp = 0, totHr = 0, totArt = 0, totEmb = 0;
  for (const id of ids) {
    try {
      const [r] = (await sql`
        SELECT
          (SELECT count(*)::int FROM episodes WHERE tenant_id = ${id}) AS eps,
          (SELECT COALESCE(SUM(duration_seconds),0)::bigint FROM episodes WHERE tenant_id = ${id}) AS secs,
          (SELECT count(*)::int FROM episodes WHERE tenant_id = ${id} AND article_content IS NOT NULL AND length(article_content) > 200) AS arts,
          (SELECT count(*)::int FROM episodes_enrichment WHERE tenant_id = ${id} AND embedding IS NOT NULL) AS embs
      `) as any[];
      const hours = Math.round(Number(r.secs) / 3600);
      totEp += Number(r.eps); totHr += hours; totArt += Number(r.arts); totEmb += Number(r.embs);
      let url = `${id}-v2.vercel.app`;
      try {
        const cfg = require(path.join(INSTANCES_DIR, `${id}.config.ts`));
        const c = cfg.default ?? cfg[`${id}Config`] ?? cfg.config;
        if (c?.deploy?.domain) url = c.deploy.domain;
      } catch { /* fallback au pattern par defaut */ }
      console.log(id.padEnd(22) + String(r.eps).padStart(10) + `${hours}h`.padStart(8) + String(r.arts).padStart(10) + `${r.embs}/${r.eps}`.padStart(10) + `  ${url}`);
    } catch (e: any) {
      console.log(id.padEnd(22) + 'ERR'.padStart(10) + ` — ${e.message}`);
    }
  }
  console.log('-'.repeat(90));
  console.log('TOTAL'.padEnd(22) + String(totEp).padStart(10) + `${totHr}h`.padStart(8) + String(totArt).padStart(10) + `${totEmb}/${totEp}`.padStart(10));
  console.log();
}

// ============================================================================
// Parser
// ============================================================================

const program = new Command();
program.name('podcast-engine').description('Podcast Factory CLI').version('1.0.0');

program.command('init')
  .description('Initialise un nouveau podcast (config + vercel-config)')
  .requiredOption('--name <name>', 'Nom du podcast (ex: "Le Gratin")')
  .option('--id <id>', 'Identifiant technique (defaut: slug du nom)')
  .requiredOption('--rss <url>', 'URL du flux RSS')
  .requiredOption('--color <hex>', 'Couleur primaire (#FF6B6B)')
  .option('--font <name>', 'Police (defaut: Inter)')
  .option('--host <name>', 'Nom de l\'hote')
  .action(cmdInit);

program.command('ingest')
  .description('Pipeline complet d\'ingestion (RSS + deep + quiz + embeddings)')
  .requiredOption('--podcast <id>', 'PODCAST_ID cible')
  .option('--force', 'Force re-ingestion')
  .action(cmdIngest);

program.command('deploy')
  .description('Deploy Vercel (re-link + deploy en prod)')
  .requiredOption('--podcast <id>', 'PODCAST_ID cible')
  .action(cmdDeploy);

program.command('refresh')
  .description('Refresh incremental (nouveaux episodes uniquement)')
  .requiredOption('--podcast <id>', 'PODCAST_ID cible')
  .action(cmdRefresh);

program.command('status')
  .description('Etat de tous les podcasts (depuis la DB)')
  .action(cmdStatus);

program.parseAsync(process.argv).catch(e => { console.error('\nERREUR:', e.message, '\n'); process.exit(1); });
