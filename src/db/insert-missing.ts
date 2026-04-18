/**
 * Insert missing episodes #313, #224, #264 detected via RSS scanning.
 *
 * #313 has a slug on lamartingale.io → full deep scrape follows.
 * #224 and #264 : RSS-only (no article page found on listing), inserted
 *                 with minimum info (title, episode_number, pillar default).
 *
 * After insertion, re-run scrape-rss.ts to populate duration/rss_description,
 * and scrape-deep.ts --episode for #313 to populate article_content etc.
 */
import 'dotenv/config';
import { XMLParser } from 'fast-xml-parser';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

function firstString(...vals: any[]): string | null {
  for (const v of vals) {
    if (v == null) continue;
    if (typeof v === 'string') { const t = v.trim(); if (t) return t; continue; }
    if (typeof v === 'number') return String(v);
    if (typeof v === 'object') {
      if (typeof v['#cdata'] === 'string') { const t = v['#cdata'].trim(); if (t) return t; continue; }
      if (typeof v['#text'] === 'string') { const t = v['#text'].trim(); if (t) return t; continue; }
    }
  }
  return null;
}

function extractEpisodeNumber(title: string): number | null {
  const m = title.match(/^#?\s*(\d+)\s*[-–]/);
  return m ? parseInt(m[1], 10) : null;
}

function cleanTitle(rawTitle: string): string {
  // "#313 - Comment payer moins d'impôts ?- Nahima Zobri" → "Comment payer moins d'impôts ?"
  let t = rawTitle.replace(/^#?\s*\d+\s*[-–]\s*/, '');
  // Strip trailing " - Guest Name" if present
  t = t.replace(/\s*[-–]\s*[^-]+$/, '').trim();
  return t || rawTitle;
}

function extractGuest(rawTitle: string): string | null {
  const m = rawTitle.match(/[-–]\s*([^-–]+)\s*$/);
  return m ? m[1].trim() : null;
}

interface MissingEp {
  episode_number: number;
  raw_title: string;
  title: string;
  guest: string | null;
  pub_date: string | null;
  rss_description: string | null;
  duration_seconds: number | null;
  slug: string | null;
}

const parseDuration = (s: string | null): number | null => {
  if (!s) return null;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const parts = s.split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
};

async function fetchRssItems() {
  const feeds = [
    'https://feed.audiomeans.fr/feed/la-martingale-010afa69a4c1.xml',
    'https://feed.audiomeans.fr/feed/allo-la-martingale-5d56dcf7.xml',
  ];
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text', cdataPropName: '#cdata' });
  const all: any[] = [];
  for (const url of feeds) {
    const xml = await (await fetch(url)).text();
    const data = parser.parse(xml);
    const items = data?.rss?.channel?.item;
    const arr = Array.isArray(items) ? items : [items];
    all.push(...arr);
  }
  return all;
}

async function main() {
  const TARGET: Array<{ num: number; slug?: string }> = [
    { num: 313, slug: 'comment-payer-moins-dimpots-sur-le-revenu-en-2026' },
    { num: 224 },
    { num: 264 },
  ];

  // Double-check none exist yet
  const existing = await sql`
    SELECT episode_number FROM episodes
    WHERE episode_number = ANY(${TARGET.map((t) => t.num)}::int[])
  `;
  const existingNums = new Set(existing.map((e: any) => e.episode_number));

  const items = await fetchRssItems();
  const rssByNumber = new Map<number, any>();
  for (const it of items) {
    const title = firstString(it.title) || '';
    const n = extractEpisodeNumber(title);
    if (n && TARGET.some((t) => t.num === n) && !rssByNumber.has(n)) {
      rssByNumber.set(n, it);
    }
  }

  const toInsert: MissingEp[] = [];
  for (const t of TARGET) {
    if (existingNums.has(t.num)) {
      console.log(`#${t.num}: already in BDD, skip`);
      continue;
    }
    const it = rssByNumber.get(t.num);
    if (!it) {
      console.log(`#${t.num}: not found in RSS, skip`);
      continue;
    }
    const rawTitle = firstString(it.title) || '';
    const desc = firstString(it['content:encoded'], it.description, it['itunes:summary']);
    const dur = parseDuration(firstString(it['itunes:duration']));
    const pubDate = firstString(it.pubDate);
    toInsert.push({
      episode_number: t.num,
      raw_title: rawTitle,
      title: cleanTitle(rawTitle),
      guest: extractGuest(rawTitle),
      pub_date: pubDate,
      rss_description: desc,
      duration_seconds: dur,
      slug: t.slug ?? null,
    });
  }

  console.log('\n=== Plan ===');
  for (const ep of toInsert) {
    console.log(`#${ep.episode_number}  title="${ep.title}"  guest=${ep.guest}  slug=${ep.slug ?? '(none)'}  dur=${ep.duration_seconds}s`);
  }

  for (const ep of toInsert) {
    const dateCreated = ep.pub_date ? new Date(ep.pub_date).toISOString() : null;
    const articleUrl = ep.slug ? `https://lamartingale.io/tous/${ep.slug}/` : null;
    const url = articleUrl;

    const res = await sql`
      INSERT INTO episodes (
        episode_number, title, slug, guest, pillar,
        abstract, article_url, url, date_created,
        rss_description, duration_seconds
      )
      VALUES (
        ${ep.episode_number}, ${ep.title}, ${ep.slug}, ${ep.guest}, ${'Placements'},
        ${ep.rss_description ? ep.rss_description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 500) : null},
        ${articleUrl}, ${url}, ${dateCreated},
        ${ep.rss_description}, ${ep.duration_seconds}
      )
      ON CONFLICT (episode_number) DO NOTHING
      RETURNING id
    `;
    if ((res as any[]).length) {
      const id = (res as any[])[0].id;
      // Also create enrichment row so embeddings pipeline finds it
      await sql`
        INSERT INTO episodes_enrichment (episode_id, tags, sub_themes, search_text)
        VALUES (${id}, '{}'::text[], '{}'::text[], ${ep.title})
        ON CONFLICT DO NOTHING
      `;
      console.log(`#${ep.episode_number}: inserted as id=${id}`);
    } else {
      console.log(`#${ep.episode_number}: already existed (race)`);
    }
  }

  console.log('\nDone. Next: run scrape-deep.ts (for #313) and scrape-rss.ts.');
}

main().catch((e) => { console.error(e); process.exit(1); });
