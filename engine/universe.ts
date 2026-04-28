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
import { decidePairStatsRendering, type PairStatsRenderingDecision } from './cross/pair-stats-rendering';

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
      briefedGuests: number;
    };
  };
  podcasts: UniversePodcast[];
  cross: {
    guests: UniverseCrossGuest[];
    episodeRefs: UniverseCrossEpisodeRef[];
    pairStats: UniversePairStat[];
    /**
     * Décision de rendu pour le frontend (Phase A re-codée).
     * Si `pairStatsRendering.mode === 'fallback'`, le frontend doit afficher le
     * fallback explicite + l'amorce `pairStatsRendering.starter` (top 3) plutôt
     * que la liste complète `pairStats`.
     */
    pairStatsRendering: PairStatsRenderingDecision;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

export async function getUniverse(): Promise<UniverseResponse> {
  const sql = sqlClient();

  // 1. Résoudre les tenants hub-éligibles (hors 'hub' lui-même) triés par hub_order.
  // On garde aussi la config 'hub' à part pour récupérer la tagline éditoriale
  // (sinon le hero `<n> podcasts, un écosystème` dupliquerait avec une tagline
  // générée identique — Bug #4 Phase J).
  const allConfigs = getAllConfigs();
  const hubCfg = allConfigs.find((c) => c.id === 'hub');
  const configs = allConfigs
    .filter((c) => c.id !== 'hub')
    .sort((a, b) => {
      const oa = a.hub_order ?? Number.POSITIVE_INFINITY;
      const ob = b.hub_order ?? Number.POSITIVE_INFINITY;
      return oa - ob;
    });
  const tenantIds = configs.map((c) => c.database.tenantId);

  // 2. Queries parallèles : stats + featured + cross-refs raw + cross-guests + briefs count.
  const [statsRows, featuredRows, crossRefsRaw, crossGuestsRaw, briefsCountRow] = await Promise.all([
    sql`
      -- Stats hero hub : double filtre iTunes (episode_type) + éditorial
      -- (editorial_type, Phase A.5.4) pour compter uniquement les "vrais"
      -- épisodes pleins, pas les bonus iTunes ni les extracts/teasers/hs/rediffs
      -- éditoriaux. Cf. engine/util/classify-editorial-type.ts pour la
      -- sémantique des deux colonnes.
      SELECT
        tenant_id,
        count(*) FILTER (WHERE (episode_type = 'full' OR episode_type IS NULL) AND editorial_type = 'full')::int AS episodes,
        count(*) FILTER (WHERE (episode_type = 'full' OR episode_type IS NULL) AND editorial_type = 'full' AND episode_number IS NOT NULL)::int AS true_full_with_ep,
        max(episode_number) FILTER (WHERE (episode_type = 'full' OR episode_type IS NULL) AND editorial_type = 'full' AND episode_number IS NOT NULL)::int AS max_full_ep_num,
        COALESCE(SUM(duration_seconds) FILTER (WHERE (episode_type = 'full' OR episode_type IS NULL) AND editorial_type = 'full'), 0)::bigint AS total_seconds,
        count(DISTINCT lower(trim(COALESCE(NULLIF(guest, ''), guest_from_title))))
          FILTER (WHERE COALESCE(NULLIF(guest, ''), guest_from_title) IS NOT NULL AND editorial_type = 'full')::int AS guests,
        count(*) FILTER (WHERE article_content IS NOT NULL AND length(article_content) > 500 AND editorial_type = 'full')::int AS articles,
        max(date_created) FILTER (WHERE editorial_type = 'full')::date AS last_episode_date
      FROM episodes
      WHERE tenant_id = ANY(${tenantIds})
      GROUP BY tenant_id
    ` as any,
    sql`
      -- Featured top 3 par tenant : double filtre iTunes (episode_type) +
      -- éditorial (editorial_type, Phase A.5.4). editorial_type='full' exclut
      -- automatiquement les extracts/teasers/hs/rediffs/bonus éditoriaux du
      -- featured (corrige Finscale top3 [EXTRAIT] et LP top3 #HS Monaco).
      WITH ranked AS (
        SELECT
          id, tenant_id, episode_number, title, slug, date_created,
          row_number() OVER (PARTITION BY tenant_id ORDER BY date_created DESC NULLS LAST, id DESC) AS rk
        FROM episodes
        WHERE tenant_id = ANY(${tenantIds})
          AND (episode_type = 'full' OR episode_type IS NULL)
          AND editorial_type = 'full'
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
    sql`SELECT count(*)::int AS c FROM cross_podcast_guests WHERE brief_md IS NOT NULL` as any,
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
    // Phase K (2026-04-28) — displayed_count : aligne le compteur card sur la
    // perception du producteur (dernier # publié) plutôt que sur le strict
    // count true-full. Évite les écarts visibles type "#314 mais 273 ép." qui
    // donnent l'impression d'un comptage incohérent. Règle :
    //   - ratio (true_full_with_ep / true_full) > 0.8 → max_full_ep_num
    //     (LM 314, LP 376, OLR 45, GDIY 537, Finscale 338, etc.)
    //   - sinon → count true-full strict (IFTTD ratio 0.01 → 700,
    //     fleurons ratio 0.67 → 3 ; numérotation partielle ou catalogue jeune)
    // Note hero : `data.universe.totals.episodes` reste la somme des true-full
    // counts (compte réel agrégé). La somme des cards peut différer légèrement
    // du hero — accepté comme edge case, le visiteur ne fait pas l'addition.
    const trueFullCount = Number(s.episodes || 0);
    const trueFullWithEp = Number(s.true_full_with_ep || 0);
    const maxFullEp = s.max_full_ep_num != null ? Number(s.max_full_ep_num) : null;
    const ratio = trueFullCount > 0 ? trueFullWithEp / trueFullCount : 0;
    const displayedCount = ratio > 0.8 && maxFullEp != null ? maxFullEp : trueFullCount;
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
        episodes: displayedCount,
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
  // Phase K (2026-04-28) — hero `totals.episodes` reste basé sur la somme
  // STRICTE des true-full counts (pas sur displayedCount). Pourquoi : le
  // hero représente l'agrégat éditorial réel (somme des "vrais" eps), tandis
  // que les cards affichent la perception producteur (dernier # publié).
  // Edge case accepté : la somme des cards peut différer légèrement du hero.
  const totalEpisodes = configs.reduce((sum, c) => {
    const s = statsByTenant.get(c.database.tenantId) || {};
    return sum + Number(s.episodes || 0);
  }, 0);
  const totalHours = podcasts.reduce((s, p) => s + p.stats.hours, 0);
  const totalGuests = podcasts.reduce((s, p) => s + p.stats.guests, 0);
  const crossEpisodeRefs = pairStats.reduce((s, p) => s + p.count, 0);
  const producers = Array.from(new Set(configs.map((c) => c.producer))).sort();

  return {
    universe: {
      id: 'ms',
      name: 'Univers MS',
      // Phase J Bug #4 (2026-04-28) — tagline éditoriale distincte du h1 hero
      // ("<n> podcasts, un écosystème" affiché statiquement par le frontend).
      // On expose la tagline du hub.config.ts (Phase A.5.3 : "L'écosystème
      // podcast Matthieu Stefani × Orso Media : business, finance,
      // investissement, entrepreneuriat."). Fallback safe si config hub absente.
      tagline: hubCfg?.tagline || `${podcasts.length} podcast${podcasts.length > 1 ? 's' : ''}, un écosystème.`,
      producers,
      totals: {
        podcasts: podcasts.length,
        episodes: totalEpisodes,
        hours: totalHours,
        guests: totalGuests,
        crossGuests: (crossGuestsRaw as any).total,
        crossEpisodeRefs,
        briefedGuests: Number((briefsCountRow as any[])[0]?.c || 0),
      },
    },
    podcasts,
    cross: {
      guests,
      episodeRefs,
      pairStats,
      pairStatsRendering: decidePairStatsRendering(pairStats),
    },
  };
}
