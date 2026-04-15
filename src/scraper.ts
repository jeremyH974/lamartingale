import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// La Martingale Scraper v2 - Corrige avec JSON-LD + URL /tous/{slug}/
// ============================================================================

interface ScrapedEpisode {
  id: number | null;
  title: string;
  guest_name: string;
  guest_company: string;
  publication_date: string;
  slug: string;
  url: string;
  abstract: string;
  article_sections: ArticleSection[];
  key_takeaways: string[];
  related_episodes: number[];
  external_references: ExternalRef[];
  community_rating: number | null;
  guest_bio: string;
  sponsor: string;
}

interface ArticleSection {
  heading: string;
  content: string;
}

interface ExternalRef {
  title: string;
  url: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPage(url: string, retries = 3): Promise<string> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (err) {
      console.error(`  Retry ${i + 1}/${retries} for ${url}: ${err}`);
      if (i < retries - 1) await sleep(2000 * (i + 1));
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries} retries`);
}

// ============================================================================
// Phase 1 : Extract episode URLs from listing pages
// URL pattern: /tous/{slug}/ (NOT /episodes/)
// ============================================================================
function extractEpisodeUrls(html: string): string[] {
  const $ = cheerio.load(html);
  const urls: string[] = [];

  // Method 1: Links containing "/tous/" (episode detail pages)
  $('a[href*="/tous/"]').each((_, el) => {
    const href = $(el).attr('href');
    if (href && !href.includes('listes-des-episodes')) {
      const fullUrl = href.startsWith('http') ? href : `https://lamartingale.io${href}`;
      if (!urls.includes(fullUrl)) {
        urls.push(fullUrl);
      }
    }
  });

  // Method 2: "En savoir plus" links as fallback
  if (urls.length === 0) {
    $('a').each((_, el) => {
      const text = $(el).text().trim();
      const href = $(el).attr('href');
      if (href && text.toLowerCase().includes('savoir plus')) {
        const fullUrl = href.startsWith('http') ? href : `https://lamartingale.io${href}`;
        if (!urls.includes(fullUrl)) {
          urls.push(fullUrl);
        }
      }
    });
  }

  return urls;
}

// ============================================================================
// Phase 2 : Parse individual episode page using JSON-LD + HTML content
// ============================================================================
function parseEpisodePage(html: string, url: string): Partial<ScrapedEpisode> | null {
  const $ = cheerio.load(html);

  // ---- PRIMARY: Extract from JSON-LD structured data ----
  let episodeId: number | null = null;
  let title = '';
  let guestName = '';
  let publicationDate = '';
  let abstract = '';

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const jsonText = $(el).html() || '';
      const data = JSON.parse(jsonText);

      // Handle @graph arrays or direct objects
      const items = data['@graph'] || [data];

      for (const item of items) {
        if (item['@type'] === 'PodcastEpisode' || item.episodeNumber !== undefined) {
          const epNum = item.episodeNumber;
          if (epNum && epNum !== '') {
            episodeId = parseInt(epNum);
          }
          title = item.name || title;
          guestName = item.actor || '';
          publicationDate = item.dateCreated || '';
          abstract = item.abstract || item.description || '';
        }
      }
    } catch {
      // Skip malformed JSON-LD
    }
  });

  // ---- FALLBACK: Try extracting episode number from HTML ----
  if (!episodeId) {
    // Look for #NNN pattern in page text
    const bodyText = $('body').text();
    const patterns = [
      /#(\d{1,3})\s/,                    // #312 in text
      /episode\s*#?(\d{1,3})/i,          // Episode #312 or Episode 312
      /\b(\d{1,3})\s*[-–]\s/,            // 312 - Title
    ];

    for (const pattern of patterns) {
      const match = bodyText.match(pattern);
      if (match) {
        const num = parseInt(match[1]);
        if (num >= 1 && num <= 350) {
          episodeId = num;
          break;
        }
      }
    }

    // Also try p tags that contain just "#NNN"
    $('p, span').each((_, el) => {
      if (episodeId) return;
      const text = $(el).text().trim();
      const m = text.match(/^#(\d{1,3})$/);
      if (m) {
        episodeId = parseInt(m[1]);
      }
    });
  }

  // ---- Title from H1 if not from JSON-LD ----
  if (!title) {
    title = $('h1').first().text().trim();
  }

  // ---- Extract slug from URL ----
  const slugMatch = url.match(/\/tous\/([^\/]+)/);
  const slug = slugMatch ? slugMatch[1] : '';

  // ---- Extract article sections (H2 headers + content) ----
  const sections: ArticleSection[] = [];
  $('h2').each((_, el) => {
    const heading = $(el).text().trim();
    if (!heading || heading.length > 200) return;

    // Skip navigation/sidebar headings
    if (heading.toLowerCase().includes('derniers episodes') ||
        heading.toLowerCase().includes('derniers épisodes')) return;

    let content = '';
    let sibling = $(el).next();
    let contentLength = 0;

    while (sibling.length && !sibling.is('h2') && contentLength < 5000) {
      const tag = sibling.prop('tagName')?.toLowerCase();
      if (tag === 'p' || tag === 'ul' || tag === 'ol' || tag === 'blockquote') {
        const text = sibling.text().trim();
        if (text) {
          content += text + '\n';
          contentLength += text.length;
        }
      }
      // Also handle WordPress blocks
      if (sibling.hasClass('wp-block-group') || sibling.find('p').length) {
        const text = sibling.text().trim();
        if (text && !content.includes(text)) {
          content += text + '\n';
          contentLength += text.length;
        }
      }
      sibling = sibling.next();
    }

    if (heading && content.trim()) {
      sections.push({ heading, content: content.trim() });
    }
  });

  // ---- Extract guest bio ----
  let guestBio = '';
  $('h2, h3').each((_, el) => {
    const text = $(el).text().toLowerCase();
    if (text.includes('invit') || text.includes('invite')) {
      const nextP = $(el).nextAll('p').first().text().trim();
      if (nextP.length > 30) {
        guestBio = nextP;
      }
    }
  });

  // ---- Key takeaways from bold text in article ----
  const takeaways: string[] = [];
  $('strong, b').each((_, el) => {
    const text = $(el).text().trim();
    if (text.length > 20 && text.length < 200 &&
        !text.includes('http') && !text.includes('€') &&
        !text.toLowerCase().includes('podcast') &&
        !text.toLowerCase().includes('apple') &&
        !text.toLowerCase().includes('spotify')) {
      takeaways.push(text);
    }
  });

  // ---- Related episodes (links to other La Martingale episodes) ----
  const relatedEpisodes: number[] = [];
  $('a[href*="lamartingale.io/tous/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    // Don't count self-link
    if (href === url) return;

    // Try to find episode number in link text
    const linkText = $(el).text().trim();
    const numMatch = linkText.match(/#(\d{1,3})/);
    if (numMatch) {
      const refId = parseInt(numMatch[1]);
      if (refId !== episodeId && refId > 0 && refId <= 350) {
        relatedEpisodes.push(refId);
      }
    }
  });

  // ---- External references ----
  const externalRefs: ExternalRef[] = [];
  const excludeDomains = [
    'lamartingale.io', 'apple.com', 'spotify.com', 'deezer.com',
    'facebook.com', 'twitter.com', 'instagram.com', 'linkedin.com',
    'youtube.com', 'twitch.tv', 'google.com', 'w3.org'
  ];

  $('a[href^="http"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const linkTitle = $(el).text().trim();
    const excluded = excludeDomains.some(d => href.includes(d));

    if (!excluded && linkTitle.length > 3 && linkTitle.length < 100) {
      externalRefs.push({ title: linkTitle, url: href });
    }
  });

  // ---- Rating ----
  let rating: number | null = null;
  $('[class*="rating"], [class*="vote"], [class*="note"]').each((_, el) => {
    const text = $(el).text();
    const m = text.match(/(\d+(?:[.,]\d+)?)\s*\/\s*5/);
    if (m) rating = parseFloat(m[1].replace(',', '.'));
  });

  // ---- Sponsor detection ----
  let sponsor = '';
  const bodyText = $('body').text();
  const sponsorPatterns = ['eToro', 'Louve Invest', 'SWAIVE', 'Nalo', 'Ramify', 'Finary', 'Amundi', 'Trade Republic'];
  for (const s of sponsorPatterns) {
    if (bodyText.includes(s)) { sponsor = s; break; }
  }

  // ---- Date formatting ----
  // dateCreated is "YYYY-MM-DD HH:MM:SS", convert to "DD.MM.YYYY"
  let formattedDate = publicationDate;
  if (publicationDate && publicationDate.includes('-')) {
    const parts = publicationDate.split(' ')[0].split('-');
    if (parts.length === 3) {
      formattedDate = `${parts[2]}.${parts[1]}.${parts[0]}`;
    }
  }

  // If no date from JSON-LD, try from HTML
  if (!formattedDate) {
    $('p, span, time').each((_, el) => {
      if (formattedDate) return;
      const text = $(el).text().trim();
      const m = text.match(/(\d{2}\.\d{2}\.\d{4})/);
      if (m) formattedDate = m[1];
    });
  }

  return {
    id: episodeId,
    title,
    guest_name: guestName,
    guest_company: '',
    publication_date: formattedDate,
    slug,
    url,
    abstract,
    article_sections: sections,
    key_takeaways: [...new Set(takeaways)].slice(0, 10),
    related_episodes: [...new Set(relatedEpisodes)],
    external_references: externalRefs.slice(0, 15),
    community_rating: rating,
    guest_bio: guestBio,
    sponsor,
  };
}

// ============================================================================
// Phase 3 : Merge scraped data with existing index
// ============================================================================
function mergeWithIndex(
  scraped: Partial<ScrapedEpisode>[],
  indexPath: string
): any[] {
  const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  const indexMap = new Map<number, any>();

  for (const ep of indexData.episodes) {
    indexMap.set(ep.id, ep);
  }

  const merged: any[] = [];

  for (const s of scraped) {
    if (!s.id) continue;
    const idx = indexMap.get(s.id);
    merged.push({
      id: s.id,
      title: s.title || idx?.title || '',
      guest_name: s.guest_name || idx?.guest || '',
      guest_company: s.guest_company || '',
      publication_date: s.publication_date || '',
      format: 'INTERVIEW',
      pillar: idx?.pillar || '',
      sub_theme: '',
      difficulty: idx?.difficulty === 'DEB' ? 'DEBUTANT' :
                  idx?.difficulty === 'INT' ? 'INTERMEDIAIRE' :
                  idx?.difficulty === 'AVA' ? 'AVANCE' : 'INTERMEDIAIRE',
      slug: s.slug || '',
      url: s.url || '',
      abstract: s.abstract || '',
      article_sections: s.article_sections || [],
      key_takeaways: s.key_takeaways || [],
      related_episodes: s.related_episodes || [],
      external_references: s.external_references || [],
      community_rating: s.community_rating ?? null,
      guest_bio: s.guest_bio || '',
      sponsor: s.sponsor || '',
    });
  }

  // Also include un-scraped episodes from index
  for (const ep of indexData.episodes) {
    if (!merged.find(m => m.id === ep.id)) {
      merged.push({
        id: ep.id,
        title: ep.title,
        guest_name: ep.guest,
        guest_company: '',
        publication_date: '',
        format: 'INTERVIEW',
        pillar: ep.pillar,
        sub_theme: '',
        difficulty: ep.difficulty === 'DEB' ? 'DEBUTANT' :
                    ep.difficulty === 'INT' ? 'INTERMEDIAIRE' :
                    ep.difficulty === 'AVA' ? 'AVANCE' : 'INTERMEDIAIRE',
        slug: '',
        url: '',
        abstract: '',
        article_sections: [],
        key_takeaways: [],
        related_episodes: [],
        external_references: [],
        community_rating: null,
        guest_bio: '',
        sponsor: '',
      });
    }
  }

  return merged.sort((a, b) => b.id - a.id);
}

// ============================================================================
// Main
// ============================================================================
async function scrapeAllEpisodes(startPage = 1, endPage = 30): Promise<void> {
  const baseUrl = 'https://lamartingale.io/listes-des-episodes/';
  const allEpisodeUrls: string[] = [];

  console.log(`\n=== LA MARTINGALE SCRAPER v2 ===`);
  console.log(`Strategy: JSON-LD + /tous/{slug}/ URLs`);
  console.log(`Scraping pages ${startPage} to ${endPage}...\n`);

  // Phase 1: Collect all episode URLs
  for (let page = startPage; page <= endPage; page++) {
    const url = page === 1 ? baseUrl : `${baseUrl}?current_page=${page}`;
    console.log(`[Page ${page}/${endPage}] Fetching listing...`);

    try {
      const html = await fetchPage(url);
      const urls = extractEpisodeUrls(html);
      const newUrls = urls.filter(u => !allEpisodeUrls.includes(u));
      console.log(`  Found ${urls.length} URLs (${newUrls.length} new)`);
      allEpisodeUrls.push(...newUrls);
    } catch (err) {
      console.error(`  Error on page ${page}: ${err}`);
    }

    await sleep(1000);
  }

  const uniqueUrls = [...new Set(allEpisodeUrls)];
  console.log(`\nTotal unique episode URLs: ${uniqueUrls.length}`);

  // Phase 2: Scrape individual episode pages
  const scrapedEpisodes: Partial<ScrapedEpisode>[] = [];
  let scraped = 0;
  let withId = 0;
  let withoutId = 0;
  let errors = 0;

  for (const url of uniqueUrls) {
    scraped++;
    const slug = url.split('/tous/')[1]?.replace(/\/$/, '') || url.split('/').pop() || '';
    const shortSlug = slug.substring(0, 45);
    console.log(`[${scraped}/${uniqueUrls.length}] ${shortSlug}...`);

    try {
      const html = await fetchPage(url);
      const episode = parseEpisodePage(html, url);
      if (episode) {
        scrapedEpisodes.push(episode);
        if (episode.id) {
          withId++;
          console.log(`  OK #${episode.id}: ${episode.title?.substring(0, 50)}`);
          console.log(`    Sections: ${episode.article_sections?.length || 0} | Takeaways: ${episode.key_takeaways?.length || 0} | Related: ${episode.related_episodes?.length || 0}`);
        } else {
          withoutId++;
          console.log(`  OK (no #): ${episode.title?.substring(0, 50)}`);
        }
      }
    } catch (err) {
      errors++;
      console.error(`  Error: ${err}`);
    }

    await sleep(800);
  }

  console.log(`\n=== RESULTS ===`);
  console.log(`Total scraped: ${scrapedEpisodes.length}`);
  console.log(`  With episode ID: ${withId}`);
  console.log(`  Without ID (Allo/HS): ${withoutId}`);
  console.log(`  Errors: ${errors}`);

  // Phase 3: Merge and save
  const indexPath = path.join(__dirname, '..', 'data', 'episodes-complete-index.json');
  const outputPath = path.join(__dirname, '..', 'data', 'episodes-enriched.json');

  if (fs.existsSync(indexPath)) {
    const episodesWithId = scrapedEpisodes.filter(e => e.id);
    const merged = mergeWithIndex(episodesWithId, indexPath);

    // Count how many have article content
    const withContent = merged.filter(m => m.article_sections && m.article_sections.length > 0).length;

    fs.writeFileSync(outputPath, JSON.stringify({
      metadata: {
        last_updated: new Date().toISOString(),
        total_episodes: merged.length,
        episodes_with_content: withContent,
        pages_scraped: `${startPage}-${endPage}`,
      },
      episodes: merged,
    }, null, 2));

    console.log(`\nSaved ${merged.length} episodes (${withContent} with content) to ${outputPath}`);
  } else {
    fs.writeFileSync(outputPath, JSON.stringify({ episodes: scrapedEpisodes }, null, 2));
    console.log(`\nSaved ${scrapedEpisodes.length} scraped episodes to ${outputPath}`);
  }
}

// CLI
const startPage = parseInt(process.argv[2] || '1');
const endPage = parseInt(process.argv[3] || '3');

scrapeAllEpisodes(startPage, endPage).catch(console.error);
