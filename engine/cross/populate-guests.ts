import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import {
  HOSTS_NORMALIZED,
  LINKEDIN_EXCLUSIONS_PER_TENANT,
  ensureUniverseInit,
} from '../db/cross-queries';
import { getConfig } from '../config/index';
import { pickGuestLinkedin, buildExclusions } from '../scraping/linkedin-filter';

// ============================================================================
// Populate guests table pour N'IMPORTE QUEL tenant.
//
// Lecture du tenant via PODCAST_ID (getConfig).
//
// Sources exploitées (dans l'ordre de priorité) :
//   - episodes.guest              (si déjà rempli par ingest / scrape-deep)
//   - episodes.guest_from_title   (fallback — extrait du titre RSS)
//
// Sources d'enrichissement :
//   - article_content             (si hasArticles=true) — bio extraite du
//                                 paragraphe suivant la première mention du nom
//   - rss_guest_intro             (si rempli par backfill-parsed) — fallback bio
//   - episode_links(link_type='linkedin')  — linkedin_url
//
// Pipeline 6 étapes (reprise de populate-gdiy-guests.ts) :
//   1. Collecte + normalisation (strip "#NNN ", skip [REDIFF], hosts, tokens courts).
//   2. INSERT guests (tenant, name) ON CONFLICT DO NOTHING.
//   3. INSERT guest_episodes (tenant, guest_id, episode_id) ON CONFLICT DO NOTHING.
//   4. UPDATE episodes.guest depuis normalized name (si vide).
//   5. UPDATE guests.linkedin_url depuis episode_links + guests.bio depuis
//      article_content → fallback rss_guest_intro.
//   6. UPDATE guests.episodes_count.
//
// Usage :
//   PODCAST_ID=finscale npx tsx engine/cross/populate-guests.ts [--dry]
// ============================================================================

const DRY = process.argv.includes('--dry');

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isHost(name: string): boolean {
  const n = stripAccents(name.toLowerCase()).trim();
  return HOSTS_NORMALIZED.some(h => n.includes(h));
}

function normalizeGuestName(raw: string | null): string | null {
  if (!raw) return null;
  let n = raw.trim();
  n = n.replace(/^#\s*\d+\s*[\-–—:]*\s*/, '').trim();
  if (n.startsWith('#')) return null;
  if (n.startsWith('[')) return null;
  if (n.length < 3) return null;
  if (!n.includes(' ') && !n.includes('-') && n.length < 6) return null;
  if (/^[a-zéèêà]/.test(n)) return null;
  return n;
}

function extractBio(name: string, article: string | null): string | null {
  if (!article || article.length < 150) return null;
  const firstName = name.split(/\s+/)[0];
  const idx1 = article.indexOf(name);
  if (idx1 < 0) {
    const pIdx = article.indexOf(firstName);
    if (pIdx < 0) return null;
    return cleanBioChunk(article.slice(pIdx, pIdx + 600));
  }
  let after = article.slice(idx1 + name.length);
  after = after.replace(/^["""\s,.;:!?'«»]+/, '');
  return cleanBioChunk((name + ' ' + after).slice(0, 600));
}

function cleanBioChunk(s: string): string | null {
  let clean = s.replace(/\s+/g, ' ').trim();
  if (clean.length < 60) return null;
  if (clean.length <= 500) return clean;
  const cut = clean.slice(0, 500);
  const lastDot = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return lastDot > 200 ? cut.slice(0, lastDot + 1) : cut;
}

async function main() {
  await ensureUniverseInit();
  const cfg = getConfig();
  const TENANT = cfg.id;
  const hasArticles = !!cfg.scraping?.hasArticles;
  const sql = neon(process.env.DATABASE_URL!);

  console.log(`\n[populate-guests] tenant=${TENANT} hasArticles=${hasArticles}${DRY ? ' (DRY)' : ''}`);

  // --------------------------------------------------------------------------
  // 1. Collecte
  // --------------------------------------------------------------------------
  console.log('[1/6] Collecting episodes with guest candidates…');
  const eps: any = await sql`
    SELECT id,
           episode_number,
           COALESCE(NULLIF(guest, ''), guest_from_title) AS guest_raw,
           article_content,
           rss_guest_intro
    FROM episodes
    WHERE tenant_id = ${TENANT}
      AND COALESCE(NULLIF(guest, ''), guest_from_title) IS NOT NULL
      AND (episode_type = 'full' OR episode_type IS NULL)
  `;

  type Pair = { episodeId: number; name: string; article: string | null; intro: string | null };
  const pairs: Pair[] = [];
  let rejected = 0;
  for (const e of eps) {
    const name = normalizeGuestName(e.guest_raw);
    if (!name) { rejected++; continue; }
    if (isHost(name)) { rejected++; continue; }
    pairs.push({
      episodeId: e.id,
      name,
      article: e.article_content || null,
      intro: e.rss_guest_intro || null,
    });
  }
  const unique = new Map<string, Pair[]>();
  for (const p of pairs) {
    const list = unique.get(p.name) || [];
    list.push(p);
    unique.set(p.name, list);
  }
  console.log(`  fetched: ${eps.length} | retained: ${pairs.length} | rejected: ${rejected} | unique: ${unique.size}`);

  if (DRY) {
    console.log('  DRY — sample 10:');
    Array.from(unique.entries()).slice(0, 10).forEach(([n, list]) => {
      console.log(`    ${n}  (${list.length} eps)`);
    });
    return;
  }

  // --------------------------------------------------------------------------
  // 2. INSERT guests
  // --------------------------------------------------------------------------
  console.log('[2/6] Inserting guests…');
  const names = Array.from(unique.keys());
  const CHUNK = 100;
  let inserted = 0;
  for (let i = 0; i < names.length; i += CHUNK) {
    const chunk = names.slice(i, i + CHUNK);
    const r = await sql`
      INSERT INTO guests (tenant_id, name, episodes_count)
      SELECT ${TENANT}, n, 0 FROM unnest(${chunk}::text[]) AS n
      ON CONFLICT (tenant_id, name) DO NOTHING
      RETURNING id
    ` as any[];
    inserted += r.length;
  }
  console.log(`  inserted: ${inserted}`);

  // --------------------------------------------------------------------------
  // 3. INSERT guest_episodes
  // --------------------------------------------------------------------------
  console.log('[3/6] Populating guest_episodes…');
  const gRows: any = await sql`SELECT id, name FROM guests WHERE tenant_id = ${TENANT}`;
  const nameToId = new Map<string, number>(gRows.map((g: any) => [g.name, g.id]));

  const gids: number[] = [];
  const eids: number[] = [];
  for (const p of pairs) {
    const gid = nameToId.get(p.name);
    if (!gid) continue;
    gids.push(gid);
    eids.push(p.episodeId);
  }

  let geInserted = 0;
  const CHUNK2 = 500;
  for (let i = 0; i < gids.length; i += CHUNK2) {
    const gS = gids.slice(i, i + CHUNK2);
    const eS = eids.slice(i, i + CHUNK2);
    const r = await sql`
      INSERT INTO guest_episodes (tenant_id, guest_id, episode_id)
      SELECT ${TENANT}, g, e FROM unnest(${gS}::int[], ${eS}::int[]) AS x(g, e)
      ON CONFLICT (guest_id, episode_id) DO NOTHING
      RETURNING guest_id
    ` as any[];
    geInserted += r.length;
  }
  console.log(`  guest_episodes inserted: ${geInserted}`);

  // --------------------------------------------------------------------------
  // 4. Backfill episodes.guest
  // --------------------------------------------------------------------------
  console.log('[4/6] Backfilling episodes.guest…');
  let backfilled = 0;
  const CHUNK3 = 200;
  for (let i = 0; i < pairs.length; i += CHUNK3) {
    const batch = pairs.slice(i, i + CHUNK3);
    const ids = batch.map(b => b.episodeId);
    const nmes = batch.map(b => b.name);
    const r = await sql`
      UPDATE episodes SET guest = t.n
      FROM unnest(${ids}::int[], ${nmes}::text[]) AS t(i, n)
      WHERE episodes.id = t.i
        AND episodes.tenant_id = ${TENANT}
        AND (episodes.guest IS NULL OR episodes.guest = '')
      RETURNING episodes.id
    ` as any[];
    backfilled += r.length;
  }
  console.log(`  backfilled: ${backfilled}`);

  // --------------------------------------------------------------------------
  // 5. Enrich linkedin_url + bio
  // --------------------------------------------------------------------------
  console.log('[5/6] Enriching linkedin_url + bio…');
  // Pull tous les candidats linkedin (URL + label) par guest, ordonnés el.id.
  // Filtrage hosts/parasites + label-match + host-as-guest fait en TS via
  // pickGuestLinkedin (cf. engine/scraping/linkedin-filter.ts).
  const liCandidates: any = await sql`
    SELECT
      g.id AS guest_id,
      g.name AS guest_name,
      el.url,
      el.label,
      el.id AS link_id
    FROM guests g
    JOIN guest_episodes ge ON ge.guest_id = g.id AND ge.tenant_id = g.tenant_id
    JOIN episode_links el ON el.episode_id = ge.episode_id AND el.tenant_id = g.tenant_id
    WHERE g.tenant_id = ${TENANT}
      AND g.linkedin_url IS NULL
      AND el.link_type = 'linkedin'
      AND el.url ILIKE '%linkedin.com%'
    ORDER BY g.id, el.id
  `;

  type Cand = { guest_id: number; guest_name: string; url: string; label: string | null };
  const candByGuest = new Map<number, { name: string; cands: { url: string; label: string | null }[] }>();
  for (const c of liCandidates as Cand[]) {
    let entry = candByGuest.get(c.guest_id);
    if (!entry) {
      entry = { name: c.guest_name, cands: [] };
      candByGuest.set(c.guest_id, entry);
    }
    entry.cands.push({ url: c.url, label: c.label });
  }

  const exclusions = LINKEDIN_EXCLUSIONS_PER_TENANT[TENANT]
    || buildExclusions({
      hostName: cfg.host,
      coHosts: Array.isArray(cfg.coHosts) ? cfg.coHosts : [],
      configHosts: cfg.scraping?.linkedinExclusions?.hosts,
      configParasites: cfg.scraping?.linkedinExclusions?.parasites,
    });

  const resolved: { gid: number; url: string }[] = [];
  const liDiag = { picked: 0, rejected_parasite: 0, rejected_host: 0, host_as_guest: 0, by_rule: {} as Record<string, number> };
  for (const [gid, e] of candByGuest.entries()) {
    const pick = pickGuestLinkedin(e.cands, e.name, exclusions);
    liDiag.by_rule[pick.rule] = (liDiag.by_rule[pick.rule] || 0) + 1;
    liDiag.rejected_parasite += pick.rejected.filter(r => r.reason === 'parasite').length;
    liDiag.rejected_host += pick.rejected.filter(r => r.reason === 'host').length;
    if (pick.rule === 'host-as-guest') liDiag.host_as_guest++;
    if (pick.url) {
      resolved.push({ gid, url: pick.url });
      liDiag.picked++;
    }
  }

  let withLinkedin = 0;
  if (resolved.length > 0) {
    const ids = resolved.map(r => r.gid);
    const urls = resolved.map(r => r.url);
    const r: any = await sql`
      UPDATE guests
      SET linkedin_url = x.url
      FROM unnest(${ids}::int[], ${urls}::text[]) AS x(gid, url)
      WHERE guests.id = x.gid
        AND guests.tenant_id = ${TENANT}
        AND guests.linkedin_url IS NULL
      RETURNING guests.id
    `;
    withLinkedin = r.length;
  }
  console.log(`  linkedin candidates: ${liCandidates.length} rows / ${candByGuest.size} guests | picked=${liDiag.picked} rejected(parasite=${liDiag.rejected_parasite},host=${liDiag.rejected_host}) host-as-guest=${liDiag.host_as_guest}`);
  if (Object.keys(liDiag.by_rule).length) {
    console.log(`  rule split: ${Object.entries(liDiag.by_rule).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  }

  // Bio : article_content si dispo, sinon fallback rss_guest_intro
  let withBio = 0;
  for (const [name, list] of unique) {
    let bio: string | null = null;

    // 1. Article
    if (hasArticles) {
      const withArt = list.find(p => p.article && p.article.length > 300);
      if (withArt) bio = extractBio(name, withArt.article);
    }
    // 2. Fallback rss_guest_intro
    if (!bio) {
      const withIntro = list.find(p => p.intro && p.intro.length > 60);
      if (withIntro && withIntro.intro) bio = cleanBioChunk(withIntro.intro);
    }
    if (!bio) continue;

    const r: any = await sql`
      UPDATE guests SET bio = ${bio}
      WHERE tenant_id = ${TENANT} AND name = ${name}
        AND (bio IS NULL OR bio = '')
      RETURNING id
    `;
    if (r.length) withBio++;
  }
  console.log(`  with linkedin: ${withLinkedin} | with bio: ${withBio}`);

  // --------------------------------------------------------------------------
  // 6. episodes_count
  // --------------------------------------------------------------------------
  console.log('[6/6] Updating episodes_count…');
  await sql`
    UPDATE guests SET episodes_count = sub.c
    FROM (
      SELECT g.id, count(DISTINCT ge.episode_id)::int AS c
      FROM guests g
      LEFT JOIN guest_episodes ge ON ge.guest_id = g.id AND ge.tenant_id = g.tenant_id
      WHERE g.tenant_id = ${TENANT}
      GROUP BY g.id
    ) sub
    WHERE guests.id = sub.id
  `;

  // Final
  const [g]: any = await sql`SELECT COUNT(*)::int AS c FROM guests WHERE tenant_id = ${TENANT}`;
  const [gli]: any = await sql`SELECT COUNT(*)::int AS c FROM guests WHERE tenant_id = ${TENANT} AND linkedin_url IS NOT NULL`;
  const [gbio]: any = await sql`SELECT COUNT(*)::int AS c FROM guests WHERE tenant_id = ${TENANT} AND bio IS NOT NULL`;
  const [gmulti]: any = await sql`SELECT COUNT(*)::int AS c FROM guests WHERE tenant_id = ${TENANT} AND episodes_count >= 2`;
  const [ge]: any = await sql`SELECT COUNT(*)::int AS c FROM guest_episodes WHERE tenant_id = ${TENANT}`;
  console.log(`[populate-guests] DONE — ${g.c} guests · ${gli.c} LinkedIn · ${gbio.c} bio · ${gmulti.c} multi-eps · ${ge.c} guest_episodes`);
}

main().catch(e => { console.error('[populate-guests] FATAL', e); process.exit(1); });
