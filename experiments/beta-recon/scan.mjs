// Scanner RSS public — recherche mentions beta.lamartingale.io / code / invitation
// Usage: node scan.mjs
import fs from 'node:fs';
import path from 'node:path';

const FEEDS_DIR = path.join(process.cwd(), 'feeds');
const N_RECENT = 30;

const FEEDS = [
  { tenant: 'lamartingale', file: 'lamartingale.xml' },
  { tenant: 'allolamartingale', file: 'allolamartingale.xml' },
  { tenant: 'lepanier', file: 'lepanier.xml' },
  { tenant: 'finscale', file: 'finscale.xml' },
  { tenant: 'passionpatrimoine', file: 'passionpatrimoine.xml' },
  { tenant: 'combiencagagne', file: 'combiencagagne.xml' },
];

// Patterns recherchés (insensibles à la casse, sur description+title décodés)
const PATTERNS = [
  { key: 'beta.lamartingale', re: /beta\.lamartingale\.io/gi },
  { key: 'beta-lamartingale-domain', re: /lamartingale\.io\/beta/gi },
  { key: 'beta-keyword', re: /\bbeta\b/gi },
  { key: 'invitation', re: /\binvitation/gi },
  { key: 'early access', re: /early[\s-]?access/gi },
  { key: 'waitlist', re: /\bwaitlist|liste d.attente/gi },
  { key: 'preview', re: /\bpreview\b/gi },
  { key: 'access code', re: /code d.acc[eè]s|access code|acc[eè]s anticip/gi },
  { key: 'early bird', re: /early[\s-]?bird/gi },
  { key: 'lamartingale.io', re: /lamartingale\.io/gi },
  { key: 'newsletter', re: /\bnewsletter\b/gi },
  { key: 'orso AI / IA', re: /\borso[^a-z]*(ai|ia)\b/gi },
  { key: 'assistant ia', re: /assistant\s+(ia|ai)/gi },
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

function extractItems(xml) {
  const items = [];
  const re = /<item\b[\s\S]*?<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const block = m[0];
    const title = (block.match(/<title>([\s\S]*?)<\/title>/) || [, ''])[1];
    const desc =
      (block.match(/<itunes:summary>([\s\S]*?)<\/itunes:summary>/) ||
        block.match(/<description>([\s\S]*?)<\/description>/) ||
        block.match(/<content:encoded>([\s\S]*?)<\/content:encoded>/) ||
        [, ''])[1];
    const longerDesc = (block.match(/<content:encoded>([\s\S]*?)<\/content:encoded>/) || [, ''])[1];
    const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [, ''])[1].trim();
    const link = (block.match(/<link>([\s\S]*?)<\/link>/) || [, ''])[1].trim();
    items.push({
      title: decodeEntities(title),
      description: decodeEntities(desc + ' ' + longerDesc),
      pubDate: pubDate,
      pubDateMs: Date.parse(pubDate) || 0,
      link: link,
    });
  }
  items.sort((a, b) => b.pubDateMs - a.pubDateMs);
  return items;
}

const report = { tenants: {}, hits: [] };

for (const { tenant, file } of FEEDS) {
  const fp = path.join(FEEDS_DIR, file);
  if (!fs.existsSync(fp) || fs.statSync(fp).size < 100) {
    report.tenants[tenant] = { error: 'feed unavailable', file };
    continue;
  }
  const xml = fs.readFileSync(fp, 'utf8');
  const items = extractItems(xml).slice(0, N_RECENT);
  const summary = items.map((it) => {
    const haystack = (it.title + '\n' + it.description).toLowerCase();
    const matched = [];
    for (const { key, re } of PATTERNS) {
      const found = (it.title + ' ' + it.description).match(re);
      if (found) {
        matched.push({ key, snippets: [...new Set(found.map((s) => s.toLowerCase()))] });
        // Extract context around first match
        const idx = haystack.search(re);
        if (idx >= 0) {
          const ctx = haystack.slice(Math.max(0, idx - 80), Math.min(haystack.length, idx + 200));
          report.hits.push({ tenant, title: it.title, pubDate: it.pubDate, pattern: key, context: ctx });
        }
      }
    }
    return {
      title: it.title.slice(0, 110),
      pubDate: it.pubDate,
      link: it.link,
      matched: matched.length ? matched : null,
    };
  });
  report.tenants[tenant] = {
    feed: file,
    totalItemsInFeed: extractItems(xml).length,
    scanned: items.length,
    items: summary,
  };
}

fs.writeFileSync(
  path.join(process.cwd(), 'scan-result.json'),
  JSON.stringify(report, null, 2)
);

console.log('=== HIT SUMMARY ===');
for (const h of report.hits) {
  console.log(`[${h.tenant}] ${h.pubDate} — ${h.pattern} — ${h.title.slice(0, 80)}`);
  console.log(`   ctx: ...${h.context.replace(/\s+/g, ' ').slice(0, 220)}...`);
}
console.log('\n=== TOTAL HITS ===', report.hits.length);
