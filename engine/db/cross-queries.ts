import { neon } from '@neondatabase/serverless';
import { getAllConfigs } from '../config/index';
import { buildExclusions, type LinkedinExclusions } from '../scraping/linkedin-filter';
import { isValidPersonName } from '../cross/is-valid-person-name';

// ============================================================================
// Cross-tenant queries — agrègent TOUS les podcasts présents en DB.
//
// Depuis l'itération dynamique (2026-04-19), TENANTS, TENANT_META et
// HOSTS_NORMALIZED sont populés au premier appel via `initUniverse()` qui
// lit `podcast_metadata` (tenants actifs) et recoupe avec les configs
// statiques (`engine/config/index.ts::getAllConfigs`) pour name/host/url.
//
// Toute fonction exportée doit appeler `await ensureUniverseInit()` avant
// de lire ces tableaux — sinon ils seront vides.
// ============================================================================

export type TenantId = string;

export const TENANTS: string[] = [];
export const TENANT_META: Record<string, { name: string; url: string }> = {};
export const HOSTS_NORMALIZED: string[] = [];
// Slugs LinkedIn dérivés des hosts (ex: "Matthieu Stefani" → ["matthieustefani", "matthieu-stefani"]).
// Utilisés pour filtrer les URLs linkedin.com/in/<slug> qui appartiennent aux hosts
// (pas des invités) dans populate-guests et cross-queries.
// DEPRECATED depuis 2026-04-25 (LinkedIn pollution fix) : ce tableau est l'union
// PLATE de tous les host slugs cross-tenant — il ne distingue pas hosts vs
// parasites, et ne supporte pas le cas host-as-guest. Préférer
// `LINKEDIN_EXCLUSIONS_PER_TENANT[tenant]` + `pickGuestLinkedin()`.
export const HOST_LINKEDIN_SLUGS: string[] = [];
// Patterns SQL LIKE dérivés de HOSTS_NORMALIZED (ex: "%matthieu stefani%").
// Prêts à être injectés dans `NOT (col LIKE ANY(${HOST_NAME_PATTERNS}))`.
export const HOST_NAME_PATTERNS: string[] = [];
// Exclusions LinkedIn complètes par tenant — populé depuis cfg.scraping.linkedinExclusions
// et fallback `deriveSlugsFromName(host + coHosts)` quand non configuré.
// Inclut hostNames (pour test host-as-guest dans pickGuestLinkedin).
export const LINKEDIN_EXCLUSIONS_PER_TENANT: Record<string, LinkedinExclusions> = {};

let _initPromise: Promise<void> | null = null;

function normalizeHost(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Dérive les trois tableaux de filtres hosts depuis une liste brute de noms
 * (host + co-hosts de toutes les configs). Pure — testable sans DB.
 *
 * Retourne :
 *   - normalized     : hosts normalisés (sans accents + lower) + raw lower si différent
 *   - linkedinSlugs  : variantes LinkedIn (joined "matthieustefani" + kebab "matthieu-stefani")
 *   - namePatterns   : `%host%` prêts pour SQL `LIKE ALL/ANY(…)`
 */
export function deriveHostFilters(rawHosts: string[]): {
  normalized: string[];
  linkedinSlugs: string[];
  namePatterns: string[];
} {
  const normalized: string[] = [];
  const linkedinSlugs: string[] = [];
  for (const raw of rawHosts) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const norm = normalizeHost(raw);
    if (norm && !normalized.includes(norm)) normalized.push(norm);
    const rawLower = raw.toLowerCase().trim();
    if (rawLower !== norm && !normalized.includes(rawLower)) normalized.push(rawLower);
    if (norm) {
      const joined = norm.replace(/\s+/g, '');
      const kebab = norm.replace(/\s+/g, '-');
      if (joined && !linkedinSlugs.includes(joined)) linkedinSlugs.push(joined);
      if (kebab !== joined && !linkedinSlugs.includes(kebab)) linkedinSlugs.push(kebab);
    }
  }
  const namePatterns = normalized.map(h => `%${h}%`);
  return { normalized, linkedinSlugs, namePatterns };
}

/**
 * Initialise TENANTS / TENANT_META / HOSTS_NORMALIZED depuis la DB.
 * Idempotent — cache une seule promesse pour toute la durée du process.
 * À appeler en tête de chaque fonction exportée de ce module.
 */
export async function ensureUniverseInit(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const sql = sqlClient();
    let rows: any[] = [];
    try {
      rows = (await sql`
        SELECT DISTINCT tenant_id
        FROM podcast_metadata
        WHERE tenant_id IS NOT NULL
        ORDER BY tenant_id
      `) as any[];
    } catch (_e) {
      rows = [];
    }
    // Fallback : tenants avec au moins un episode en DB
    if (!rows.length) {
      try {
        rows = (await sql`
          SELECT DISTINCT tenant_id
          FROM episodes
          WHERE tenant_id IS NOT NULL
          ORDER BY tenant_id
        `) as any[];
      } catch (_e) { /* ignore */ }
    }

    const tenantIds: string[] = rows.map((r: any) => r.tenant_id).filter(Boolean);

    TENANTS.length = 0;
    for (const k of Object.keys(TENANT_META)) delete TENANT_META[k];
    HOSTS_NORMALIZED.length = 0;
    HOST_LINKEDIN_SLUGS.length = 0;
    HOST_NAME_PATTERNS.length = 0;
    for (const k of Object.keys(LINKEDIN_EXCLUSIONS_PER_TENANT)) delete LINKEDIN_EXCLUSIONS_PER_TENANT[k];

    // Indexe les configs par id pour enrichir TENANT_META / HOSTS_NORMALIZED
    const configsById = new Map<string, any>();
    try {
      for (const c of getAllConfigs()) configsById.set(c.id, c);
    } catch (_e) { /* configs non chargeables = ignore */ }

    // Collecte tous les hosts (host + coHosts) depuis les configs chargées.
    const rawHosts: string[] = [];
    for (const id of tenantIds) {
      TENANTS.push(id);
      const cfg = configsById.get(id);
      const name = cfg?.name || id;
      const domain = cfg?.deploy?.domain || `${id}-v2.vercel.app`;
      TENANT_META[id] = { name, url: `https://${domain}` };
      if (cfg?.host) rawHosts.push(cfg.host);
      if (Array.isArray(cfg?.coHosts)) rawHosts.push(...cfg.coHosts);

      // Per-tenant LinkedIn exclusions (config explicite + fallback dérivés du host).
      if (cfg?.host) {
        LINKEDIN_EXCLUSIONS_PER_TENANT[id] = buildExclusions({
          hostName: cfg.host,
          coHosts: Array.isArray(cfg.coHosts) ? cfg.coHosts : [],
          configHosts: cfg.scraping?.linkedinExclusions?.hosts,
          configParasites: cfg.scraping?.linkedinExclusions?.parasites,
        });
      }
    }

    const filters = deriveHostFilters(rawHosts);
    HOSTS_NORMALIZED.push(...filters.normalized);
    HOST_LINKEDIN_SLUGS.push(...filters.linkedinSlugs);
    HOST_NAME_PATTERNS.push(...filters.namePatterns);
  })();
  return _initPromise;
}

/** Réinitialise le cache — utile dans les tests. */
export function _resetUniverseForTest(): void {
  _initPromise = null;
  TENANTS.length = 0;
  for (const k of Object.keys(TENANT_META)) delete TENANT_META[k];
  HOSTS_NORMALIZED.length = 0;
  HOST_LINKEDIN_SLUGS.length = 0;
  HOST_NAME_PATTERNS.length = 0;
  for (const k of Object.keys(LINKEDIN_EXCLUSIONS_PER_TENANT)) delete LINKEDIN_EXCLUSIONS_PER_TENANT[k];
}

function sqlClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('[cross-queries] DATABASE_URL not set');
  return neon(url);
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function isHost(name: string): boolean {
  const n = normalizeName(name);
  return HOSTS_NORMALIZED.some(h => n.includes(h));
}

// ============================================================================
// /api/cross/stats
// ============================================================================

export async function getCrossStats() {
  await ensureUniverseInit();
  const sql = sqlClient();
  const tenants = [...TENANTS];

  const perPodcast = await Promise.all(tenants.map(async (t) => {
    const [epsRow, guestsRow] = await Promise.all([
      sql`
        SELECT count(*)::int AS episodes,
               COALESCE(SUM(duration_seconds), 0)::bigint AS total_seconds
        FROM episodes
        WHERE tenant_id = ${t}
          AND (episode_type = 'full' OR episode_type IS NULL)
      `,
      sql`
        SELECT count(DISTINCT lower(trim(COALESCE(NULLIF(guest, ''), guest_from_title))))::int AS c
        FROM episodes
        WHERE tenant_id = ${t}
          AND COALESCE(NULLIF(guest, ''), guest_from_title) IS NOT NULL
      `,
    ]) as any[];
    return {
      id: t,
      name: TENANT_META[t].name,
      url: TENANT_META[t].url,
      episodes: Number(epsRow[0]?.episodes || 0),
      hours: Math.round(Number(epsRow[0]?.total_seconds || 0) / 3600),
      guests: Number(guestsRow[0]?.c || 0),
    };
  }));

  // Agrégats cross-tenant
  const [linksRow, quizRow, crossRefRow, uniqueGuestsRow, sharedGuestsRow, sponsorsRow] = await Promise.all([
    sql`SELECT count(*)::int AS c FROM episode_links WHERE tenant_id = ANY(${tenants})` as any,
    sql`SELECT count(*)::int AS c FROM quiz_questions WHERE tenant_id = ANY(${tenants})` as any,
    sql`
      SELECT count(*)::int AS c FROM episodes e,
        LATERAL jsonb_array_elements(e.cross_refs) AS elem
      WHERE e.tenant_id = ANY(${tenants})
        AND e.cross_refs IS NOT NULL
        AND (
          (e.tenant_id = 'lamartingale' AND lower(elem->>'podcast') LIKE '%gdiy%')
          OR
          (e.tenant_id = 'gdiy' AND lower(elem->>'podcast') LIKE '%martingale%')
        )
    ` as any,
    sql`
      SELECT count(*)::int AS c FROM (
        SELECT lower(trim(COALESCE(NULLIF(guest, ''), guest_from_title))) AS g
        FROM episodes
        WHERE tenant_id = ANY(${tenants})
          AND COALESCE(NULLIF(guest, ''), guest_from_title) IS NOT NULL
        GROUP BY g
      ) sub
    ` as any,
    sql`
      WITH guests_per_tenant AS (
        SELECT tenant_id,
               lower(trim(COALESCE(NULLIF(guest, ''), guest_from_title))) AS g
        FROM episodes
        WHERE tenant_id = ANY(${tenants})
          AND COALESCE(NULLIF(guest, ''), guest_from_title) IS NOT NULL
        GROUP BY tenant_id, g
      )
      SELECT count(*)::int AS c FROM (
        SELECT g FROM guests_per_tenant
        WHERE g NOT LIKE ALL(${HOST_NAME_PATTERNS}::text[])
        GROUP BY g HAVING count(DISTINCT tenant_id) >= 2
      ) sub
    ` as any,
    sql`
      SELECT count(*)::int AS c FROM (
        SELECT lower(trim(label)) AS n
        FROM episode_links
        WHERE tenant_id = ANY(${tenants})
          AND link_type IN ('company', 'tool')
          AND label IS NOT NULL
          AND length(trim(label)) BETWEEN 2 AND 40
        GROUP BY lower(trim(label))
        HAVING count(DISTINCT tenant_id) >= 2
      ) shared
    ` as any,
  ]);

  return {
    podcasts: perPodcast,
    combined: {
      total_episodes: perPodcast.reduce((s, p) => s + p.episodes, 0),
      total_hours: perPodcast.reduce((s, p) => s + p.hours, 0),
      total_guests_unique: Number((uniqueGuestsRow as any[])[0]?.c || 0),
      total_links: Number((linksRow as any[])[0]?.c || 0),
      total_quiz: Number((quizRow as any[])[0]?.c || 0),
      shared_guests_count: Number((sharedGuestsRow as any[])[0]?.c || 0),
      cross_references_count: Number((crossRefRow as any[])[0]?.c || 0),
      total_sponsors_unique: Number((sponsorsRow as any[])[0]?.c || 0),
    },
  };
}

// ============================================================================
// /api/cross/guests  +  /api/cross/guests/shared
// ============================================================================

interface UnifiedGuest {
  name: string;
  bio: string | null;
  linkedin_url: string | null;
  appearances: {
    podcast: string;
    podcast_name: string;
    episodes: {
      number: number | null;
      title: string;
      date: string | null;
      pillar: string | null;
    }[];
  }[];
  total_episodes: number;
  podcasts_count: number;
  is_cross_podcast: boolean;
  pillars_covered: string[];
}

export async function getCrossGuests(opts: { sharedOnly?: boolean; limit?: number } = {}): Promise<{ guests: UnifiedGuest[]; total: number }> {
  await ensureUniverseInit();
  const sql = sqlClient();
  const tenants = [...TENANTS];

  // Pull all episodes with their guest and metadata
  const rows = await sql`
    SELECT
      e.tenant_id,
      e.episode_number,
      e.title,
      e.date_created,
      e.pillar,
      COALESCE(NULLIF(e.guest, ''), e.guest_from_title) AS guest_raw,
      g.bio,
      g.linkedin_url
    FROM episodes e
    LEFT JOIN guests g ON g.tenant_id = e.tenant_id
      AND lower(trim(g.name)) = lower(trim(COALESCE(NULLIF(e.guest, ''), e.guest_from_title)))
    WHERE e.tenant_id = ANY(${tenants})
      AND COALESCE(NULLIF(e.guest, ''), e.guest_from_title) IS NOT NULL
      AND (e.episode_type = 'full' OR e.episode_type IS NULL)
    ORDER BY e.episode_number DESC
  ` as any[];

  // Grouper par nom normalisé
  const byNorm = new Map<string, {
    displayName: string;
    bios: string[];
    linkedins: string[];
    byTenant: Map<string, UnifiedGuest['appearances'][0]['episodes']>;
    pillars: Set<string>;
  }>();

  for (const r of rows) {
    const raw = (r.guest_raw || '').trim();
    if (!raw) continue;
    if (isHost(raw)) continue;
    // Phase I3 (2026-04-28) — applique le même filtre isValidPersonName
    // que match-guests.ts (Phase B3). Sans ça, le hub /api/universe affichait
    // "Jean" en 1ère position de la liste "X invités partagés" car
    // getCrossGuests ne filtrait que sur length < 3, pas sur les patterns
    // structurels (single-word, RSS markers, etc.). Cohérence avec le
    // filtre INSERT-time de cross_podcast_guests.
    if (!isValidPersonName(raw)) continue;
    const norm = normalizeName(raw);
    if (norm.length < 3) continue;

    let entry = byNorm.get(norm);
    if (!entry) {
      entry = {
        displayName: raw,
        bios: [],
        linkedins: [],
        byTenant: new Map(),
        pillars: new Set(),
      };
      byNorm.set(norm, entry);
    }

    if (r.bio && typeof r.bio === 'string' && r.bio.length > (entry.bios[0]?.length || 0)) {
      entry.bios[0] = r.bio;
    }
    if (r.linkedin_url && !entry.linkedins.includes(r.linkedin_url)) {
      entry.linkedins.push(r.linkedin_url);
    }
    if (r.pillar) entry.pillars.add(r.pillar);

    const list = entry.byTenant.get(r.tenant_id) || [];
    list.push({
      number: r.episode_number,
      title: r.title,
      date: r.date_created ? new Date(r.date_created).toISOString().slice(0, 10) : null,
      pillar: r.pillar || null,
    });
    entry.byTenant.set(r.tenant_id, list);
  }

  // Convertir en UnifiedGuest[]
  let unified: UnifiedGuest[] = Array.from(byNorm.values()).map(v => {
    const appearances = Array.from(v.byTenant.entries()).map(([tid, eps]) => ({
      podcast: tid,
      podcast_name: TENANT_META[tid as TenantId]?.name || tid,
      episodes: eps,
    }));
    const totalEps = appearances.reduce((s, a) => s + a.episodes.length, 0);
    return {
      name: v.displayName,
      bio: v.bios[0] || null,
      linkedin_url: v.linkedins[0] || null,
      appearances,
      total_episodes: totalEps,
      podcasts_count: appearances.length,
      is_cross_podcast: appearances.length >= 2,
      pillars_covered: Array.from(v.pillars),
    };
  });

  if (opts.sharedOnly) {
    unified = unified.filter(g => g.is_cross_podcast);
  }

  // Tri : cross-podcast d'abord, puis nb d'episodes décroissant
  unified.sort((a, b) => {
    if (a.is_cross_podcast !== b.is_cross_podcast) return a.is_cross_podcast ? -1 : 1;
    return b.total_episodes - a.total_episodes;
  });

  const total = unified.length;
  if (opts.limit && opts.limit > 0) unified = unified.slice(0, opts.limit);

  return { guests: unified, total };
}

export async function getCrossGuestByName(name: string): Promise<UnifiedGuest | null> {
  const { guests } = await getCrossGuests({});
  const norm = normalizeName(name);
  return guests.find(g => normalizeName(g.name) === norm) || null;
}

// ============================================================================
// /api/cross/search — hybrid search sur TOUS les tenants
// ============================================================================

export async function crossSearch(query: string, limit: number = 20): Promise<{
  query: string;
  results: Array<{
    podcast: string;
    podcast_name: string;
    episode_number: number;
    title: string;
    guest: string | null;
    pillar: string | null;
    score: number;
    snippet: string;
  }>;
  timing_ms: number;
}> {
  const t0 = Date.now();
  await ensureUniverseInit();
  const sql = sqlClient();
  const tenants = [...TENANTS];
  const OpenAI = (await import('openai')).default;

  let embedding: number[] | null = null;
  if (process.env.OPENAI_API_KEY) {
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const resp = await openai.embeddings.create({
        model: 'text-embedding-3-large',
        input: query,
        dimensions: 3072,
      });
      embedding = resp.data[0].embedding;
    } catch {
      embedding = null;
    }
  }

  let rows: any[];
  if (embedding) {
    const embVec = `[${embedding.join(',')}]`;
    rows = await sql`
      SELECT e.tenant_id, e.episode_number, e.title, e.guest, e.pillar, e.abstract,
             1 - (en.embedding <=> ${embVec}::vector) AS score
      FROM episodes e
      INNER JOIN episodes_enrichment en ON en.episode_id = e.id
      WHERE en.embedding IS NOT NULL
        AND e.tenant_id = ANY(${tenants})
      ORDER BY en.embedding <=> ${embVec}::vector
      LIMIT ${limit}
    ` as any[];
  } else {
    // Fallback lexical (pg_trgm) si pas d'embedding
    rows = await sql`
      SELECT e.tenant_id, e.episode_number, e.title, e.guest, e.pillar, e.abstract,
             greatest(
               similarity(lower(e.title), lower(${query})),
               similarity(lower(coalesce(e.abstract, '')), lower(${query})),
               similarity(lower(coalesce(e.guest, '')), lower(${query}))
             ) AS score
      FROM episodes e
      WHERE e.tenant_id = ANY(${tenants})
      ORDER BY score DESC
      LIMIT ${limit}
    ` as any[];
  }

  return {
    query,
    results: rows.map((r: any) => ({
      podcast: r.tenant_id,
      podcast_name: TENANT_META[r.tenant_id as TenantId]?.name || r.tenant_id,
      episode_number: r.episode_number,
      title: r.title,
      guest: r.guest || null,
      pillar: r.pillar || null,
      score: Number(r.score || 0),
      snippet: (r.abstract || '').slice(0, 200),
    })),
    timing_ms: Date.now() - t0,
  };
}

// ============================================================================
// /api/cross/references
// ============================================================================

export async function getCrossReferences() {
  await ensureUniverseInit();
  const sql = sqlClient();

  // Les refs cross-podcast vivent dans episodes.cross_refs (jsonb) : éléments
  // avec {podcast: "gdiy"|"la martingale"}. On filtre "other podcast" selon le
  // tenant source.
  const rows = await sql`
    SELECT e.tenant_id AS source_tenant,
           e.episode_number AS source_episode,
           e.title AS source_title,
           elem->>'podcast' AS target_podcast_raw,
           elem->>'episode_ref' AS episode_ref,
           elem->>'url' AS url
    FROM episodes e,
         LATERAL jsonb_array_elements(e.cross_refs) AS elem
    WHERE e.tenant_id = ANY(${[...TENANTS]})
      AND e.cross_refs IS NOT NULL
      AND (
        (e.tenant_id = 'lamartingale' AND lower(elem->>'podcast') LIKE '%gdiy%')
        OR
        (e.tenant_id = 'gdiy' AND lower(elem->>'podcast') LIKE '%martingale%')
      )
    ORDER BY e.episode_number DESC
    LIMIT 300
  ` as any[];

  const fromLmToGdiy: any[] = [];
  const fromGdiyToLm: any[] = [];

  for (const r of rows) {
    const entry = {
      source_tenant: r.source_tenant,
      source_episode: r.source_episode,
      source_title: r.source_title,
      target_podcast: r.target_podcast_raw,
      episode_ref: r.episode_ref,
      url: r.url,
    };
    if (r.source_tenant === 'lamartingale') fromLmToGdiy.push(entry);
    else if (r.source_tenant === 'gdiy') fromGdiyToLm.push(entry);
  }

  return {
    from_lm_to_gdiy: fromLmToGdiy,
    from_gdiy_to_lm: fromGdiyToLm,
    stats: {
      lm_to_gdiy: fromLmToGdiy.length,
      gdiy_to_lm: fromGdiyToLm.length,
      total: fromLmToGdiy.length + fromGdiyToLm.length,
    },
  };
}

// ============================================================================
// /api/cross/sponsors
// ============================================================================

export async function getCrossSponsors() {
  await ensureUniverseInit();
  const sql = sqlClient();

  const rows = await sql`
    SELECT
      lower(trim(label)) AS norm_label,
      max(label) AS label,
      tenant_id,
      count(*)::int AS mentions,
      count(DISTINCT episode_id)::int AS episodes_count
    FROM episode_links
    WHERE tenant_id = ANY(${[...TENANTS]})
      AND link_type IN ('company', 'tool')
      AND label IS NOT NULL
      AND length(trim(label)) BETWEEN 2 AND 40
      AND label ~ '[A-Za-z]'
      AND label !~* '^(ce |c''est |cliquez|voir |écoutez|découvr|https?://|le podcast|tous|ici|lien|site)'
      AND label !~* '(podcast|orso media|cosavostra|deezer|spotify|apple|youtube|apple podcasts|google podcasts|la martingale|génération do it)'
    GROUP BY norm_label, tenant_id
  ` as any[];

  // Pivot par sponsor
  const byLabel = new Map<string, { label: string; tenants: Map<string, number>; total: number }>();
  for (const r of rows) {
    const key = r.norm_label;
    let entry = byLabel.get(key);
    if (!entry) {
      entry = { label: r.label, tenants: new Map(), total: 0 };
      byLabel.set(key, entry);
    }
    entry.tenants.set(r.tenant_id, Number(r.mentions));
    entry.total += Number(r.mentions);
  }

  // Ne garder que ceux mentionnés dans 2+ podcasts
  const sponsors = Array.from(byLabel.values())
    .filter(s => s.tenants.size >= 2)
    .map(s => {
      const perPodcast: Record<string, number> = {};
      for (const [t, n] of s.tenants) perPodcast[t] = n;
      return {
        name: s.label,
        podcasts: Array.from(s.tenants.keys()),
        total_mentions: s.total,
        per_podcast: perPodcast,
      };
    })
    .sort((a, b) => b.total_mentions - a.total_mentions)
    .slice(0, 50);

  return { sponsors, total: sponsors.length };
}

// ============================================================================
// /api/cross/timeline
// ============================================================================

export async function getCrossTimeline(opts: { limit?: number } = {}) {
  await ensureUniverseInit();
  const sql = sqlClient();
  const limit = opts.limit || 500;
  const rows = await sql`
    SELECT tenant_id,
           episode_number,
           title,
           COALESCE(NULLIF(guest, ''), guest_from_title) AS guest,
           date_created
    FROM episodes
    WHERE tenant_id = ANY(${[...TENANTS]})
      AND date_created IS NOT NULL
      AND (episode_type = 'full' OR episode_type IS NULL)
    ORDER BY date_created DESC
    LIMIT ${limit}
  ` as any[];

  return {
    timeline: rows.map((r: any) => ({
      date: new Date(r.date_created).toISOString().slice(0, 10),
      podcast: r.tenant_id,
      podcast_name: TENANT_META[r.tenant_id as TenantId]?.name || r.tenant_id,
      episode_number: r.episode_number,
      title: r.title,
      guest: r.guest || null,
    })),
    total: rows.length,
  };
}

// ============================================================================
// /api/episodes/:id/cross-similar — recos cross-podcast pour un épisode donné
// ============================================================================

export async function getCrossSimilarEpisodes(episodeId: number, limit: number = 5) {
  await ensureUniverseInit();
  const sql = sqlClient();

  // Récupère embedding de l'épisode source + son tenant
  const srcRows = await sql`
    SELECT e.tenant_id, e.episode_number, e.title, en.embedding
    FROM episodes e
    INNER JOIN episodes_enrichment en ON en.episode_id = e.id
    WHERE e.id = ${episodeId}
      AND en.embedding IS NOT NULL
    LIMIT 1
  ` as any[];
  if (!srcRows.length) return { source: null, recommendations: [] };
  const src = srcRows[0];
  const otherTenants = TENANTS.filter(t => t !== src.tenant_id);
  if (!otherTenants.length) return { source: { tenant_id: src.tenant_id, episode_number: src.episode_number, title: src.title }, recommendations: [] };

  // Search similar in OTHER tenants by cosine distance
  const rows = await sql`
    SELECT e.id,
           e.tenant_id,
           e.episode_number,
           e.title,
           e.guest,
           e.pillar,
           e.abstract,
           1 - (en.embedding <=> ${src.embedding}::vector) AS score
    FROM episodes e
    INNER JOIN episodes_enrichment en ON en.episode_id = e.id
    WHERE en.embedding IS NOT NULL
      AND e.tenant_id = ANY(${[...otherTenants]})
      AND (e.episode_type = 'full' OR e.episode_type IS NULL)
    ORDER BY en.embedding <=> ${src.embedding}::vector
    LIMIT ${limit}
  ` as any[];

  return {
    source: { tenant_id: src.tenant_id, episode_number: src.episode_number, title: src.title },
    recommendations: rows.map((r: any) => ({
      id: r.id,
      podcast: r.tenant_id,
      podcast_name: TENANT_META[r.tenant_id as TenantId]?.name || r.tenant_id,
      podcast_url: TENANT_META[r.tenant_id as TenantId]?.url || null,
      episode_number: r.episode_number,
      title: r.title,
      guest: r.guest || null,
      pillar: r.pillar || null,
      score: Number(r.score || 0),
      snippet: (r.abstract || '').slice(0, 180),
    })),
  };
}

// ============================================================================
// /api/cross/chat — RAG sur TOUT l'univers (LM + GDIY)
// ============================================================================

export async function crossChat(message: string): Promise<{
  response: string;
  sources: Array<{ podcast: string; podcast_name: string; episode_number: number; title: string; guest: string | null; pillar: string | null; score: number }>;
  model: string;
  timing_ms: number;
}> {
  const t0 = Date.now();
  await ensureUniverseInit();
  const sql = sqlClient();
  const tenants = [...TENANTS];
  const OpenAI = (await import('openai')).default;

  // 1. Embedding de la question
  let embedding: number[] | null = null;
  if (process.env.OPENAI_API_KEY) {
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const r = await openai.embeddings.create({ model: 'text-embedding-3-large', input: message, dimensions: 3072 });
      embedding = r.data[0].embedding;
    } catch { embedding = null; }
  }
  if (!embedding) {
    return {
      response: 'Recherche sémantique indisponible (OPENAI_API_KEY manquante).',
      sources: [], model: 'none', timing_ms: Date.now() - t0,
    };
  }

  // 2. Top 6 épisodes sur les deux tenants
  const embVec = `[${embedding.join(',')}]`;
  const rows = await sql`
    SELECT e.tenant_id, e.episode_number, e.title, e.guest, e.pillar, e.abstract,
           e.key_takeaways, e.chapters,
           1 - (en.embedding <=> ${embVec}::vector) AS score
    FROM episodes e
    INNER JOIN episodes_enrichment en ON en.episode_id = e.id
    WHERE en.embedding IS NOT NULL
      AND e.tenant_id = ANY(${tenants})
      AND (e.episode_type = 'full' OR e.episode_type IS NULL)
    ORDER BY en.embedding <=> ${embVec}::vector
    LIMIT 6
  ` as any[];

  // 3. Contexte pour le LLM
  const contextParts = rows.map((r: any) => {
    const pod = TENANT_META[r.tenant_id as TenantId]?.name || r.tenant_id;
    const takeaways = Array.isArray(r.key_takeaways) ? r.key_takeaways.slice(0, 3).map((t: string) => `- ${t}`).join('\n') : '';
    return `[${pod} #${r.episode_number}] ${r.title}${r.guest ? ` avec ${r.guest}` : ''}${r.pillar ? ` (pilier : ${r.pillar})` : ''}
Résumé : ${(r.abstract || '').slice(0, 600)}${takeaways ? '\nPoints clés :\n' + takeaways : ''}`;
  });
  const context = contextParts.join('\n\n---\n\n');

  // 4. Génération
  const { getLLM, getModelId } = await import('../ai/llm');
  const { generateText } = await import('ai');
  const systemPrompt = `Tu es l'assistant expert de l'Univers MS — l'écosystème Matthieu Stefani qui réunit La Martingale (argent & investissement) et Génération Do It Yourself (entrepreneuriat).

Règles :
- Réponds en français, précis et structuré.
- Cite TOUJOURS le podcast d'origine : "Dans La Martingale #312..." ou "Dans GDIY #456...".
- Quand les deux podcasts traitent le sujet, croise les angles (LM = finance/investissement, GDIY = construction d'entreprise).
- Base ta réponse UNIQUEMENT sur le contexte fourni.
- Termine par 2 recos : 1 épisode LM + 1 épisode GDIY si possible.
- Pas de conseil en investissement — oriente vers les épisodes.`;

  const llm = getLLM();
  const modelId = getModelId();
  const { text } = await generateText({
    model: llm,
    system: systemPrompt,
    prompt: `Contexte (épisodes pertinents des deux podcasts) :\n\n${context}\n\n---\n\nQuestion : ${message}`,
    temperature: 0.4,
  });

  return {
    response: text,
    sources: rows.map((r: any) => ({
      podcast: r.tenant_id,
      podcast_name: TENANT_META[r.tenant_id as TenantId]?.name || r.tenant_id,
      episode_number: r.episode_number,
      title: r.title,
      guest: r.guest || null,
      pillar: r.pillar || null,
      score: Number(r.score || 0),
    })),
    model: modelId,
    timing_ms: Date.now() - t0,
  };
}

// ============================================================================
// /api/cross/analytics — agrégats pour le dashboard hub
// ============================================================================

export async function getCrossAnalytics() {
  await ensureUniverseInit();
  const sql = sqlClient();
  const tenants = [...TENANTS];

  const [hoursByPodcast, epsByMonth, sharedGuestsTop, sponsorsTop] = await Promise.all([
    sql`
      SELECT tenant_id,
             COALESCE(SUM(duration_seconds), 0)::bigint AS total_seconds,
             count(*)::int AS episodes
      FROM episodes
      WHERE tenant_id = ANY(${tenants})
        AND (episode_type = 'full' OR episode_type IS NULL)
      GROUP BY tenant_id
    ` as any,
    sql`
      SELECT to_char(date_trunc('month', date_created), 'YYYY-MM') AS month,
             tenant_id,
             count(*)::int AS c
      FROM episodes
      WHERE date_created IS NOT NULL
        AND tenant_id = ANY(${tenants})
      GROUP BY month, tenant_id
      ORDER BY month
    ` as any,
    getCrossGuests({ sharedOnly: true, limit: 15 }),
    getCrossSponsors(),
  ]);

  const hours_by_podcast = (hoursByPodcast as any[]).map((r: any) => ({
    podcast: r.tenant_id,
    podcast_name: TENANT_META[r.tenant_id as TenantId]?.name || r.tenant_id,
    hours: Math.round(Number(r.total_seconds) / 3600),
    episodes: Number(r.episodes),
  }));

  // Pivot episodes_by_month
  const monthMap = new Map<string, Record<string, number>>();
  for (const r of (epsByMonth as any[])) {
    const m = r.month;
    let entry = monthMap.get(m);
    if (!entry) { entry = {}; monthMap.set(m, entry); }
    entry[r.tenant_id] = Number(r.c);
  }
  const episodes_by_month = Array.from(monthMap.entries()).map(([month, vals]) => {
    const total = Object.values(vals).reduce((s: number, v: number) => s + v, 0);
    return { month, ...vals, total };
  });

  const totalHours = hours_by_podcast.reduce((s, p) => s + p.hours, 0);
  const totalEpisodes = hours_by_podcast.reduce((s, p) => s + p.episodes, 0);
  const daysNonStop = Math.round(totalHours / 24);

  const insights: string[] = [];
  if (totalHours) insights.push(`${totalHours} heures de contenu expert — l'équivalent de ${daysNonStop} jours non-stop`);
  if ((sharedGuestsTop as any).total) insights.push(`${(sharedGuestsTop as any).total} invités apparaissent dans 2+ podcasts — le noyau dur du réseau MS`);
  if ((sponsorsTop as any).total) insights.push(`${(sponsorsTop as any).total} sponsors présents dans plusieurs podcasts de l'univers`);
  if (totalEpisodes) {
    const weeks = 52 * 8; // ~8 ans d'histoire combinée
    const perWeek = (totalEpisodes / weeks).toFixed(1);
    insights.push(`L'univers MS produit ~${perWeek} épisodes/semaine en moyenne depuis le début`);
  }

  return {
    hours_by_podcast,
    episodes_by_month,
    top_shared_guests: (sharedGuestsTop as any).guests.slice(0, 10),
    sponsor_overlap: (sponsorsTop as any).sponsors.slice(0, 10),
    insights,
    combined: {
      total_hours: totalHours,
      total_episodes: totalEpisodes,
      total_days_nonstop: daysNonStop,
    },
  };
}
