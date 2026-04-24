/**
 * backfill-slugs-lm.ts
 *
 * Backfill slugs vides pour La Martingale via crawl du listing officiel
 * (https://lamartingale.io/listes-des-episodes/?category=tous&current_page=N),
 * puis matching fuzzy par titre (Jaccard tokens).
 *
 * Usage :
 *   npx tsx scripts/backfill-slugs-lm.ts              # --dry par défaut
 *   npx tsx scripts/backfill-slugs-lm.ts --write      # opt-in explicite
 *
 * Règle projet (docs/DETTE.md) : écrit par défaut = bug. Dry-run obligatoire.
 */
import 'dotenv/config';
import * as cheerio from 'cheerio';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);
const BASE = 'https://lamartingale.io';
const LISTING = `${BASE}/listes-des-episodes/?category=tous`;
const UA = 'Mozilla/5.0 (compatible; LaMartingale-DataBot/1.0)';
const DELAY = 800;
const MAX_PAGES = 30;
const JACCARD_THRESHOLD = parseFloat(process.env.JACCARD_THRESHOLD || '0.35');

const WRITE = process.argv.includes('--write');
const MODE = WRITE ? 'WRITE' : 'DRY';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const STOPWORDS = new Set([
  'le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'd', 'et',
  'en', 'a', 'au', 'aux', 'que', 'qui', 'pour', 'avec', 'dans', 'sur',
  'par', 'ce', 'cette', 'ces', 'se', 's', 'il', 'elle', 'on', 'ne',
  'pas', 'est', 'sont', 'c', 'y', 'ou', 'mais',
]);

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, ' ')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s: string): Set<string> {
  return new Set(
    normalize(s)
      .split(' ')
      .filter((t) => t.length >= 2 && !STOPWORDS.has(t)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return inter / union;
}

function extractSlugFromUrl(url: string): string | null {
  const m = url.match(/\/tous\/([a-z0-9-]+)\/?$/);
  return m ? m[1] : null;
}

interface ListedItem {
  slug: string;
  title: string;
  url: string;
}

async function fetchListingPage(n: number): Promise<ListedItem[]> {
  const url = n === 1 ? LISTING : `${LISTING}&current_page=${n}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return [];
  const html = await res.text();
  const $ = cheerio.load(html);
  const map = new Map<string, ListedItem>();
  $('a[href*="/tous/"]').each((_, el) => {
    const href = ($(el).attr('href') || '').trim();
    const text = $(el).text().trim().replace(/\s+/g, ' ');
    if (!text || text.length < 8) return;
    if (text === 'En savoir plus') return;
    const slug = extractSlugFromUrl(href);
    if (!slug) return;
    // On garde le premier texte significatif par slug
    if (!map.has(slug)) {
      map.set(slug, { slug, title: text, url: href });
    }
  });
  return Array.from(map.values());
}

async function crawlAllListings(): Promise<ListedItem[]> {
  const all = new Map<string, ListedItem>();
  for (let n = 1; n <= MAX_PAGES; n++) {
    const items = await fetchListingPage(n);
    if (items.length === 0) {
      console.log(`  page ${n}: empty — stop`);
      break;
    }
    let added = 0;
    for (const it of items) {
      if (!all.has(it.slug)) {
        all.set(it.slug, it);
        added++;
      }
    }
    console.log(`  page ${n}: ${items.length} items (${added} new, total ${all.size})`);
    if (added === 0 && n > 3) {
      console.log(`  no new slugs — stop`);
      break;
    }
    await sleep(DELAY);
  }
  return Array.from(all.values());
}

async function main() {
  console.log(`[BACKFILL-SLUGS-LM] mode=${MODE} threshold=${JACCARD_THRESHOLD}`);
  console.log(`[1/4] Fetching DB episodes with empty slug (tenant=lamartingale)`);
  const missing = (await sql`
    SELECT id, episode_number, title, slug
    FROM episodes
    WHERE tenant_id = 'lamartingale' AND (slug IS NULL OR slug = '' OR slug = ' ')
    ORDER BY episode_number
  `) as { id: number; episode_number: number; title: string; slug: string | null }[];
  console.log(`  ${missing.length} episodes without slug`);
  if (missing.length === 0) { console.log('  nothing to do'); return; }

  console.log(`\n[2/4] Crawling listing ${LISTING}`);
  const listed = await crawlAllListings();
  console.log(`  ${listed.length} episodes found on site`);

  // Pré-indexation des tokens du site pour éviter recompute
  const siteTokens = listed.map((it) => ({ it, tk: tokens(it.title) }));

  console.log(`\n[3/4] Fuzzy matching (Jaccard >= ${JACCARD_THRESHOLD})`);
  const matches: Array<{
    ep: typeof missing[number];
    site: ListedItem;
    score: number;
  }> = [];
  const unmatched: typeof missing = [];
  const ambiguous: Array<{ ep: typeof missing[number]; top: Array<{ site: ListedItem; score: number }> }> = [];

  for (const ep of missing) {
    const epTk = tokens(ep.title);
    const scored = siteTokens
      .map(({ it, tk }) => ({ site: it, score: jaccard(epTk, tk) }))
      .filter((s) => s.score >= JACCARD_THRESHOLD)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      unmatched.push(ep);
      continue;
    }
    const best = scored[0];
    const runnerUp = scored[1];
    // ambiguous si 2e match très proche (<= 0.05 d'écart)
    if (runnerUp && best.score - runnerUp.score <= 0.05 && best.score < 0.85) {
      ambiguous.push({ ep, top: scored.slice(0, 3) });
      continue;
    }
    matches.push({ ep, site: best.site, score: best.score });
  }

  console.log(`  matches: ${matches.length}`);
  console.log(`  ambiguous: ${ambiguous.length}`);
  console.log(`  unmatched: ${unmatched.length}`);

  console.log(`\n[MATCHES]`);
  for (const m of matches) {
    console.log(
      `  #${m.ep.episode_number} (${m.score.toFixed(2)})\n    DB  : ${m.ep.title}\n    SITE: ${m.site.title}\n    SLUG: ${m.site.slug}`,
    );
  }

  if (ambiguous.length > 0) {
    console.log(`\n[AMBIGUOUS — review manually]`);
    for (const a of ambiguous) {
      console.log(`  #${a.ep.episode_number} "${a.ep.title}"`);
      for (const t of a.top) {
        console.log(`    ${t.score.toFixed(2)} → ${t.site.slug} :: ${t.site.title}`);
      }
    }
  }

  if (unmatched.length > 0) {
    console.log(`\n[UNMATCHED — dette irrécupérable]`);
    for (const u of unmatched) {
      console.log(`  #${u.episode_number} "${u.title}"`);
    }
  }

  console.log(`\n[4/4] ${MODE === 'WRITE' ? 'Writing to DB' : 'Dry-run — no DB changes'}`);
  if (MODE !== 'WRITE') {
    console.log(`  Re-run with --write to apply ${matches.length} UPDATEs.`);
    return;
  }

  let updated = 0;
  for (const m of matches) {
    const articleUrl = `${BASE}/tous/${m.site.slug}/`;
    await sql`
      UPDATE episodes
      SET slug = ${m.site.slug},
          article_url = ${articleUrl},
          url = ${articleUrl}
      WHERE id = ${m.ep.id} AND tenant_id = 'lamartingale'
    `;
    updated++;
  }
  console.log(`  ${updated} rows updated.`);
  console.log(`\n  Next: npx tsx engine/scraping/scrape-deep.ts (optional) + re-embed.`);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
