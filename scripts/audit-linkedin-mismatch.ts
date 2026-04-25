import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL!);

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

(async () => {
  const rows = (await sql`
    SELECT tenant_id, name, linkedin_url
    FROM guests
    WHERE linkedin_url IS NOT NULL
      AND linkedin_url <> ''
      AND linkedin_url ~ 'linkedin\\.com/in/'
  `) as any[];

  const tenants: Record<string, { total: number; mismatch: number; samples: any[] }> = {};

  for (const r of rows) {
    const t = r.tenant_id;
    if (!tenants[t]) tenants[t] = { total: 0, mismatch: 0, samples: [] };
    tenants[t].total++;

    const slugMatch = r.linkedin_url.match(/\/in\/([^/?#]+)/i);
    if (!slugMatch) continue;
    const slug = normalize(slugMatch[1]);
    const nameNorm = normalize(r.name);

    const tokens = r.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .split(/[\s\-']+/)
      .filter((t: string) => t.length >= 3)
      .map((t: string) => normalize(t));

    const slugContainsAnyToken = tokens.some((tok: string) => slug.includes(tok));
    const slugIsHash = /^[a-z0-9]{10,}$/.test(slug) && !slugContainsAnyToken;

    if (!slugContainsAnyToken && !slugIsHash) {
      tenants[t].mismatch++;
      if (tenants[t].samples.length < 8) {
        tenants[t].samples.push({ name: r.name, slug: slugMatch[1], linkedin: r.linkedin_url });
      }
    } else if (slugIsHash) {
      tenants[t].mismatch++;
      if (tenants[t].samples.length < 8) {
        tenants[t].samples.push({ name: r.name, slug: slugMatch[1], linkedin: r.linkedin_url, note: 'hash-slug' });
      }
    }
  }

  console.log('\n=== LinkedIn mismatch par tenant ===\n');
  for (const [t, s] of Object.entries(tenants).sort()) {
    const pct = ((100 * s.mismatch) / s.total).toFixed(1);
    console.log(`${t.padEnd(20)} : ${s.mismatch}/${s.total} mismatch (${pct}%)`);
  }

  console.log('\n=== Samples LM ===\n');
  for (const s of tenants['lamartingale']?.samples || []) {
    console.log(`  ${s.name.padEnd(35)} → ${s.slug} ${s.note || ''}`);
  }

  console.log('\n=== Samples GDIY ===\n');
  for (const s of tenants['gdiy']?.samples || []) {
    console.log(`  ${s.name.padEnd(35)} → ${s.slug} ${s.note || ''}`);
  }

  console.log('\n=== Samples Le Panier ===\n');
  for (const s of tenants['lepanier']?.samples || []) {
    console.log(`  ${s.name.padEnd(35)} → ${s.slug} ${s.note || ''}`);
  }
})();
