import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import {
  TENANTS,
  TENANT_META,
  HOSTS_NORMALIZED,
  LINKEDIN_EXCLUSIONS_PER_TENANT,
  ensureUniverseInit,
} from '../db/cross-queries';
import { pickGuestLinkedin, buildExclusions } from '../scraping/linkedin-filter';

// ============================================================================
// Match & merge guests cross-tenant.
//
// 1. Pour chaque tenant, ramasse les apparitions d'invités (episodes.guest
//    ou guest_from_title en fallback) + métadonnées de guests.
// 2. Normalise (lowercase + remove diacritics + trim).
// 3. Matching exact sur la clé normalisée (Levenshtein pourra venir plus tard
//    si on observe de la dérive — en pratique, la BDD LM a déjà des bios
//    canonical, GDIY est en cours de denorm).
// 4. Merge bios (garde la plus longue), linkedin/instagram/website (premier
//    non-null), total_episodes, total_podcasts.
// 5. Flag is_host pour Matthieu Stefani / Amaury de Tonquédec.
// 6. Upsert sur `canonical_name` (UNIQUE).
//
// Bonus : denormalise les linkedin_url extraits via episode_links (link_type
// = 'linkedin') vers guests.linkedin_url quand cette dernière est NULL.
//
// Usage : npx tsx src/cross/match-guests.ts [--dry]
// ============================================================================

const DRY = process.argv.includes('--dry');

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function isHost(normName: string): boolean {
  return HOSTS_NORMALIZED.some(h => normName.includes(h));
}

// Filtre permettant d'exclure les faux noms générés par l'extracteur RSS :
// marqueurs `[REDIFF]`/`[EXTRAIT]`, prénoms seuls (`Jean`), tokens génériques.
function isValidPersonName(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('[') || trimmed.startsWith('#')) return false;
  if (/^\d+$/.test(trimmed)) return false;
  // Doit comporter au moins 2 tokens (nom + prénom ou prénom composé avec tiret)
  const tokenCount = trimmed.split(/[\s\-]+/).filter(Boolean).length;
  if (tokenCount < 2) return false;
  // Premier caractère doit être une majuscule (pas une particule seule)
  if (!/^[A-ZÀ-Ý]/.test(trimmed)) return false;
  // Blocklist de faux positifs courants
  const BAD_NAMES = /^(rediff|extrait|bonus|zoom|episode|hors[- ]?serie|interview|special|partenariat|replay|bande[- ]?annonce|teaser)\b/i;
  if (BAD_NAMES.test(trimmed)) return false;
  return true;
}

type AppearanceRow = {
  tenant_id: string;
  episode_number: number | null;
  guest_raw: string;
  bio: string | null;
  linkedin_url: string | null;
};

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  await ensureUniverseInit();
  const tenants = [...TENANTS];
  if (!tenants.length) {
    console.error('[MATCH-GUESTS] aucun tenant trouvé dans podcast_metadata — abort');
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // Étape 0 : denorm linkedin_url (episode_links → guests) si manquant
  //   - filtre hosts/parasites par tenant via pickGuestLinkedin
  //   - gère le cas host-as-guest (Stefani guest sur ep #297 par ex)
  //   - log diagnostic des candidats rejetés
  // --------------------------------------------------------------------------
  console.log('[0/4] Denormalizing linkedin_url from episode_links → guests (tenant-aware)…');
  const candidatesRows = await sql`
    SELECT
      g.id AS guest_id,
      g.name AS guest_name,
      g.tenant_id,
      el.url,
      el.label,
      el.id AS link_id
    FROM guests g
    JOIN guest_episodes ge ON ge.guest_id = g.id
    JOIN episode_links el ON el.episode_id = ge.episode_id
      AND el.tenant_id = g.tenant_id
    WHERE g.linkedin_url IS NULL
      AND el.link_type = 'linkedin'
      AND el.url IS NOT NULL
      AND el.url ILIKE '%linkedin.com%'
    ORDER BY g.id, el.id
  ` as Array<{
    guest_id: number;
    guest_name: string;
    tenant_id: string;
    url: string;
    label: string | null;
    link_id: number;
  }>;

  // Group candidats par guest_id en respectant l'ordre el.id (priorité 3 du picker).
  type GuestCands = {
    guest_id: number;
    guest_name: string;
    tenant_id: string;
    candidates: { url: string; label: string | null }[];
  };
  const byGuest = new Map<number, GuestCands>();
  for (const c of candidatesRows) {
    let entry = byGuest.get(c.guest_id);
    if (!entry) {
      entry = { guest_id: c.guest_id, guest_name: c.guest_name, tenant_id: c.tenant_id, candidates: [] };
      byGuest.set(c.guest_id, entry);
    }
    entry.candidates.push({ url: c.url, label: c.label });
  }

  // Résolution per-guest avec pickGuestLinkedin.
  const resolved: Array<{ guest_id: number; url: string; rule: string }> = [];
  const diagnostics = {
    picked: 0,
    null_no_candidates: 0,
    null_all_rejected: 0,
    rejected_parasite: 0,
    rejected_host: 0,
    host_as_guest: 0,
    by_rule: { 'label-match': 0, 'slug-match': 0, 'order-fallback': 0, 'host-as-guest': 0, none: 0 } as Record<string, number>,
  };

  for (const g of byGuest.values()) {
    const exclusions = LINKEDIN_EXCLUSIONS_PER_TENANT[g.tenant_id]
      // Fallback défensif si tenant absent du registry — buildExclusions vide.
      || buildExclusions({ hostName: '', coHosts: [], configHosts: [], configParasites: [] });
    const pick = pickGuestLinkedin(g.candidates, g.guest_name, exclusions);
    diagnostics.by_rule[pick.rule] = (diagnostics.by_rule[pick.rule] || 0) + 1;
    diagnostics.rejected_parasite += pick.rejected.filter(r => r.reason === 'parasite').length;
    diagnostics.rejected_host += pick.rejected.filter(r => r.reason === 'host').length;
    if (pick.rule === 'host-as-guest') diagnostics.host_as_guest++;
    if (pick.url) {
      resolved.push({ guest_id: g.guest_id, url: pick.url, rule: pick.rule });
      diagnostics.picked++;
    } else {
      if (g.candidates.length === 0) diagnostics.null_no_candidates++;
      else diagnostics.null_all_rejected++;
    }
  }

  console.log(`  candidates: ${candidatesRows.length} rows over ${byGuest.size} guests`);
  console.log(`  picked: ${diagnostics.picked} | null: ${diagnostics.null_all_rejected + diagnostics.null_no_candidates} (all_rejected=${diagnostics.null_all_rejected})`);
  console.log(`  rejected: parasite=${diagnostics.rejected_parasite} host=${diagnostics.rejected_host}${diagnostics.host_as_guest ? ` | host-as-guest=${diagnostics.host_as_guest}` : ''}`);
  console.log(`  by rule: ${Object.entries(diagnostics.by_rule).filter(([, n]) => n > 0).map(([r, n]) => `${r}=${n}`).join(' ')}`);

  if (DRY) {
    console.log(`  DRY — pas d'UPDATE (${resolved.length} guests seraient mis à jour)`);
  } else if (resolved.length > 0) {
    // Batch UPDATE via unnest pour éviter N round-trips.
    const ids = resolved.map(r => r.guest_id);
    const urls = resolved.map(r => r.url);
    const updated = await sql`
      UPDATE guests g
      SET linkedin_url = x.url
      FROM unnest(${ids}::int[], ${urls}::text[]) AS x(gid, url)
      WHERE g.id = x.gid
        AND g.linkedin_url IS NULL
      RETURNING g.id
    ` as any[];
    console.log(`  denorm: ${updated.length} guests rows updated`);
  } else {
    console.log('  denorm: 0 guests rows updated');
  }

  // --------------------------------------------------------------------------
  // Étape 1 : pull toutes les apparitions
  // --------------------------------------------------------------------------
  console.log('\n[1/4] Pulling guest appearances across tenants…');
  const rows = await sql`
    SELECT
      e.tenant_id,
      e.episode_number,
      COALESCE(NULLIF(e.guest, ''), e.guest_from_title) AS guest_raw,
      g.bio,
      g.linkedin_url
    FROM episodes e
    LEFT JOIN guests g ON g.tenant_id = e.tenant_id
      AND lower(trim(g.name)) = lower(trim(COALESCE(NULLIF(e.guest, ''), e.guest_from_title)))
    WHERE e.tenant_id = ANY(${tenants})
      AND COALESCE(NULLIF(e.guest, ''), e.guest_from_title) IS NOT NULL
      AND (e.episode_type = 'full' OR e.episode_type IS NULL)
  ` as AppearanceRow[];
  console.log(`  ${rows.length} appearances fetched`);

  // --------------------------------------------------------------------------
  // Étape 2 : group + merge
  // --------------------------------------------------------------------------
  console.log('\n[2/4] Grouping by canonical name & merging metadata…');

  type Acc = {
    displayName: string;
    bio: string | null;
    linkedin: string | null;
    byTenant: Map<string, Set<number>>;
    isHost: boolean;
  };

  const byCanon = new Map<string, Acc>();

  for (const r of rows) {
    const raw = (r.guest_raw || '').trim();
    if (!raw) continue;
    if (!isValidPersonName(raw)) continue;
    const canon = normalizeName(raw);
    if (canon.length < 3) continue;

    let entry = byCanon.get(canon);
    if (!entry) {
      entry = {
        displayName: raw,
        bio: null,
        linkedin: null,
        byTenant: new Map(),
        isHost: isHost(canon),
      };
      byCanon.set(canon, entry);
    }

    // Bio : garder la plus longue
    if (r.bio && typeof r.bio === 'string') {
      if (!entry.bio || r.bio.length > entry.bio.length) entry.bio = r.bio;
    }
    // LinkedIn : premier non-null
    if (r.linkedin_url && !entry.linkedin) entry.linkedin = r.linkedin_url;

    if (r.episode_number != null) {
      let set = entry.byTenant.get(r.tenant_id);
      if (!set) { set = new Set(); entry.byTenant.set(r.tenant_id, set); }
      set.add(r.episode_number);
    }
  }

  console.log(`  ${byCanon.size} unique canonical names`);
  const hostsCount = Array.from(byCanon.values()).filter(a => a.isHost).length;
  const crossCount = Array.from(byCanon.values()).filter(a => a.byTenant.size >= 2 && !a.isHost).length;
  console.log(`  hosts (exclus des stats guests) = ${hostsCount}`);
  console.log(`  cross-podcast (2+ tenants)      = ${crossCount}`);

  // --------------------------------------------------------------------------
  // Étape 3 : upsert
  // --------------------------------------------------------------------------
  console.log('\n[3/4] Upserting cross_podcast_guests…');
  if (DRY) {
    console.log('  DRY run — pas d\'upsert');
  } else {
    // Phase B0 (2026-04-28) — TRUNCATE retiré : il détruisait les briefs
    // (brief_md, key_positions, quotes, original_questions,
    // brief_generated_at, brief_model) générés par Phase 1.5 vitrine et,
    // à terme, ceux générés en bulk par Phase C. L'UPSERT ON CONFLICT
    // ci-dessous préserve nativement ces colonnes : seules les colonnes
    // listées dans `DO UPDATE SET … = EXCLUDED.*` sont réécrites.
    //
    // Conséquence — entries orphelines : un guest qui disparaît du dataset
    // courant (ex. titre RSS modifié → canonical_name différent) reste en
    // table jusqu'à un cleanup explicite. Acceptable phase pilote ; cycle
    // de vie complet (soft-delete `is_active` ou cleanup périodique) à
    // implémenter post-pilote V2 si nécessaire.
    //
    // Schema : UNIQUE (canonical_name) déjà présent
    // (cross_podcast_guests_canonical_name_key) — pas de CREATE INDEX
    // additionnel nécessaire.

    const chunks: Array<{
      canonical: string; display: string; bio: string | null; linkedin: string | null;
      tenantAppearances: Array<{ tenant_id: string; episode_numbers: number[] }>;
      totalEps: number; totalPods: number; isHost: boolean;
    }> = [];

    for (const [canon, acc] of byCanon.entries()) {
      const tenantAppearances = Array.from(acc.byTenant.entries()).map(([tid, set]) => ({
        tenant_id: tid,
        episode_numbers: Array.from(set).sort((a, b) => a - b),
      }));
      const totalEps = tenantAppearances.reduce((s, t) => s + t.episode_numbers.length, 0);
      chunks.push({
        canonical: canon,
        display: acc.displayName,
        bio: acc.bio,
        linkedin: acc.linkedin,
        tenantAppearances,
        totalEps,
        totalPods: tenantAppearances.length,
        isHost: acc.isHost,
      });
    }

    // Insert en batches de 10 (Neon HTTP est sensible au parallélisme)
    const CONCURRENCY = 10;
    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
      const batch = chunks.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(c => sql`
        INSERT INTO cross_podcast_guests (
          canonical_name, display_name, bio, linkedin_url,
          tenant_appearances, total_episodes, total_podcasts, is_host
        ) VALUES (
          ${c.canonical}, ${c.display}, ${c.bio}, ${c.linkedin},
          ${JSON.stringify(c.tenantAppearances)}::jsonb,
          ${c.totalEps}, ${c.totalPods}, ${c.isHost}
        )
        ON CONFLICT (canonical_name) DO UPDATE SET
          display_name       = EXCLUDED.display_name,
          bio                = EXCLUDED.bio,
          linkedin_url       = EXCLUDED.linkedin_url,
          tenant_appearances = EXCLUDED.tenant_appearances,
          total_episodes     = EXCLUDED.total_episodes,
          total_podcasts     = EXCLUDED.total_podcasts,
          is_host            = EXCLUDED.is_host,
          updated_at         = now()
      `));
    }
    console.log(`  upsert: ${chunks.length} rows`);
  }

  // --------------------------------------------------------------------------
  // Étape 4 : sanity
  // --------------------------------------------------------------------------
  console.log('\n[4/4] Sanity check…');
  const [{ c: totalGuests }] = await sql`SELECT count(*)::int AS c FROM cross_podcast_guests` as any[];
  const [{ c: crossRows }] = await sql`SELECT count(*)::int AS c FROM cross_podcast_guests WHERE total_podcasts >= 2 AND is_host = false` as any[];
  const [{ c: hostRows }] = await sql`SELECT count(*)::int AS c FROM cross_podcast_guests WHERE is_host = true` as any[];
  console.log(`  total            = ${totalGuests}`);
  console.log(`  cross-podcast    = ${crossRows}`);
  console.log(`  hosts flagged    = ${hostRows}`);

  const topCross = await sql`
    SELECT display_name, total_episodes, total_podcasts
    FROM cross_podcast_guests
    WHERE total_podcasts >= 2 AND is_host = false
    ORDER BY total_episodes DESC
    LIMIT 10
  ` as any[];
  console.log('\n  TOP 10 cross-podcast guests :');
  for (const g of topCross) {
    console.log(`    ${String(g.total_episodes).padStart(3)} eps / ${g.total_podcasts} pods — ${g.display_name}`);
  }

  console.log(`\n[MATCH-GUESTS] done (universe: ${tenants.map(t => TENANT_META[t].name).join(', ')})`);
}

main().catch(e => { console.error('[MATCH-GUESTS] FATAL', e); process.exit(1); });
