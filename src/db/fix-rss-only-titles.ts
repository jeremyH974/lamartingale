/**
 * Pour les épisodes encore sans slug (RSS-only), remplace le titre LLM
 * fantaisie par le vrai titre depuis le RSS, ainsi que la date/abstract
 * si dispo dans description.
 */
import 'dotenv/config';
import { XMLParser } from 'fast-xml-parser';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

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

function cleanTitle(raw: string): string {
  let t = raw.replace(/^#?\s*\d+\s*[-–]\s*/, '');
  const parts = t.split(/\s+[-–]\s+/);
  if (parts.length > 1) {
    const last = parts[parts.length - 1].trim();
    if (last.length < 50 && !last.includes('?') && !last.includes('!')) {
      t = parts.slice(0, -1).join(' - ');
    }
  }
  return t.trim();
}

function extractNum(t: string): number | null {
  const m = t.match(/^#?\s*(\d+)\s*[-–]/);
  return m ? parseInt(m[1], 10) : null;
}

function parseDuration(s: string | null): number | null {
  if (!s) return null;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const parts = s.split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

(async () => {
  console.log('[FIX-TITLES] Loading RSS');
  const feeds = [
    'https://feed.audiomeans.fr/feed/la-martingale-010afa69a4c1.xml',
    'https://feed.audiomeans.fr/feed/allo-la-martingale-5d56dcf7.xml',
  ];
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text', cdataPropName: '#cdata' });
  const byNum = new Map<number, any>();
  for (const url of feeds) {
    const xml = await (await fetch(url)).text();
    const d = parser.parse(xml);
    const items = d?.rss?.channel?.item;
    for (const it of Array.isArray(items) ? items : [items]) {
      const n = extractNum(firstString(it.title) || '');
      if (n != null && !byNum.has(n)) byNum.set(n, it);
    }
  }

  const missing = await sql`
    SELECT id, episode_number, title
    FROM episodes
    WHERE (slug IS NULL OR slug = '' OR slug = ' ')
    ORDER BY episode_number
  ` as { id: number; episode_number: number; title: string }[];
  console.log(`Still missing: ${missing.length}`);

  let updated = 0;
  for (const ep of missing) {
    const rss = byNum.get(ep.episode_number);
    if (!rss) { console.log(`  #${ep.episode_number}: no RSS match — skip`); continue; }
    const rawTitle = firstString(rss.title) || '';
    const realTitle = cleanTitle(rawTitle);
    const desc = firstString(rss['content:encoded'], rss.description, rss['itunes:summary']);
    const pubDate = firstString(rss.pubDate);
    const dur = parseDuration(firstString(rss['itunes:duration']));
    const abstractText = desc ? desc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500) : null;

    await sql`
      UPDATE episodes
      SET title = ${realTitle},
          abstract = COALESCE(NULLIF(${abstractText}, ''), abstract),
          rss_description = COALESCE(${desc}, rss_description),
          duration_seconds = COALESCE(${dur}, duration_seconds),
          date_created = COALESCE(${pubDate ? new Date(pubDate).toISOString() : null}::timestamp, date_created)
      WHERE id = ${ep.id}
    `;
    console.log(`  #${ep.episode_number}: "${ep.title}" → "${realTitle}"`);
    updated++;
  }
  console.log(`\n✅ Updated ${updated}/${missing.length}`);
})();
