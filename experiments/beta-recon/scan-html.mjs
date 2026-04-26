import fs from 'node:fs';

function clean(s) {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

const files = ['feeds/lamartingale-home.html', 'feeds/linktree-lamartingale.html'];

for (const f of files) {
  if (!fs.existsSync(f)) continue;
  const html = fs.readFileSync(f, 'utf8');
  const text = clean(html);
  console.log('===', f, '— raw', html.length, 'bytes, text', text.length);
  const links = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]);
  const interesting = links.filter((l) =>
    /beta|invitation|early|waitlist|preview|signup|inscription|newsletter|formulaire|access/i.test(l)
  );
  console.log('  Interesting links:');
  for (const l of [...new Set(interesting)]) console.log('   -', l);

  // First 5 occurrences of "beta" with context
  const lower = text.toLowerCase();
  let idx = 0,
    count = 0;
  while ((idx = lower.indexOf('beta', idx)) >= 0 && count < 8) {
    console.log(`  beta ctx #${count + 1}:`, text.slice(Math.max(0, idx - 120), idx + 260));
    idx += 4;
    count++;
  }

  // Look for "code", "invitation", "inscription", "newsletter"
  for (const kw of ['invitation', 'newsletter', 'inscription', 'early access', 'waitlist', 'beta.lamartingale']) {
    const i = lower.indexOf(kw);
    if (i >= 0) {
      console.log(`  "${kw}" ctx:`, text.slice(Math.max(0, i - 100), i + 240));
    }
  }
  console.log();
}
