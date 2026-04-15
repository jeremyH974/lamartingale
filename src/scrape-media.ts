import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';

// ============================================================================
// Scraper Media : thumbnails + audio player URLs depuis lamartingale.io
// ============================================================================

const BASE = 'https://lamartingale.io';
const DELAY = 900; // ms between requests
const MAX_PAGES = 32;

interface EpisodeMedia {
  url: string;           // episode page URL
  slug: string;          // slug from URL
  thumbnail_350: string; // 350x350 thumbnail
  thumbnail_full: string; // full-size image (og:image)
  audio_player: string;  // audiomeans iframe URL
  episode_id: number;    // episode number if found
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchPage(url: string, retries = 3): Promise<string | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LaMartingaleBot/1.0)' }
      });
      if (!res.ok) {
        console.error(`  HTTP ${res.status} for ${url}`);
        if (res.status === 404) return null;
        continue;
      }
      return await res.text();
    } catch (e: any) {
      console.error(`  Fetch error (attempt ${i + 1}): ${e.message}`);
      await sleep(2000);
    }
  }
  return null;
}

// Phase 1: Scrape listing pages for episode URLs + thumbnails
async function scrapeListingPages(): Promise<Map<string, Partial<EpisodeMedia>>> {
  const episodes = new Map<string, Partial<EpisodeMedia>>();

  console.log('\n=== PHASE 1: Scraping listing pages ===\n');

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${BASE}/listes-des-episodes/?current_page=${page}`;
    console.log(`Page ${page}/${MAX_PAGES}: ${url}`);

    const html = await fetchPage(url);
    if (!html) { console.log('  No more pages'); break; }

    const $ = cheerio.load(html);
    const cards = $('.carousel__episode');

    if (cards.length === 0) {
      console.log('  No episodes found, stopping');
      break;
    }

    cards.each((_, card) => {
      const link = $(card).find('.episode__image a[href*="/tous/"]').first();
      const img = link.find('img').first();
      const href = link.attr('href');
      const imgSrc = img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src') || '';

      if (href && !episodes.has(href)) {
        // href can be absolute or relative
        const fullUrl = href.startsWith('http') ? href : `${BASE}${href}`;
        const slug = fullUrl.replace(/.*\/tous\//, '').replace(/\/$/, '');
        const thumbnail = imgSrc.startsWith('http') ? imgSrc : imgSrc ? `${BASE}${imgSrc}` : '';

        episodes.set(href, {
          url: fullUrl,
          slug,
          thumbnail_350: thumbnail,
        });
      }
    });

    console.log(`  Found ${cards.length} episodes (total: ${episodes.size})`);
    await sleep(DELAY);
  }

  return episodes;
}

// Phase 2: Scrape individual episode pages for og:image + audio player
async function scrapeEpisodeDetails(
  episodes: Map<string, Partial<EpisodeMedia>>
): Promise<EpisodeMedia[]> {
  console.log(`\n=== PHASE 2: Scraping ${episodes.size} episode pages ===\n`);

  const results: EpisodeMedia[] = [];
  let i = 0;

  for (const [href, ep] of episodes) {
    i++;
    const url = ep.url || (href.startsWith('http') ? href : `${BASE}${href}`);
    console.log(`  [${i}/${episodes.size}] ${url}`);

    const html = await fetchPage(url);
    if (!html) {
      results.push({
        url,
        slug: ep.slug || '',
        thumbnail_350: ep.thumbnail_350 || '',
        thumbnail_full: '',
        audio_player: '',
        episode_id: 0,
      });
      await sleep(DELAY);
      continue;
    }

    const $ = cheerio.load(html);

    // og:image
    const ogImage = $('meta[property="og:image"]').attr('content') || '';

    // Audio player (Audiomeans iframe)
    const audioIframe = $('iframe[src*="audiomeans"], iframe[src*="player.ausha"]').first();
    const audioPlayer = audioIframe.attr('src') || '';

    // Episode number from JSON-LD
    let episodeId = 0;
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const ld = JSON.parse($(el).html() || '{}');
        if (ld['@type'] === 'PodcastEpisode' && ld.episodeNumber) {
          episodeId = parseInt(ld.episodeNumber) || 0;
        }
      } catch {}
    });

    results.push({
      url,
      slug: ep.slug || '',
      thumbnail_350: ep.thumbnail_350 || '',
      thumbnail_full: ogImage,
      audio_player: audioPlayer,
      episode_id: episodeId,
    });

    if (i % 20 === 0) {
      // Incremental save
      saveResults(results);
      console.log(`    [Saved ${results.length} episodes]`);
    }

    await sleep(DELAY);
  }

  return results;
}

function saveResults(results: EpisodeMedia[]) {
  const outPath = path.join(__dirname, '..', 'data', 'episodes-media.json');

  // Also build a quick lookup by episode_id
  const byId: Record<number, any> = {};
  for (const r of results) {
    if (r.episode_id > 0) {
      byId[r.episode_id] = {
        thumbnail_350: r.thumbnail_350,
        thumbnail_full: r.thumbnail_full,
        audio_player: r.audio_player,
        url: r.url,
      };
    }
  }

  const output = {
    metadata: {
      scraped_at: new Date().toISOString(),
      total_episodes: results.length,
      with_thumbnail: results.filter(r => r.thumbnail_350).length,
      with_audio: results.filter(r => r.audio_player).length,
      with_episode_id: results.filter(r => r.episode_id > 0).length,
    },
    by_id: byId,
    episodes: results,
  };

  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
}

// ============================================================================
async function main() {
  console.log('=== LA MARTINGALE MEDIA SCRAPER ===');
  console.log(`Rate limit: ${DELAY}ms | Max pages: ${MAX_PAGES}`);

  // Phase 1: listing pages
  const episodeMap = await scrapeListingPages();

  // Phase 2: individual pages
  const results = await scrapeEpisodeDetails(episodeMap);

  // Save final
  saveResults(results);

  // Stats
  console.log('\n=== FINAL STATS ===');
  console.log(`Total episodes scraped: ${results.length}`);
  console.log(`With thumbnail: ${results.filter(r => r.thumbnail_350).length}`);
  console.log(`With full image: ${results.filter(r => r.thumbnail_full).length}`);
  console.log(`With audio player: ${results.filter(r => r.audio_player).length}`);
  console.log(`With episode ID: ${results.filter(r => r.episode_id > 0).length}`);
  console.log(`\nSaved to: data/episodes-media.json`);
}

main().catch(console.error);
