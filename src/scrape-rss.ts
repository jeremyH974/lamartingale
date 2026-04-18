/**
 * RSS Scraper — flux Audiomeans La Martingale / Allô la Martingale
 *
 * Extrait pour chaque item :
 *   - title, itunes:episode (number)
 *   - itunes:duration → duration_seconds
 *   - description / content:encoded → rss_description
 *
 * Match avec episodes en BDD par (episode_number) d'abord, puis fuzzy title.
 *
 * Usage : npx tsx src/scrape-rss.ts
 */
import 'dotenv/config';
import { XMLParser } from 'fast-xml-parser';
import { neon } from '@neondatabase/serverless';
import { getConfig } from './config';

const sql = neon(process.env.DATABASE_URL!);
const cfg = getConfig();
const TENANT = cfg.database.tenantId;

const FEEDS: { name: string; url: string }[] = [
  { name: cfg.name, url: cfg.rssFeeds.main },
  ...(cfg.rssFeeds.secondary ? [{ name: `${cfg.name} (secondary)`, url: cfg.rssFeeds.secondary }] : []),
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parseDuration(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  // Formats : "HH:MM:SS", "MM:SS", "1234" (secondes brutes)
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const parts = s.split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

function normalizeTitle(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function firstString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (v == null) continue;
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
    if (typeof v === 'object') {
      const obj = v as any;
      if (typeof obj['#cdata'] === 'string' && obj['#cdata'].trim()) return obj['#cdata'].trim();
      if (typeof obj['#text'] === 'string' && obj['#text'].trim()) return obj['#text'].trim();
      if (typeof obj['#text'] === 'number') return String(obj['#text']);
    }
  }
  return null;
}

interface RssItem {
  title: string;
  episodeNumber: number | null;
  durationSeconds: number | null;
  description: string | null;
}

async function fetchFeed(url: string): Promise<RssItem[]> {
  const res = await fetch(url, { headers: { 'User-Agent': cfg.scraping.userAgent } });
  if (!res.ok) throw new Error(`Feed ${url} → HTTP ${res.status}`);
  const xml = await res.text();

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    cdataPropName: '#cdata',
  });
  const data = parser.parse(xml);
  const items = data?.rss?.channel?.item;
  if (!items) return [];
  const arr = Array.isArray(items) ? items : [items];

  return arr.map((it: any): RssItem => {
    const title = firstString(it.title) || '';

    // Episode number: itunes:episode first, else parse "#NNN" prefix from title
    let episodeNumber: number | null = null;
    const episodeRaw = firstString(it['itunes:episode']);
    if (episodeRaw) episodeNumber = parseInt(episodeRaw, 10) || null;
    if (episodeNumber == null) {
      const m = title.match(/^#?\s*(\d+)\s*[-–]/);
      if (m) episodeNumber = parseInt(m[1], 10);
    }

    const durationSeconds = parseDuration(firstString(it['itunes:duration']));
    const description =
      firstString(it['content:encoded'], it.description, it['itunes:summary']) || null;

    return { title, episodeNumber, durationSeconds, description };
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('[RSS-SCRAPE] start');

  const allItems: (RssItem & { source: string })[] = [];
  for (const feed of FEEDS) {
    try {
      const items = await fetchFeed(feed.url);
      console.log(`  [feed] ${feed.name}: ${items.length} items`);
      for (const it of items) allItems.push({ ...it, source: feed.name });
    } catch (e: any) {
      console.warn(`  [feed] ${feed.name}: FAIL ${e?.message}`);
    }
  }
  console.log(`  total items: ${allItems.length}`);

  // Charger les épisodes BDD du tenant actif pour matcher
  const episodes = (await sql`
    SELECT id, episode_number, title FROM episodes WHERE tenant_id = ${TENANT}
  `) as { id: number; episode_number: number | null; title: string }[];

  const byNumber = new Map<number, typeof episodes[0]>();
  const byTitle = new Map<string, typeof episodes[0]>();
  for (const e of episodes) {
    if (e.episode_number != null) byNumber.set(e.episode_number, e);
    byTitle.set(normalizeTitle(e.title), e);
  }

  let matched = 0;
  let updated = 0;
  let unmatched = 0;
  const durations: number[] = [];

  for (const item of allItems) {
    let dbRow: typeof episodes[0] | undefined;
    if (item.episodeNumber != null) dbRow = byNumber.get(item.episodeNumber);
    if (!dbRow && item.title) dbRow = byTitle.get(normalizeTitle(item.title));

    if (!dbRow) { unmatched++; continue; }
    matched++;

    const dur = item.durationSeconds;
    const desc = item.description;
    if (dur == null && !desc) continue;

    await sql`
      UPDATE episodes
      SET duration_seconds = COALESCE(${dur}, duration_seconds),
          rss_description  = COALESCE(${desc}, rss_description)
      WHERE id = ${dbRow.id}
    `;
    updated++;
    if (dur != null) durations.push(dur);
  }

  // Stats durée
  const durMin = durations.length ? Math.min(...durations) : 0;
  const durMax = durations.length ? Math.max(...durations) : 0;
  const durAvg = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

  console.log('\n[RSS-SCRAPE] complete');
  console.log(`  Matched   : ${matched}/${allItems.length}`);
  console.log(`  Updated   : ${updated}`);
  console.log(`  Unmatched : ${unmatched}`);
  if (durations.length) {
    console.log(`  Duration  : ${Math.round(durMin / 60)}min — ${Math.round(durMax / 60)}min (avg: ${Math.round(durAvg / 60)}min)`);
  }
}

main().catch((e) => {
  console.error('[RSS-SCRAPE] fatal', e);
  process.exit(1);
});
