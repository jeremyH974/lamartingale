import 'dotenv/config';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Scraper bios invités + companies depuis les pages episodes lamartingale.io
// ============================================================================

const DELAY = 900;
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function fetchPage(url: string): Promise<string | null> {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LaMartingaleBot/2.0)' }
      });
      if (!res.ok) { if (res.status === 404) return null; continue; }
      return await res.text();
    } catch { await sleep(2000); }
  }
  return null;
}

interface GuestInfo {
  episode_id: number;
  guest_name: string;
  guest_company: string;
  guest_bio: string;
}

async function main() {
  console.log('[SCRAPE-BIOS] Starting guest bio scraper');

  // Load enriched data to get URLs
  const enrichedPath = path.join(__dirname, '..', 'data', 'episodes-enriched.json');
  const enriched = JSON.parse(fs.readFileSync(enrichedPath, 'utf-8'));

  // Build url list with episode IDs
  const toScrape: { id: number; url: string; guest: string }[] = [];
  const seen = new Set<number>();

  for (const ep of enriched.episodes) {
    if (ep.id && ep.url && !seen.has(ep.id)) {
      seen.add(ep.id);
      toScrape.push({ id: ep.id, url: ep.url, guest: ep.guest_name || '' });
    }
  }

  console.log(`  Episodes to scrape: ${toScrape.length}`);

  const results: GuestInfo[] = [];
  let scraped = 0;

  for (const ep of toScrape) {
    scraped++;
    if (scraped % 50 === 0) console.log(`  [${scraped}/${toScrape.length}]...`);

    const html = await fetchPage(ep.url);
    if (!html) {
      results.push({ episode_id: ep.id, guest_name: ep.guest, guest_company: '', guest_bio: '' });
      await sleep(DELAY);
      continue;
    }

    const $ = cheerio.load(html);

    // Extract guest bio - usually in a section after the article
    // Pattern 1: JSON-LD actor field
    let guestBio = '';
    let guestCompany = '';

    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const ld = JSON.parse($(el).html() || '{}');
        if (ld['@type'] === 'PodcastEpisode') {
          // Actor often has description
          const actors = Array.isArray(ld.actor) ? ld.actor : ld.actor ? [ld.actor] : [];
          for (const actor of actors) {
            if (actor.description) guestBio = actor.description;
            if (actor.worksFor?.name) guestCompany = actor.worksFor.name;
            if (actor.jobTitle && !guestCompany) guestCompany = actor.jobTitle;
          }
        }
      } catch {}
    });

    // Pattern 2: Look for bio in article text (usually "Qui est [guest]?" or italic text at end)
    if (!guestBio) {
      const articleText = $('.single__content, .entry-content, article').text();
      // Search for bio-like patterns
      const bioPatterns = [
        /(?:Qui est|A propos de|Biographie)[^?]*\??\s*([^.]{50,500})/i,
        /(?:notre invit[ée]|l'invit[ée])[^.]*\.([^.]{50,300})/i,
      ];
      for (const pat of bioPatterns) {
        const m = articleText.match(pat);
        if (m) { guestBio = m[1].trim(); break; }
      }
    }

    // Pattern 3: Look for company in guest name format "Name (Company)" or JSON-LD
    if (!guestCompany && ep.guest) {
      const compMatch = ep.guest.match(/\(([^)]+)\)/);
      if (compMatch) guestCompany = compMatch[1];
    }

    results.push({
      episode_id: ep.id,
      guest_name: ep.guest,
      guest_company: guestCompany,
      guest_bio: guestBio.substring(0, 1000), // Limit bio length
    });

    await sleep(DELAY);
  }

  // Save
  const outPath = path.join(__dirname, '..', 'data', 'guests-bios.json');
  const output = {
    metadata: {
      scraped_at: new Date().toISOString(),
      total: results.length,
      with_bio: results.filter(r => r.guest_bio).length,
      with_company: results.filter(r => r.guest_company).length,
    },
    guests: results,
  };
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');

  console.log(`\n[SCRAPE-BIOS] === DONE ===`);
  console.log(`  Total: ${results.length}`);
  console.log(`  With bio: ${output.metadata.with_bio}`);
  console.log(`  With company: ${output.metadata.with_company}`);
  console.log(`  Saved to: ${outPath}`);
}

main().catch(console.error);
