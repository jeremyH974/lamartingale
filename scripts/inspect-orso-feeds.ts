const FEEDS = [
  { id: 'lepanier', name: 'Le Panier', url: 'https://feeds.audiomeans.fr/feed/79fd1032-3732-49a2-8cc5-0d91b31e9b89.xml' },
  { id: 'passionpatrimoine', name: 'Passion Patrimoine', url: 'https://feeds.audiomeans.fr/feed/88200bee-f7c5-4573-9d12-e29368f16aa8.xml' },
  { id: 'finscale', name: 'Finscale', url: 'https://feeds.audiomeans.fr/feed/55e0559e-ee0f-44ea-9e0f-acb0a18ec478.xml' },
  { id: 'combiencagagne', name: 'Combien ça gagne', url: 'https://feeds.audiomeans.fr/feed/085c8635-d7bf-493b-87b9-76e75bf83e6b.xml' },
];

(async () => {
  for (const f of FEEDS) {
    try {
      const r = await fetch(f.url);
      const xml = await r.text();
      const channelTitle = xml.match(/<channel>[\s\S]*?<title[^>]*>(?:<!\[CDATA\[)?([^<\]]+)\]?\]?>/)?.[1]?.trim();
      const image = xml.match(/<itunes:image\s+href=['"]([^'"]+)['"]/)?.[1];
      const author = xml.match(/<itunes:author>(?:<!\[CDATA\[)?([^<\]]+)\]?\]?<\/itunes:author>/)?.[1]?.trim();
      const itemCount = (xml.match(/<item\b/g) || []).length;
      const cats = Array.from(xml.matchAll(/<itunes:category\s+text=['"]([^'"]+)['"]/g)).map(m => m[1]);
      const link = xml.match(/<channel>[\s\S]*?<link>([^<]+)<\/link>/)?.[1]?.trim();
      console.log(`\n=== ${f.name} (${f.id}) ===`);
      console.log(`  title     : ${channelTitle}`);
      console.log(`  author    : ${author}`);
      console.log(`  items     : ${itemCount}`);
      console.log(`  site      : ${link}`);
      console.log(`  categories: ${[...new Set(cats)].join(', ')}`);
      console.log(`  cover     : ${image}`);
    } catch (e: any) {
      console.log(`\n=== ${f.name} — FAIL: ${e.message}`);
    }
  }
})();
