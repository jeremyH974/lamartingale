/**
 * Mappe les 549 slugs gdiy.fr aux 537 episodes full de notre BDD GDIY.
 *
 * Strategie :
 *   1. Normalise chaque slug gdiy.fr (ex: "marwan-mery", "laurent-combalbert")
 *   2. Pour chaque episode, construit plusieurs candidats :
 *      - slugify(guest_from_title)
 *      - slugify(guest) si present
 *      - slugify(title sans "#N - ")
 *   3. Match exact, puis startsWith, puis contains.
 *   4. Ecrit `article_url` = https://www.gdiy.fr/podcast/{gdiy-slug}/ pour les matches.
 *
 * Usage :
 *   PODCAST_ID=gdiy npx tsx scripts/map-gdiy-slugs.ts           # dry
 *   PODCAST_ID=gdiy npx tsx scripts/map-gdiy-slugs.ts --write
 */
import 'dotenv/config';
import fs from 'fs';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);
const TENANT = 'gdiy';

function slugify(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

(async () => {
  const write = process.argv.includes('--write');
  const slugs = fs.readFileSync('C:\\Users\\jerem\\AppData\\Local\\Temp\\gdiy-slugs.txt', 'utf-8')
    .split('\n').map((s) => s.trim()).filter(Boolean);
  console.log(`Loaded ${slugs.length} slugs from sitemap`);

  const eps = (await sql`
    SELECT id, episode_number, title, guest, guest_from_title, slug AS audiomeans_slug, article_url, episode_type
    FROM episodes WHERE tenant_id = ${TENANT} AND (episode_type = 'full' OR episode_type IS NULL)
    ORDER BY episode_number DESC NULLS LAST, id DESC
  `) as any[];
  console.log(`Loaded ${eps.length} episodes from BDD`);

  // Build reverse index : possible slug candidates -> episode
  type Candidate = { kind: 'guest' | 'guest_title' | 'title'; ep: any; slug: string };
  const candidates: Candidate[] = [];
  for (const ep of eps) {
    if (ep.guest_from_title) candidates.push({ kind: 'guest_title', ep, slug: slugify(ep.guest_from_title) });
    if (ep.guest) candidates.push({ kind: 'guest', ep, slug: slugify(ep.guest) });
    // Title slugified from "# N - Guest - subject" → just guest part
    const cleaned = (ep.title || '').replace(/^(\[[^\]]+\]\s*-?\s*|#?\s*\d+\s*[-–]\s*)/i, '');
    const firstSegment = cleaned.split(/\s*[-–]\s*/)[0];
    if (firstSegment) candidates.push({ kind: 'title', ep, slug: slugify(firstSegment) });
    // Audiomeans slug often contains gdiy slug : "534-sixte-de-vauplane-animaj..."
    // → strip leading number + extract first 3-4 tokens as candidate
    if (ep.audiomeans_slug) {
      const stripped = ep.audiomeans_slug.replace(/^\d+-/, '').replace(/^hors-serie-[a-z0-9-]*?-/, '');
      const tokens = stripped.split('-');
      // Try 2, 3, 4 token prefixes (covers "marwan-mery", "sixte-de-vauplane", "anh-tho-chuong")
      for (const n of [2, 3, 4]) {
        const pref = tokens.slice(0, n).join('-');
        if (pref.length >= 4) candidates.push({ kind: 'title', ep, slug: pref });
      }
    }
  }

  // For each gdiy.fr slug, find best matching episode
  const matched = new Map<string, { ep: any; how: string; score: number }>();
  const usedEpisodeIds = new Set<number>();

  function tryMatch(gdiySlug: string, strategy: (c: Candidate) => boolean, label: string, score: number) {
    if (matched.has(gdiySlug)) return;
    for (const c of candidates) {
      if (usedEpisodeIds.has(c.ep.id)) continue;
      if (strategy(c)) {
        matched.set(gdiySlug, { ep: c.ep, how: `${label}/${c.kind}`, score });
        usedEpisodeIds.add(c.ep.id);
        return;
      }
    }
  }

  // Pass 0 : slug starts with episode number (ex: "124-julien-romanetto-...")
  const byNumber = new Map<number, any>();
  for (const ep of eps) if (typeof ep.episode_number === 'number') byNumber.set(ep.episode_number, ep);
  for (const s of slugs) {
    const m = s.match(/^(\d+)-/);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    const ep = byNumber.get(n);
    if (ep && !usedEpisodeIds.has(ep.id) && !matched.has(s)) {
      matched.set(s, { ep, how: 'number-prefix', score: 4 });
      usedEpisodeIds.add(ep.id);
    }
  }

  // Pass 1 : exact match
  for (const s of slugs) tryMatch(s, (c) => c.slug === s, 'exact', 3);
  // Pass 2 : slug starts with candidate (gdiy slug = "marwan-mery", candidate = "marwan-mery-negociateur")
  for (const s of slugs) tryMatch(s, (c) => c.slug.length > 3 && s.startsWith(c.slug), 'start-c-in-s', 2);
  // Pass 3 : candidate starts with slug (gdiy slug is shorter)
  for (const s of slugs) tryMatch(s, (c) => s.length > 3 && c.slug.startsWith(s), 'start-s-in-c', 2);
  // Pass 4 : contains (last resort, length>=5 to avoid junk)
  for (const s of slugs) tryMatch(s, (c) => s.length >= 6 && c.slug.length >= 6 && (c.slug.includes(s) || s.includes(c.slug)), 'contains', 1);

  const hit = matched.size;
  console.log(`\n=== Results ===`);
  console.log(`Matched: ${hit} / ${slugs.length} slugs → ${usedEpisodeIds.size} / ${eps.length} episodes`);

  const unmatchedSlugs = slugs.filter((s) => !matched.has(s));
  const unmatchedEps = eps.filter((e) => !usedEpisodeIds.has(e.id));
  console.log(`\nUnmatched slugs (${unmatchedSlugs.length}):`);
  for (const s of unmatchedSlugs.slice(0, 20)) console.log('  -', s);

  console.log(`\nUnmatched episodes (${unmatchedEps.length}):`);
  for (const e of unmatchedEps.slice(0, 20)) console.log(`  - #${e.episode_number} guest_title="${e.guest_from_title || ''}" title="${(e.title||'').slice(0, 80)}"`);

  console.log('\nSample matches:');
  let shown = 0;
  for (const [slug, m] of matched) {
    if (shown++ >= 5) break;
    console.log(`  "${slug}" <- #${m.ep.episode_number} [${m.how}] ${m.ep.guest_from_title || m.ep.title?.slice(0,60)}`);
  }

  if (!write) {
    console.log('\n(dry-run — use --write pour inscrire article_url en BDD)');
    return;
  }

  let updated = 0;
  for (const [slug, m] of matched) {
    const url = `https://www.gdiy.fr/podcast/${slug}/`;
    await sql`UPDATE episodes SET article_url = ${url} WHERE id = ${m.ep.id} AND tenant_id = ${TENANT}`;
    updated++;
  }
  console.log(`\nWrote article_url on ${updated} episodes.`);
})().catch((e) => { console.error(e); process.exit(1); });
