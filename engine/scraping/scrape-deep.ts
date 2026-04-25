/**
 * Deep Content Scraper — lamartingale.io
 *
 * Pour chaque épisode en BDD :
 *   - Fetch /tous/{slug}/
 *   - Extrait l'article complet (HTML + texte nettoyé)
 *   - Extrait les chapitres (H2)
 *   - Extrait les liens classifiés (LinkedIn, episode_ref, tool, company, resource)
 *   - Détecte le LinkedIn de l'invité (premier /in/ hors Stefani)
 *
 * Met à jour :
 *   - episodes.article_content, article_html, chapters
 *   - episode_links (une ligne par lien)
 *   - guests.linkedin_url
 *
 * Usage :
 *   npx tsx src/scrape-deep.ts                  # tous sans article_content/article_html
 *   npx tsx src/scrape-deep.ts --force          # re-scrape tout
 *   npx tsx src/scrape-deep.ts --episode 42     # un seul épisode
 *   npx tsx src/scrape-deep.ts --limit 3        # test sur N épisodes
 */
import 'dotenv/config';
import * as cheerio from 'cheerio';
import { neon } from '@neondatabase/serverless';
import { getConfig } from '@engine/config';
import {
  pickGuestLinkedin,
  buildExclusions,
  type LinkedinExclusions,
  type PickResult,
} from './linkedin-filter';

const sql = neon(process.env.DATABASE_URL!);
const cfg = getConfig();
const TENANT = cfg.database.tenantId;

// Exclusions LinkedIn pour ce tenant : hosts (exclus sauf host-as-guest) + parasites
// (toujours exclus). Source : cfg.scraping.linkedinExclusions + fallback dérivés du host.
const LINKEDIN_EXCLUSIONS: LinkedinExclusions = buildExclusions({
  hostName: cfg.host,
  coHosts: Array.isArray(cfg.coHosts) ? cfg.coHosts : [],
  configHosts: cfg.scraping?.linkedinExclusions?.hosts,
  configParasites: cfg.scraping?.linkedinExclusions?.parasites,
});

// BASE : racine du site du podcast — pour résoudre les URLs relatives
// et classifier les liens internes comme episode_ref.
const BASE = cfg.website;
const WEBSITE_HOST = new URL(BASE).hostname.replace(/^www\./, '');
const USER_AGENT = cfg.scraping.userAgent;
const DELAY_MS = cfg.scraping.rateLimit;
const TIMEOUT_MS = 10_000;
const MIN_ARTICLE_CHARS = 200;
const CONSECUTIVE_ERRORS_BEFORE_PAUSE = 5;
const PAUSE_MS = 5 * 60_000;

// ---------------------------------------------------------------------------
// Tool / company domain classification
// ---------------------------------------------------------------------------
// TOOL_DOMAINS porté vers engine/classify/tool-rules.ts (D3 — classifieur
// commun) : fusion fintech (ex-scrape-deep) + SaaS (ex-rss/extractors).
import { isToolDomain } from '../classify/tool-rules';

const SOCIAL_NON_LINKEDIN = ['twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'youtube.com', 'tiktok.com'];

type LinkType = 'resource' | 'linkedin' | 'episode_ref' | 'company' | 'tool';

function classifyLink(url: string): LinkType {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();

    if (host.includes('linkedin.com') && u.pathname.startsWith('/in/')) return 'linkedin';
    // episode_ref = lien vers le site du podcast lui-même (issu de la config)
    if (host === WEBSITE_HOST) return 'episode_ref';
    if (isToolDomain(host)) return 'tool';
    if (SOCIAL_NON_LINKEDIN.some((s) => host.includes(s))) return 'resource';

    // Heuristique "company" : domaine court (2 labels), pas social
    const labels = host.split('.');
    if (labels.length === 2 && (labels[1] === 'fr' || labels[1] === 'com' || labels[1] === 'io')) {
      return 'company';
    }
    return 'resource';
  } catch {
    return 'resource';
  }
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(url: string, attempt = 1): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.status === 404) return null;
    if (res.status === 429) {
      const backoff = Math.min(60_000, 4_000 * Math.pow(2, attempt - 1));
      console.warn(`    [429] backoff ${backoff}ms`);
      await sleep(backoff);
      if (attempt < 4) return fetchPage(url, attempt + 1);
      return null;
    }
    if (!res.ok) {
      console.warn(`    HTTP ${res.status}`);
      return null;
    }
    return await res.text();
  } catch (e: any) {
    clearTimeout(timer);
    console.warn(`    fetch error: ${e?.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------
interface Extracted {
  articleText: string;
  articleHtml: string;
  chapters: { title: string; order: number }[];
  links: { url: string; label: string; link_type: LinkType }[];
  guestLinkedin: string | null;
  /** Diagnostic : règle déclenchée + URLs rejetées (hosts/parasites). */
  linkedinPick?: PickResult;
}

const ARTICLE_SELECTORS = cfg.scraping.articleSelectors;
const EXCLUDE_SELECTORS = cfg.scraping.excludeSelectors.join(', ');
const CHAPTER_SELECTOR = cfg.scraping.chapterSelector || 'h2';

function pickArticleRoot($: cheerio.CheerioAPI): cheerio.Cheerio<any> | null {
  for (const sel of ARTICLE_SELECTORS) {
    const node = $(sel).first();
    if (node.length && node.text().trim().length > MIN_ARTICLE_CHARS) {
      return node;
    }
  }
  // Fallback : zone avec le plus de <p>
  let bestParent: any = null;
  let bestCount = 0;
  $('p').each((_, el) => {
    const parent = $(el).parent();
    const count = parent.find('p').length;
    if (count > bestCount) {
      bestCount = count;
      bestParent = parent;
    }
  });
  return bestParent && bestCount >= 3 ? bestParent : null;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function extract($: cheerio.CheerioAPI, guestName: string | null): Extracted | null {
  const root = pickArticleRoot($);
  if (!root) return null;

  // Enlever éléments non-contenu dans la zone (selon config.scraping.excludeSelectors)
  if (EXCLUDE_SELECTORS) root.find(EXCLUDE_SELECTORS).remove();

  const articleHtml = $.html(root);
  const articleText = normalize(root.text());

  if (articleText.length < MIN_ARTICLE_CHARS) {
    return { articleText, articleHtml, chapters: [], links: [], guestLinkedin: null };
  }

  // Chapitres : selector configure (cfg.scraping.chapterSelector, defaut h2)
  const chapters: { title: string; order: number }[] = [];
  root.find(CHAPTER_SELECTOR).each((i, el) => {
    const t = normalize($(el).text());
    if (t) chapters.push({ title: t, order: i + 1 });
  });

  // Liens : dédupliqué par URL, on conserve l'ordre DOM (priorité 3 du picker).
  const linksMap = new Map<string, { url: string; label: string; link_type: LinkType }>();
  root.find('a[href]').each((_, el) => {
    const href = ($(el).attr('href') || '').trim();
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

    let absolute: string;
    try {
      absolute = new URL(href, BASE).toString();
    } catch {
      return;
    }
    // Dédoublonner
    if (linksMap.has(absolute)) return;
    const label = normalize($(el).text()).slice(0, 500);
    linksMap.set(absolute, { url: absolute, label, link_type: classifyLink(absolute) });
  });
  const links = Array.from(linksMap.values());

  // LinkedIn invité : pickGuestLinkedin avec exclusions hosts + parasites + host-as-guest.
  const linkedinCandidates = links
    .filter((l) => l.link_type === 'linkedin')
    .map((l) => ({ url: l.url, label: l.label }));
  const linkedinPick = pickGuestLinkedin(linkedinCandidates, guestName, LINKEDIN_EXCLUSIONS);

  return {
    articleText,
    articleHtml,
    chapters,
    links,
    guestLinkedin: linkedinPick.url,
    linkedinPick,
  };
}

// ---------------------------------------------------------------------------
// DB update
// ---------------------------------------------------------------------------
async function persist(
  episodeId: number,
  guestName: string | null,
  ex: Extracted,
) {
  await sql`
    UPDATE episodes
    SET article_content = ${ex.articleText},
        article_html = ${ex.articleHtml},
        chapters = ${JSON.stringify(ex.chapters)}::jsonb
    WHERE id = ${episodeId}
  `;

  if (ex.links.length > 0) {
    // Batch insert via unnest
    const urls = ex.links.map((l) => l.url);
    const labels = ex.links.map((l) => l.label);
    const types = ex.links.map((l) => l.link_type);
    await sql`
      INSERT INTO episode_links (tenant_id, episode_id, url, label, link_type)
      SELECT ${TENANT}, ${episodeId}::int, u, l, t
      FROM unnest(${urls}::text[], ${labels}::text[], ${types}::text[]) AS x(u, l, t)
      ON CONFLICT (episode_id, url) DO UPDATE
      SET label = EXCLUDED.label, link_type = EXCLUDED.link_type, tenant_id = EXCLUDED.tenant_id
    `;
  }

  if (ex.guestLinkedin && guestName) {
    await sql`
      UPDATE guests
      SET linkedin_url = ${ex.guestLinkedin}
      WHERE tenant_id = ${TENANT}
        AND name = ${guestName}
        AND (linkedin_url IS NULL OR linkedin_url = '')
    `;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
interface EpisodeRow {
  id: number;
  episode_number: number | null;
  slug: string | null;
  article_url: string | null;
  title: string;
  guest: string | null;
  article_content: string | null;
  article_html: string | null;
}

async function loadEpisodes(opts: { force: boolean; onlyId?: number; limit?: number }): Promise<EpisodeRow[]> {
  if (opts.onlyId) {
    return (await sql`
      SELECT id, episode_number, slug, article_url, title, guest, article_content, article_html
      FROM episodes WHERE id = ${opts.onlyId} AND tenant_id = ${TENANT}
    `) as EpisodeRow[];
  }

  // Selection :
  //  - si cfg.requiresArticleUrl (GDIY) : article_url obligatoire
  //  - sinon (LM legacy) : slug + episodeUrlPattern suffit
  const requiresUrl = cfg.scraping.requiresArticleUrl === true;
  const rows = requiresUrl
    ? ((await sql`
        SELECT id, episode_number, slug, article_url, title, guest, article_content, article_html
        FROM episodes
        WHERE tenant_id = ${TENANT}
          AND article_url IS NOT NULL AND article_url <> ''
          AND (episode_type = 'full' OR episode_type IS NULL)
        ORDER BY episode_number DESC NULLS LAST, id DESC
      `) as EpisodeRow[])
    : ((await sql`
        SELECT id, episode_number, slug, article_url, title, guest, article_content, article_html
        FROM episodes
        WHERE tenant_id = ${TENANT}
          AND (
            (article_url IS NOT NULL AND article_url <> '')
            OR (slug IS NOT NULL AND slug <> '')
          )
          AND (episode_type = 'full' OR episode_type IS NULL)
        ORDER BY episode_number DESC NULLS LAST, id DESC
      `) as EpisodeRow[]);

  const filtered = opts.force
    ? rows
    : rows.filter((r) => !r.article_content || !r.article_html || r.article_content.length < MIN_ARTICLE_CHARS);

  return opts.limit ? filtered.slice(0, opts.limit) : filtered;
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const onlyIdx = args.indexOf('--episode');
  const onlyId = onlyIdx >= 0 ? Number(args[onlyIdx + 1]) : undefined;
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : undefined;

  console.log(`[DEEP-SCRAPE] start — podcast=${cfg.id} site=${BASE}`);
  if (!cfg.scraping.hasArticles) {
    console.log(`  [SKIP] Ce podcast (${cfg.id}) n'a pas d'articles web par épisode (config.scraping.hasArticles=false).`);
    console.log(`  Le RSS est la source principale — lance scrape-rss.ts à la place.`);
    return;
  }
  console.log(`  mode: ${force ? 'FORCE (re-scrape all)' : 'incremental (skip filled)'}`);
  if (onlyId) console.log(`  single episode id: ${onlyId}`);
  if (limit) console.log(`  limit: ${limit}`);

  const episodes = await loadEpisodes({ force, onlyId, limit });
  console.log(`  queue: ${episodes.length} episode(s)`);
  if (episodes.length === 0) {
    console.log('  nothing to do');
    return;
  }

  const stats = { ok: 0, notFound: 0, stubs: 0, failed: 0, totalChars: 0, totalChapters: 0, totalLinks: 0, linkedin: 0 };
  let consecutiveErrors = 0;
  const t0 = Date.now();

  for (let i = 0; i < episodes.length; i++) {
    const ep = episodes[i];
    const label = `#${ep.episode_number ?? '?'} "${ep.title.slice(0, 60)}"`;
    process.stdout.write(`  [${i + 1}/${episodes.length}] ${label} ... `);

    // Prefere article_url quand pose explicitement (ex: GDIY ou LM override),
    // sinon construit via episodeUrlPattern + slug.
    const url = ep.article_url && ep.article_url.trim()
      ? ep.article_url.trim()
      : cfg.episodeUrlPattern.replace('{slug}', ep.slug || '');
    const html = await fetchPage(url);

    if (html === null) {
      console.log('❌ 404 / unreachable');
      stats.notFound++;
      consecutiveErrors++;
    } else {
      try {
        const $ = cheerio.load(html);
        const ex = extract($, ep.guest);
        if (!ex) {
          console.log('⚠️ no article zone');
          stats.stubs++;
        } else if (ex.articleText.length < MIN_ARTICLE_CHARS) {
          console.log(`⚠️ stub (${ex.articleText.length}c)`);
          stats.stubs++;
          // Persist anyway for traceability
          await persist(ep.id, ep.guest, ex);
        } else {
          await persist(ep.id, ep.guest, ex);
          stats.ok++;
          stats.totalChars += ex.articleText.length;
          stats.totalChapters += ex.chapters.length;
          stats.totalLinks += ex.links.length;
          if (ex.guestLinkedin) stats.linkedin++;
          // Diagnostic LinkedIn picker — visible quand parasites/hosts rejetés.
          const pick = ex.linkedinPick;
          let linkedinTag = '';
          if (ex.guestLinkedin) {
            linkedinTag = `, linkedin[${pick?.rule ?? 'unknown'}]`;
          } else if (pick && pick.rejected.length > 0) {
            linkedinTag = `, linkedin=null(rejected:${pick.rejected.length})`;
          }
          if (pick && pick.rejected.length > 0) {
            const rejSummary = pick.rejected
              .map((r) => `${r.reason}:${r.url.replace(/.*\/in\//, '').replace(/[/?#].*/, '')}`)
              .join(',');
            console.log(`✅ ${ex.articleText.length}c, ${ex.chapters.length} chap, ${ex.links.length} links${linkedinTag} {${rejSummary}}`);
          } else {
            console.log(`✅ ${ex.articleText.length}c, ${ex.chapters.length} chap, ${ex.links.length} links${linkedinTag}`);
          }
          consecutiveErrors = 0;
        }
      } catch (e: any) {
        console.log(`❌ parse error: ${e?.message}`);
        stats.failed++;
        consecutiveErrors++;
      }
    }

    if (consecutiveErrors >= CONSECUTIVE_ERRORS_BEFORE_PAUSE) {
      console.warn(`\n  [pause ${PAUSE_MS / 1000}s after ${consecutiveErrors} consecutive errors]`);
      await sleep(PAUSE_MS);
      consecutiveErrors = 0;
    } else if (i < episodes.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  const duration = ((Date.now() - t0) / 1000).toFixed(0);
  const avgChars = stats.ok > 0 ? Math.round(stats.totalChars / stats.ok) : 0;

  console.log('\n[DEEP-SCRAPE] complete');
  console.log(`  ✅ Scraped     : ${stats.ok}/${episodes.length}`);
  console.log(`  ❌ Not found   : ${stats.notFound}/${episodes.length}`);
  console.log(`  ⚠️  Stubs      : ${stats.stubs}/${episodes.length}`);
  console.log(`  💥 Failed      : ${stats.failed}/${episodes.length}`);
  console.log(`  📊 Avg chars   : ${avgChars}`);
  console.log(`  📋 Chapters    : ${stats.totalChapters}`);
  console.log(`  🔗 Links       : ${stats.totalLinks}`);
  console.log(`  👤 LinkedIn    : ${stats.linkedin} guests`);
  console.log(`  ⏱️  Duration    : ${duration}s`);
}

main().catch((e) => {
  console.error('[DEEP-SCRAPE] fatal', e);
  process.exit(1);
});
