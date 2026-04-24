/**
 * /api/universe — agrégat Hub Univers MS
 * ======================================
 *
 * Combine pour N tenants actifs (hors `hub` lui-même) :
 *   - métadonnées publiques (branding, tagline, host, producer)
 *   - stats DB (episodes, hours, guests, articles, lastEpisodeDate)
 *   - 3 épisodes récents (featured)
 *   - cross-guests (invités apparaissant dans ≥ 2 podcasts)
 *   - cross-episodeRefs & pairStats (URL-matching runtime)
 *
 * Contraintes Rail 2 :
 *   - Ordre des cards via `cfg.hub_order` asc (LM=1, GDIY=2, LP=3, FS=4, PP=5, CCG=6)
 *   - Exclusion hub
 *   - Filtre bruit SQL (audiomeans footer + spotify/apple show root)
 *   - cross.episodeRefs via `isEpisodeRefCandidate(url, otherHost)` runtime (pas link_type)
 *
 * Cache : `getCached('universe', 3600, ...)` — namespacé par tenant appelant
 * (typiquement PODCAST_ID=hub → clé `cache:hub:universe`).
 *
 * Spec complète : `docs/design-api-universe.md`.
 */

import { neon } from '@neondatabase/serverless';
import { getAllConfigs } from './config';
import type { PodcastConfig } from './config';
import { websiteHostFromUrl } from './scraping/rss/extractors';
import { isEpisodeRefCandidate } from './classify/episode-ref-rules';
import { getCrossGuests } from './db/cross-queries';

function sqlClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('[universe] DATABASE_URL not set');
  return neon(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Shape publique (consommée par frontend/hub.html)
// ─────────────────────────────────────────────────────────────────────────────

export interface UniversePodcast {
  id: string;
  name: string;
  tagline: string;
  host: string;
  producer: string;
  website: string;
  siteUrl: string;
  description: string;
  branding: PodcastConfig['branding'];
  hub_order: number | null;
  stats: {
    episodes: number;
    hours: number;
    guests: number;
    articles: number;
    lastEpisodeDate: string | null;
  };
  featured: Array<{
    id: number;
    episode_number: number | null;
    title: string;
    slug: string | null;
    pubDate: string | null;
  }>;
}

export interface UniverseCrossGuest {
  canonical: string;
  podcasts: string[];
  count: number;
  appearances: Array<{
    podcast: string;
    podcast_name: string;
    episodeNumber: number | null;
    title: string;
  }>;
}

export interface UniverseCrossEpisodeRef {
  from: { podcast: string; episodeId: number; episodeNumber: number | null; title: string };
  to: { podcast: string; url: string };
}

export interface UniversePairStat {
  from: string;
  to: string;
  count: number;
}

export interface UniverseResponse {
  universe: {
    id: 'ms';
    name: string;
    tagline: string;
    producers: string[];
    totals: {
      podcasts: number;
      episodes: number;
      hours: number;
      guests: number;
      crossGuests: number;
      crossEpisodeRefs: number;
    };
  };
  podcasts: UniversePodcast[];
  cross: {
    guests: UniverseCrossGuest[];
    episodeRefs: UniverseCrossEpisodeRef[];
    pairStats: UniversePairStat[];
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

export async function getUniverse(): Promise<UniverseResponse> {
  const sql = sqlClient();

  // 1. Résoudre les tenants hub-éligibles (hors 'hub' lui-même) triés par hub_order.
  const configs = getAllConfigs()
    .filter((c) => c.id !== 'hub')
    .sort((a, b) => {
      const oa = a.hub_order ?? Number.POSITIVE_INFINITY;
      const ob = b.hub_order ?? Number.POSITIVE_INFINITY;
      return oa - ob;
    });
  const tenantIds = configs.map((c) => c.database.tenantId);

  // 2. Queries parallèles : stats + featured + cross-refs raw + cross-guests.
  const [statsRows, featuredRows, crossRefsRaw, crossGuestsRaw] = await Promise.all([
    sql`
      SELECT
        tenant_id,
        count(*) FILTER (WHERE (episode_type = 'full' OR episode_type IS NULL))::int AS episodes,
        COALESCE(SUM(duration_seconds) FILTER (WHERE (episode_type = 'full' OR episode_type IS NULL)), 0)::bigint AS total_seconds,
        count(DISTINCT lower(trim(COALESCE(NULLIF(guest, ''), guest_from_title))))
          FILTER (WHERE COALESCE(NULLIF(guest, ''), guest_from_title) IS NOT NULL)::int AS guests,
        count(*) FILTER (WHERE article_content IS NOT NULL AND length(article_content) > 500)::int AS articles,
        max(date_created)::date AS last_episode_date
      FROM episodes
      WHERE tenant_id = ANY(${tenantIds})
      GROUP BY tenant_id
    ` as any,
    sql`
      WITH ranked AS (
        SELECT
          id, tenant_id, episode_number, title, slug, date_created,
          row_number() OVER (PARTITION BY tenant_id ORDER BY date_created DESC NULLS LAST, id DESC) AS rk
        FROM episodes
        WHERE tenant_id = ANY(${tenantIds})
          AND (episode_type = 'full' OR episode_type IS NULL)
      )
      SELECT id, tenant_id, episode_number, title, slug, date_created
      FROM ranked
      WHERE rk <= 3
      ORDER BY tenant_id, rk
    ` as any,
    // cross-refs candidates : liens susceptibles de pointer vers un autre tenant.
    // On filtre le bruit Audiomeans/Spotify/Apple show root + link_types qui ne
    // peuvent PAS être cross-podcast (linkedin, social, audio, podcast_platform).
    // Le filtre final repose sur `isEpisodeRefCandidate(url, otherHost)` côté TS
    // (R1 host match + R2 non-racine + R3 non-utilitaire).
    sql`
      SELECT el.episode_id, el.url, el.link_type, e.tenant_id AS from_tenant,
             e.episode_number, e.title
      FROM episode_links el
      JOIN episodes e ON e.id = el.episode_id
      WHERE e.tenant_id = ANY(${tenantIds})
        AND el.url IS NOT NULL
        AND el.url NOT LIKE '%audiomeans.fr/politique%'
        AND el.url !~ '(spotify\.com/show/[^/]+|apple\.com/.*/podcast/[^/]+/id[0-9]+)$'
        AND el.link_type NOT IN ('linkedin', 'social', 'audio', 'podcast_platform')
    ` as any,
    getCrossGuests({ sharedOnly: true, limit: 20 }),
  ]);

  // 3. Monter les podcasts[].
  const statsByTenant = new Map<string, any>();
  for (const r of statsRows as any[]) statsByTenant.set(r.tenant_id, r);

  const featuredByTenant = new Map<string, UniversePodcast['featured']>();
  for (const r of featuredRows as any[]) {
    const list = featuredByTenant.get(r.tenant_id) || [];
    list.push({
      id: Number(r.id),
      episode_number: r.episode_number != null ? Number(r.episode_number) : null,
      title: r.title,
      slug: r.slug || null,
      pubDate: r.date_created ? new Date(r.date_created).toISOString().slice(0, 10) : null,
    });
    featuredByTenant.set(r.tenant_id, list);
  }

  const podcasts: UniversePodcast[] = configs.map((c) => {
    const s = statsByTenant.get(c.database.tenantId) || {};
    const domain = c.deploy?.domain || `${c.deploy.vercelProject}.vercel.app`;
    return {
      id: c.id,
      name: c.name,
      tagline: c.tagline,
      host: c.host,
      producer: c.producer,
      website: c.website,
      siteUrl: `https://${domain}`,
      description: c.description,
      branding: c.branding,
      hub_order: c.hub_order ?? null,
      stats: {
        episodes: Number(s.episodes || 0),
        hours: Math.round(Number(s.total_seconds || 0) / 3600),
        guests: Number(s.guests || 0),
        articles: Number(s.articles || 0),
        lastEpisodeDate: s.last_episode_date
          ? new Date(s.last_episode_date).toISOString().slice(0, 10)
          : null,
      },
      featured: featuredByTenant.get(c.database.tenantId) || [],
    };
  });

  // 4. Cross-refs : URL-matching runtime.
  //    Pour chaque lien source, on teste si son URL matche le websiteHost d'un AUTRE
  //    tenant via isEpisodeRefCandidate(url, otherHost). Si oui → ref cross-podcast.
  const hostByTenant = new Map<string, string>();
  for (const c of configs) {
    const h = websiteHostFromUrl(c.website);
    if (h) hostByTenant.set(c.database.tenantId, h);
  }

  const pairMap = new Map<string, number>(); // "from→to" → count
  const episodeRefs: UniverseCrossEpisodeRef[] = [];
  const MAX_REFS = 50;

  for (const r of crossRefsRaw as any[]) {
    const fromTenant = r.from_tenant as string;
    const url = r.url as string;
    for (const [toTenant, toHost] of hostByTenant) {
      if (toTenant === fromTenant) continue;
      if (isEpisodeRefCandidate(url, toHost)) {
        const key = `${fromTenant}→${toTenant}`;
        pairMap.set(key, (pairMap.get(key) ?? 0) + 1);
        if (episodeRefs.length < MAX_REFS) {
          episodeRefs.push({
            from: {
              podcast: fromTenant,
              episodeId: Number(r.episode_id),
              episodeNumber: r.episode_number != null ? Number(r.episode_number) : null,
              title: r.title,
            },
            to: { podcast: toTenant, url },
          });
        }
        break; // un lien matche au plus un tenant (hosts distincts)
      }
    }
  }

  const pairStats: UniversePairStat[] = [...pairMap.entries()]
    .map(([k, count]) => {
      const [from, to] = k.split('→');
      return { from, to, count };
    })
    .sort((a, b) => b.count - a.count);

  // 5. Cross-guests : transforme le résultat de getCrossGuests.
  const guests: UniverseCrossGuest[] = (crossGuestsRaw as any).guests.map((g: any) => ({
    canonical: g.name,
    podcasts: g.appearances.map((a: any) => a.podcast),
    count: g.total_episodes,
    appearances: g.appearances.flatMap((a: any) =>
      a.episodes.map((ep: any) => ({
        podcast: a.podcast,
        podcast_name: a.podcast_name,
        episodeNumber: ep.number,
        title: ep.title,
      })),
    ),
  }));

  // 6. Totals.
  const totalEpisodes = podcasts.reduce((s, p) => s + p.stats.episodes, 0);
  const totalHours = podcasts.reduce((s, p) => s + p.stats.hours, 0);
  const totalGuests = podcasts.reduce((s, p) => s + p.stats.guests, 0);
  const crossEpisodeRefs = pairStats.reduce((s, p) => s + p.count, 0);
  const producers = Array.from(new Set(configs.map((c) => c.producer))).sort();

  return {
    universe: {
      id: 'ms',
      name: 'Univers MS',
      tagline: `${podcasts.length} podcasts, un écosystème.`,
      producers,
      totals: {
        podcasts: podcasts.length,
        episodes: totalEpisodes,
        hours: totalHours,
        guests: totalGuests,
        crossGuests: (crossGuestsRaw as any).total,
        crossEpisodeRefs,
      },
    },
    podcasts,
    cross: {
      guests,
      episodeRefs,
      pairStats,
    },
  };
}
