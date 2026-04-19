/**
 * Option 2 : extraire les liens déjà présents dans rss_description (HTML)
 * pour les épisodes GDIY (ou n'importe quel tenant) qui n'ont pas de page
 * web exploitable ou qui n'ont pas encore été passés au scraper deep.
 *
 * Réutilise la logique de classification de scrape-deep (LinkedIn, episode_ref,
 * tool, company, resource) et insère dans episode_links via ON CONFLICT DO UPDATE.
 *
 * Complémentaire à scrape-deep : là où scrape-deep a déjà tourné, les liens du
 * RSS seront dédupliqués par URL (ON CONFLICT), donc aucune duplication.
 *
 * Usage :
 *   PODCAST_ID=gdiy npx tsx scripts/extract-links-from-rss.ts            # dry-run
 *   PODCAST_ID=gdiy npx tsx scripts/extract-links-from-rss.ts --write    # DB
 *   PODCAST_ID=gdiy npx tsx scripts/extract-links-from-rss.ts --write --all   # tous les eps full, pas seulement ceux sans article_url
 */
import 'dotenv/config';
import * as cheerio from 'cheerio';
import { neon } from '@neondatabase/serverless';
import { getConfig } from '@engine/config';

const sql = neon(process.env.DATABASE_URL!);
const cfg = getConfig();
const TENANT = cfg.database.tenantId;
const BASE = cfg.website;
const WEBSITE_HOST = new URL(BASE).hostname.replace(/^www\./, '');

const TOOL_DOMAINS = [
  'trade-republic.com', 'boursorama.com', 'degiro.com', 'saxoinvestor.fr', 'saxo.com',
  'fortuneo.fr', 'interactivebrokers', 'revolut.com', 'n26.com',
  'binance.com', 'coinbase.com', 'kraken.com', 'etoro.com', 'bitpanda.com',
  'yomoni.fr', 'nalo.fr', 'goodvest.fr', 'ramify.fr', 'cashbee.fr',
  'bourse-direct.fr', 'tradingview.com', 'morningstar.fr', 'quantalys.com',
  'ledger.com', 'metamask.io', 'linxea.com', 'meilleurtaux.com',
  'moneyvox.fr', 'amf-france.org', 'service-public.fr', 'impots.gouv.fr',
];
const SOCIAL_NON_LINKEDIN = ['twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'youtube.com', 'tiktok.com'];

type LinkType = 'resource' | 'linkedin' | 'episode_ref' | 'company' | 'tool';

function classifyLink(url: string): LinkType {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (host.includes('linkedin.com') && u.pathname.startsWith('/in/')) return 'linkedin';
    if (host === WEBSITE_HOST) return 'episode_ref';
    if (TOOL_DOMAINS.some((t) => host.includes(t))) return 'tool';
    if (SOCIAL_NON_LINKEDIN.some((s) => host.includes(s))) return 'resource';
    const labels = host.split('.');
    if (labels.length === 2 && (labels[1] === 'fr' || labels[1] === 'com' || labels[1] === 'io')) {
      return 'company';
    }
    return 'resource';
  } catch {
    return 'resource';
  }
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

interface ExtractedLink { url: string; label: string; link_type: LinkType; }

function extractLinks(html: string): { links: ExtractedLink[]; guestLinkedin: string | null } {
  const $ = cheerio.load(html);
  const linksMap = new Map<string, ExtractedLink>();
  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') || '').trim();
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    let absolute: string;
    try { absolute = new URL(href, BASE).toString(); } catch { return; }
    if (linksMap.has(absolute)) return;
    const label = normalize($(el).text()).slice(0, 500);
    linksMap.set(absolute, { url: absolute, label, link_type: classifyLink(absolute) });
  });
  const links = Array.from(linksMap.values());
  const guestLinkedin = links
    .filter((l) => l.link_type === 'linkedin')
    .map((l) => l.url)
    .find((u) => !/\/in\/stefani/i.test(u)) || null;
  return { links, guestLinkedin };
}

(async () => {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const all = args.includes('--all');

  console.log(`[RSS-LINKS] tenant=${TENANT} write=${write} scope=${all ? 'all full eps' : 'eps without article_url or with link count=0'}`);

  const rows: any[] = all
    ? (await sql`
        SELECT id, episode_number, title, guest, rss_description
        FROM episodes
        WHERE tenant_id = ${TENANT}
          AND (episode_type='full' OR episode_type IS NULL)
          AND rss_description IS NOT NULL AND length(rss_description) > 100
        ORDER BY episode_number DESC NULLS LAST
      `) as any[]
    : (await sql`
        SELECT e.id, e.episode_number, e.title, e.guest, e.rss_description
        FROM episodes e
        LEFT JOIN (
          SELECT episode_id, COUNT(*)::int AS n
          FROM episode_links
          WHERE tenant_id = ${TENANT}
          GROUP BY episode_id
        ) l ON l.episode_id = e.id
        WHERE e.tenant_id = ${TENANT}
          AND (e.episode_type='full' OR e.episode_type IS NULL)
          AND e.rss_description IS NOT NULL AND length(e.rss_description) > 100
          AND COALESCE(l.n, 0) = 0
        ORDER BY e.episode_number DESC NULLS LAST
      `) as any[];

  console.log(`  ${rows.length} episodes to process`);
  if (!rows.length) return;

  let totalLinks = 0, totalLinkedin = 0, processed = 0, empty = 0;
  for (const ep of rows) {
    const { links, guestLinkedin } = extractLinks(ep.rss_description);
    if (!links.length) { empty++; continue; }
    processed++;
    totalLinks += links.length;
    if (guestLinkedin) totalLinkedin++;

    if (!write) {
      console.log(`  #${ep.episode_number} ${links.length} links (${guestLinkedin ? 'LI✓' : 'LI-'}): ` +
        links.slice(0, 3).map(l => `[${l.link_type}]${l.label.substring(0, 30)}`).join(' | '));
      continue;
    }

    const urls = links.map(l => l.url);
    const labels = links.map(l => l.label);
    const types = links.map(l => l.link_type);
    await sql`
      INSERT INTO episode_links (tenant_id, episode_id, url, label, link_type)
      SELECT ${TENANT}, ${ep.id}::int, u, l, t
      FROM unnest(${urls}::text[], ${labels}::text[], ${types}::text[]) AS x(u, l, t)
      ON CONFLICT (episode_id, url) DO UPDATE
      SET label = EXCLUDED.label, link_type = EXCLUDED.link_type
    `;

    if (guestLinkedin && ep.guest) {
      await sql`
        UPDATE guests SET linkedin_url = ${guestLinkedin}
        WHERE tenant_id = ${TENANT} AND name = ${ep.guest}
          AND (linkedin_url IS NULL OR linkedin_url = '')
      `;
    }
  }

  console.log(`\n[RSS-LINKS] ${processed} episodes with links, ${empty} empty, ${totalLinks} links total, ${totalLinkedin} guest LinkedIn`);
  if (!write) console.log(`(--write to insert into DB)`);
})();
