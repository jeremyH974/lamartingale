import * as fs from 'fs';
import { XMLParser } from 'fast-xml-parser';

const xml = fs.readFileSync('data/tmp/gdiy.xml', 'utf-8');
const parser = new XMLParser({ ignoreAttributes: false, cdataPropName: '__cdata' });
const doc = parser.parse(xml);
const items = doc.rss.channel.item as any[];

console.log(`Total items: ${items.length}`);
console.log(`First item keys:`, Object.keys(items[0]));
console.log('\nFirst item sample:');
const first = items[0];
console.log('  title:', first.title);
console.log('  pubDate:', first.pubDate);
console.log('  itunes:duration:', first['itunes:duration']);
console.log('  itunes:episode:', first['itunes:episode']);
console.log('  itunes:season:', first['itunes:season']);
console.log('  enclosure:', first.enclosure);

// Extract description with TIMELINE hunting
const desc = typeof first.description === 'string'
  ? first.description
  : (first.description?.__cdata || JSON.stringify(first.description));
console.log('\n  description len:', desc.length);
console.log('  description (first 1500 chars):\n', desc.substring(0, 1500));

// Look for TIMELINE pattern
const timelineRegex = /TIMELINE\s*:?/i;
const hasTimeline = timelineRegex.test(desc);
console.log('\n  has TIMELINE header:', hasTimeline);

// Look for mm:ss pattern
const timestamps = desc.match(/\d{1,2}:\d{2}(?::\d{2})?/g);
console.log('  timestamps found:', timestamps?.length || 0, '— first 5:', timestamps?.slice(0, 5));

// Check last item (ep #1)
console.log('\n=== Last item (#1 presumably) ===');
const last = items[items.length - 1];
console.log('  title:', last.title);
console.log('  pubDate:', last.pubDate);
console.log('  itunes:episode:', last['itunes:episode']);
