import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import { XMLParser } from 'fast-xml-parser';
import { extractItem } from '../src/rss/extractors';

const sql = neon(process.env.DATABASE_URL!);

(async () => {
  const xmlPath = 'data/tmp/gdiy.xml';
  if (!fs.existsSync(xmlPath)) { console.log('no gdiy.xml — skip RSS re-parse'); return; }
  const xml = fs.readFileSync(xmlPath, 'utf-8');
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', allowBooleanAttributes: true, trimValues: true, cdataPropName: false, processEntities: true });
  const doc = parser.parse(xml);
  const items = Array.isArray(doc.rss?.channel?.item) ? doc.rss.channel.item : (doc.rss?.channel?.item ? [doc.rss.channel.item] : []);
  console.log(`RSS items parsed: ${items.length}`);

  const byNumType = new Map<string, { type: string|null; title: string; dur: number|null }[]>();
  let withEpisodeNum = 0;
  for (const it of items) {
    const e = extractItem(it);
    if (e.episodeNumber == null) continue;
    withEpisodeNum++;
    const key = String(e.episodeNumber);
    if (!byNumType.has(key)) byNumType.set(key, []);
    byNumType.get(key)!.push({ type: e.episodeType, title: e.title, dur: e.durationSeconds });
  }
  console.log(`with episode_number: ${withEpisodeNum}`);

  // Find collisions (multiple items for same episode_number)
  let collisions = 0;
  let hasFullAndBonus = 0;
  for (const [num, arr] of byNumType) {
    if (arr.length > 1) {
      collisions++;
      const types = arr.map(x => x.type).join('+');
      if (types.includes('full') && (types.includes('bonus') || types.includes('trailer'))) {
        hasFullAndBonus++;
      }
    }
  }
  console.log(`\nepisode_number collisions: ${collisions}`);
  console.log(`of which full+bonus: ${hasFullAndBonus}`);

  // Sample collisions involving #535
  const target = byNumType.get('535');
  if (target) {
    console.log(`\n#535 items in RSS (${target.length}):`);
    for (const x of target) console.log(`  [${x.type}] dur=${x.dur}s | ${x.title.slice(0, 110)}`);
  }
})();
