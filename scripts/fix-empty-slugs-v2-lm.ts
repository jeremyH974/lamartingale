/**
 * Fix des slugs vides — V2 approche par RSS.
 *
 * Stratégie revue :
 *   1. Scrape le RSS Audiomeans → dictionnaire {episodeNumber → title}
 *   2. Pour chaque épisode BDD avec slug vide, récupère le titre RSS
 *   3. Slugifie le titre, teste plusieurs variantes d'URL /tous/{variant}/
 *   4. Si une variante répond 200 → match → UPDATE BDD
 */
import 'dotenv/config';
import { XMLParser } from 'fast-xml-parser';
import * as cheerio from 'cheerio';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);
const BASE = 'https://lamartingale.io';
const UA = 'LaMartingale-DataBot/1.0';
const DELAY = 1200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function firstString(v: any): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') {
    if (typeof v['#cdata'] === 'string') return v['#cdata'].trim() || null;
    if (typeof v['#text'] === 'string') return v['#text'].trim() || null;
  }
  return null;
}

function extractNumFromTitle(t: string): number | null {
  const m = t.match(/^#?\s*(\d+)\s*[-–]/);
  return m ? parseInt(m[1], 10) : null;
}

function cleanTitle(raw: string): string {
  // "#173 - Les 5 règles d'or de l'investissement - Thami Kabbaj" → "Les 5 règles d'or de l'investissement"
  let t = raw.replace(/^#?\s*\d+\s*[-–]\s*/, '');
  // Strip trailing guest name: last " - X" where X has no further " - "
  const parts = t.split(/\s+[-–]\s+/);
  if (parts.length > 1) {
    // Remove the last segment if it looks like a name (short, no question mark)
    const last = parts[parts.length - 1].trim();
    if (last.length < 50 && !last.includes('?') && !last.includes('!')) {
      t = parts.slice(0, -1).join(' - ');
    }
  }
  return t.trim();
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function slugVariants(title: string): string[] {
  const slug1 = slugify(title);
  // Variant 2: without leading articles
  const noLead = title.replace(/^(le |la |les |l'|un |une |des |du )/i, '');
  const slug2 = slugify(noLead);
  // Variant 3: keep only first 60 chars
  const short = slug1.slice(0, 60).replace(/-+[^-]*$/, '');
  // Variant 4: replace some stopwords
  const compact = slugify(title.replace(/\b(pour|avec|dans|sur|que|qui|les|des|une|et|du|de|la|le|en|un)\b/gi, ''));

  const set = new Set([slug1, slug2, short, compact]);
  set.delete('');
  return Array.from(set);
}

async function fetchRssTitlesByNumber(): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  const feeds = [
    'https://feed.audiomeans.fr/feed/la-martingale-010afa69a4c1.xml',
    'https://feed.audiomeans.fr/feed/allo-la-martingale-5d56dcf7.xml',
  ];
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text', cdataPropName: '#cdata' });
  for (const url of feeds) {
    try {
      const xml = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();
      const data = parser.parse(xml);
      const items = data?.rss?.channel?.item;
      const arr = Array.isArray(items) ? items : [items];
      for (const it of arr) {
        const title = firstString(it.title) || '';
        const n = extractNumFromTitle(title);
        if (n != null && !result.has(n)) result.set(n, title);
      }
    } catch (e) {
      console.error('rss fail:', url, e);
    }
  }
  return result;
}

async function headOK(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, method: 'HEAD' });
    return res.ok;
  } catch { return false; }
}

async function fetchEpisodePage(slug: string): Promise<{ title: string | null; date: string | null; abstract: string | null } | null> {
  try {
    const res = await fetch(`${BASE}/tous/${slug}/`, { headers: { 'User-Agent': UA } });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);
    let data: any = { title: null, date: null, abstract: null };
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const ld = JSON.parse($(el).html() || '{}');
        const entries = Array.isArray(ld) ? ld : [ld];
        for (const item of entries) {
          if (item['@type'] === 'PodcastEpisode') {
            if (item.name) data.title = String(item.name);
            if (item.dateCreated) data.date = String(item.dateCreated);
            if (item.abstract) data.abstract = String(item.abstract);
          }
        }
      } catch {}
    });
    // Fallback on og:title / h1
    if (!data.title) {
      data.title = $('meta[property="og:title"]').attr('content') || $('h1').first().text().trim() || null;
    }
    return data;
  } catch { return null; }
}

async function main() {
  console.log('[FIX-V2] 1. Fetching RSS for real titles');
  const rssTitles = await fetchRssTitlesByNumber();
  console.log(`  RSS items numbered: ${rssTitles.size}`);

  const missing = await sql`
    SELECT id, episode_number, title
    FROM episodes
    WHERE (slug IS NULL OR slug = '' OR slug = ' ')
    ORDER BY episode_number
  ` as { id: number; episode_number: number; title: string }[];
  console.log(`  BDD episodes missing slug: ${missing.length}\n`);

  const matches: Array<{ ep: typeof missing[0]; rssTitle: string; realTitle: string | null; slug: string; date: string | null; abstract: string | null }> = [];
  const unmatched: Array<{ ep: typeof missing[0]; rssTitle: string; triedSlugs: string[] }> = [];

  for (let i = 0; i < missing.length; i++) {
    const ep = missing[i];
    const rssTitle = rssTitles.get(ep.episode_number);
    process.stdout.write(`  [${i + 1}/${missing.length}] #${ep.episode_number} `);
    if (!rssTitle) {
      console.log(`no RSS entry — skip`);
      unmatched.push({ ep, rssTitle: '', triedSlugs: [] });
      continue;
    }
    const cleaned = cleanTitle(rssTitle);
    const variants = slugVariants(cleaned);
    console.log(`"${cleaned.slice(0, 60)}..."`);

    let found: string | null = null;
    for (const v of variants) {
      const url = `${BASE}/tous/${v}/`;
      const ok = await headOK(url);
      process.stdout.write(`      ${ok ? '✅' : '❌'} ${v}\n`);
      if (ok) { found = v; break; }
      await sleep(300);
    }

    if (found) {
      const page = await fetchEpisodePage(found);
      matches.push({ ep, rssTitle, realTitle: page?.title ?? cleaned, slug: found, date: page?.date ?? null, abstract: page?.abstract ?? null });
    } else {
      unmatched.push({ ep, rssTitle: cleaned, triedSlugs: variants });
    }
    await sleep(DELAY);
  }

  console.log(`\n[FIX-V2] 2. Matches found: ${matches.length}/${missing.length}`);
  if (matches.length === 0) {
    console.log('\n  Unmatched details:');
    for (const u of unmatched) {
      console.log(`  #${u.ep.episode_number} "${u.rssTitle}" — tried: ${u.triedSlugs.join(', ')}`);
    }
    return;
  }

  console.log('\n[FIX-V2] 3. Updating BDD');
  for (const m of matches) {
    const articleUrl = `${BASE}/tous/${m.slug}/`;
    await sql`
      UPDATE episodes
      SET slug = ${m.slug},
          title = COALESCE(NULLIF(${m.realTitle}, ''), title),
          article_url = ${articleUrl},
          url = ${articleUrl},
          abstract = COALESCE(NULLIF(${m.abstract}, ''), abstract),
          date_created = COALESCE(${m.date ? new Date(m.date).toISOString() : null}::timestamp, date_created)
      WHERE id = ${m.ep.id}
    `;
    console.log(`  #${m.ep.episode_number}: slug=${m.slug} title="${m.realTitle?.slice(0, 60)}..."`);
  }

  if (unmatched.length > 0) {
    console.log(`\n[FIX-V2] ⚠️  Still unmatched: ${unmatched.length}`);
    for (const u of unmatched) {
      console.log(`  #${u.ep.episode_number} "${u.rssTitle}"`);
    }
  }
  console.log('\n  Next: scrape-deep.ts, embeddings.ts --force, similarity.ts');
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
