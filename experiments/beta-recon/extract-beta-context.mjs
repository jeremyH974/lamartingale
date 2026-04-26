// Extrait le contexte large autour de chaque mention beta.lamartingale.io
import fs from 'node:fs';
import path from 'node:path';

const FEEDS_DIR = path.join(process.cwd(), 'feeds');
const FEEDS = [
  'lamartingale.xml',
  'allolamartingale.xml',
  'lepanier.xml',
  'finscale.xml',
  'passionpatrimoine.xml',
  'combiencagagne.xml',
];

function decodeEntities(s) {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PATTERNS = [
  /beta\.lamartingale\.io/gi,
  /code\s+(d['’]?\s*)?(?:acc[èe]s|invitation|early|beta|inscrip|prom[oô]|partenaire)/gi,
  /\b[A-Z]{4,}[0-9]{0,4}\b/g, // ALL-CAPS codes type "STEFANI", "LAMART2026"
];

const allMentions = [];
let earliestBetaMention = null;

for (const file of FEEDS) {
  const fp = path.join(FEEDS_DIR, file);
  if (!fs.existsSync(fp) || fs.statSync(fp).size < 100) continue;
  const xml = fs.readFileSync(fp, 'utf8');
  const items = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/g)].map((m) => m[0]);

  for (const block of items) {
    const title = decodeEntities((block.match(/<title>([\s\S]*?)<\/title>/) || [, ''])[1]);
    const desc = decodeEntities(
      ((block.match(/<itunes:summary>([\s\S]*?)<\/itunes:summary>/) ||
        block.match(/<description>([\s\S]*?)<\/description>/) ||
        [, ''])[1]) +
        ' ' +
        ((block.match(/<content:encoded>([\s\S]*?)<\/content:encoded>/) || [, ''])[1])
    );
    const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [, ''])[1].trim();
    const haystack = title + '\n' + desc;

    if (/beta\.lamartingale\.io/i.test(haystack)) {
      const ms = Date.parse(pubDate) || 0;
      if (!earliestBetaMention || ms < earliestBetaMention.ms) {
        earliestBetaMention = { ms, pubDate, title, file };
      }
      // Extract 400-char window around the mention
      const idx = haystack.toLowerCase().indexOf('beta.lamartingale.io');
      const ctx = haystack.slice(Math.max(0, idx - 250), Math.min(haystack.length, idx + 350));
      allMentions.push({ file, pubDate, title, idx, ctx });
    }
  }
}

console.log('Total beta.lamartingale.io mentions:', allMentions.length);
console.log('Earliest mention:', earliestBetaMention);
console.log('\n=== Unique context windows ===\n');
const seen = new Set();
for (const m of allMentions) {
  const sig = m.ctx.replace(/\s+/g, ' ').slice(0, 200);
  if (seen.has(sig)) continue;
  seen.add(sig);
  console.log(`--- ${m.file} | ${m.pubDate} | ${m.title.slice(0, 80)}`);
  console.log(m.ctx.replace(/\s+/g, ' '));
  console.log();
}

// Also output count by feed
const byFeed = {};
for (const m of allMentions) byFeed[m.file] = (byFeed[m.file] || 0) + 1;
console.log('\nMentions by feed:', byFeed);

fs.writeFileSync(
  'beta-mentions.json',
  JSON.stringify({ earliest: earliestBetaMention, byFeed, total: allMentions.length, all: allMentions }, null, 2)
);
