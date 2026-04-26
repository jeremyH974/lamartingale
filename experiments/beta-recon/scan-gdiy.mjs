import fs from 'node:fs';

const html = fs.readFileSync('feeds/gdiy-home.html', 'utf8');
const text = html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ');
const lower = text.toLowerCase();
const links = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]);

console.log('gdiy.fr text length:', text.length);
console.log(
  'Beta-related links:',
  links.filter((l) => /beta|invitation|early|waitlist|preview|lamartingale/i.test(l))
);

const eps = [...new Set(links.filter((l) => /\/business\/|\/podcast\/|\/episode/i.test(l)))].slice(0, 50);
console.log('\nEpisode-like links:');
for (const l of eps) console.log(' -', l);

let i = 0,
  c = 0;
while ((i = lower.indexOf('beta', i)) >= 0 && c < 5) {
  console.log('  beta ctx:', text.slice(Math.max(0, i - 80), i + 200));
  i += 4;
  c++;
}
