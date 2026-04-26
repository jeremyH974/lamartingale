// Sonde cross-corpus thématique pour livrables 4-5
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });

import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

// 1) Sample title-based queries by theme (text-based fast scan first)
const themes = {
  creators: [
    '%youtub%', '%youtubeur%', '%vidéaste%', '%streamer%', '%influenceur%',
    '%créateur de contenu%', '%hugodécrypte%', '%hugo travers%', '%norman%',
    '%cyprien%', '%squeezie%', '%mcfly%', '%mister v%', '%amixem%',
    '%michou%', '%tibo inshape%', '%lebouseuh%', '%joyca%',
  ],
  expedition_outdoor: [
    '%everest%', '%alpinisme%', '%aventure%', '%expédition%', '%montagne%',
    '%explorateur%', '%mike horn%', '%matthieu blanchard%',
  ],
  discipline_methode: [
    '%kaizen%', '%discipline%', '%routine%', '%habitudes%', '%minimalism%',
  ],
  creator_economy_money: [
    '%monétis%', '%abonnement%', '%creator%', '%audience%', '%média%',
  ],
};

const results = {};
for (const [theme, patterns] of Object.entries(themes)) {
  const rows = [];
  for (const p of patterns) {
    const r = await sql`
      SELECT tenant_id, episode_number, title, date_created
      FROM episodes
      WHERE LOWER(title) LIKE ${p}
        AND id != 2017
      ORDER BY date_created DESC
      LIMIT 5
    `;
    for (const row of r) rows.push(row);
  }
  // dedup
  const seen = new Set();
  const dedup = rows.filter(r => {
    const k = `${r.tenant_id}:${r.episode_number}:${r.title}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
  results[theme] = dedup.slice(0, 25);
  console.log(`\n=== ${theme} (${dedup.length} hits) ===`);
  for (const r of dedup.slice(0, 12)) {
    console.log(`  [${r.tenant_id}#${r.episode_number ?? '-'}] ${r.title?.slice(0,90)} (${r.date_created?.toISOString?.().slice(0,10) ?? r.date_created})`);
  }
}

fs.writeFileSync(path.join(__dirname, '_cross-corpus-titles.json'), JSON.stringify(results, null, 2));
console.log('\nsaved _cross-corpus-titles.json');

// 2) pgvector ANN: get top-50 nearest episodes to Inoxtag's embedding (excluding self)
console.log('\n=== pgvector ANN top-50 nearest to Inoxtag (id=2017) ===');
const ann = await sql`
  WITH src AS (SELECT embedding FROM episode_embeddings WHERE episode_id = 2017 LIMIT 1)
  SELECT e.id, e.tenant_id, e.episode_number, e.title, e.date_created,
         (ee.embedding <=> (SELECT embedding FROM src)) AS distance
  FROM episode_embeddings ee
  JOIN episodes e ON e.id = ee.episode_id
  WHERE e.id != 2017 AND (SELECT embedding FROM src) IS NOT NULL
  ORDER BY ee.embedding <=> (SELECT embedding FROM src) ASC
  LIMIT 50
`;
console.log(`got ${ann.length} neighbors`);
for (const r of ann.slice(0, 25)) {
  console.log(`  d=${(+r.distance).toFixed(4)} [${r.tenant_id}#${r.episode_number ?? '-'}] ${r.title?.slice(0,80)}`);
}
fs.writeFileSync(path.join(__dirname, '_cross-corpus-ann.json'), JSON.stringify(ann.map(r => ({...r, distance: +r.distance})), null, 2));
console.log('saved _cross-corpus-ann.json');

// 3) tenant breakdown of top-50
const byTenant = {};
for (const r of ann) byTenant[r.tenant_id] = (byTenant[r.tenant_id]||0) + 1;
console.log('\ntop-50 ANN tenant breakdown:', byTenant);
