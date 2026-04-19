import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { HOSTS_NORMALIZED } from '../engine/db/cross-queries';

// ============================================================================
// Populate guests table for GDIY tenant.
//
// Source : episodes.guest_from_title (episodes.guest est vide pour GDIY).
// Étapes :
//   1. Normalise et filtre les noms (strip "#NNN", skip [REDIFF], #HORS, noms
//      d'un seul mot ambigus, hosts).
//   2. Insert guests (tenant_id='gdiy', name) ON CONFLICT DO NOTHING.
//   3. Populate guest_episodes (join table) pour chaque (episode, guest).
//   4. Enrichit linkedin_url via episode_links (link_type='linkedin',
//      premier lien non-host rencontré dans les épisodes de l'invité).
//   5. Enrichit bio depuis article_content (phrase d'intro après répétition
//      du nom dans l'article — pattern canonique GDIY).
//   6. Update guests.episodes_count.
//
// Usage : npx tsx scripts/populate-gdiy-guests.ts [--dry]
// ============================================================================

const DRY = process.argv.includes('--dry');
const TENANT = 'gdiy';
const sql = neon(process.env.DATABASE_URL!);

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isHost(name: string): boolean {
  const n = stripAccents(name.toLowerCase()).trim();
  return HOSTS_NORMALIZED.some(h => n.includes(h));
}

// Extrait le VRAI nom depuis guest_from_title.
// Retourne null si le token n'est pas exploitable.
function normalizeGuestName(raw: string | null): string | null {
  if (!raw) return null;
  let n = raw.trim();

  // Strip "#N " / "#NN  " / "#123:" prefix
  n = n.replace(/^#\s*\d+\s*[\-–—:]*\s*/, '').trim();

  // Reject metadata markers
  if (n.startsWith('#')) return null;            // "#HORS", "#REDIFF"
  if (n.startsWith('[')) return null;            // "[REDIFF]"
  if (n.length < 3) return null;

  // Reject un seul token trop court/ambigu (prénom seul sans nom)
  // On exige au moins un espace OU 6+ caractères pour un prénom composé ("Jean-Luc")
  if (!n.includes(' ') && !n.includes('-') && n.length < 6) return null;

  // Reject phrases verbales tronquées ("Surmonter le")
  if (/^[a-zéèêà]/.test(n)) return null;         // commence par minuscule → pas un nom propre

  return n;
}

function extractBio(name: string, article: string | null): string | null {
  if (!article || article.length < 150) return null;

  const firstName = name.split(/\s+/)[0];
  // Chercher la 2e occurrence du nom (la 1ère est le titre répété).
  const idx1 = article.indexOf(name);
  if (idx1 < 0) {
    // Fallback sur le prénom
    const pIdx = article.indexOf(firstName);
    if (pIdx < 0) return null;
    return cleanBioChunk(article.slice(pIdx, pIdx + 600));
  }
  // Texte après la première mention du nom complet
  let after = article.slice(idx1 + name.length);
  after = after.replace(/^["""\s,.;:!?'«»]+/, '');
  return cleanBioChunk((name + ' ' + after).slice(0, 600));
}

function cleanBioChunk(s: string): string | null {
  // Collapse whitespace, cut at last sentence boundary under 500c
  let clean = s.replace(/\s+/g, ' ').trim();
  if (clean.length < 60) return null;
  if (clean.length <= 500) return clean;
  const cut = clean.slice(0, 500);
  const lastDot = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return lastDot > 200 ? cut.slice(0, lastDot + 1) : cut;
}

async function main() {
  console.log(`\n[populate-gdiy-guests] start — tenant=${TENANT}${DRY ? ' (DRY)' : ''}\n`);

  // --------------------------------------------------------------------------
  // 1. Collecte des épisodes GDIY avec candidat nom
  // --------------------------------------------------------------------------
  console.log('[1/6] Collecting episodes with guest candidates…');
  const eps: any = await sql`
    SELECT id, episode_number, guest_from_title, article_content
    FROM episodes
    WHERE tenant_id = ${TENANT}
      AND guest_from_title IS NOT NULL
      AND (episode_type = 'full' OR episode_type IS NULL)
  `;
  console.log(`  ${eps.length} episodes fetched`);

  type Pair = { episodeId: number; episodeNumber: number | null; name: string; article: string | null };
  const pairs: Pair[] = [];
  let rejected = 0;
  for (const e of eps) {
    const name = normalizeGuestName(e.guest_from_title);
    if (!name) { rejected++; continue; }
    if (isHost(name)) { rejected++; continue; }
    pairs.push({ episodeId: e.id, episodeNumber: e.episode_number, name, article: e.article_content });
  }
  const unique = new Map<string, Pair[]>();
  for (const p of pairs) {
    const list = unique.get(p.name) || [];
    list.push(p);
    unique.set(p.name, list);
  }
  console.log(`  pairs retained: ${pairs.length} | rejected: ${rejected} | unique guests: ${unique.size}`);

  // --------------------------------------------------------------------------
  // 2. Insert guests
  // --------------------------------------------------------------------------
  console.log('\n[2/6] Inserting guests…');
  let inserted = 0;
  if (!DRY) {
    const names = Array.from(unique.keys());
    const CHUNK = 50;
    for (let i = 0; i < names.length; i += CHUNK) {
      const batch = names.slice(i, i + CHUNK);
      await Promise.all(batch.map(async (n) => {
        const r: any = await sql`
          INSERT INTO guests (tenant_id, name)
          VALUES (${TENANT}, ${n})
          ON CONFLICT (tenant_id, name) DO NOTHING
          RETURNING id
        `;
        if (r.length) inserted++;
      }));
    }
  }
  console.log(`  guests inserted: ${inserted}${DRY ? ' (DRY skipped)' : ''}`);

  // --------------------------------------------------------------------------
  // 3. Populate guest_episodes (séquentiel, multi-row INSERT pour éviter Neon OOM)
  // --------------------------------------------------------------------------
  console.log('\n[3/6] Populating guest_episodes…');
  let geInserted = 0;
  if (!DRY) {
    const gRows: any = await sql`SELECT id, name FROM guests WHERE tenant_id = ${TENANT}`;
    const nameToId = new Map<string, number>(gRows.map((g: any) => [g.name, g.id]));

    const allPairs = pairs
      .map(p => ({ guestId: nameToId.get(p.name), episodeId: p.episodeId }))
      .filter(p => p.guestId != null) as { guestId: number; episodeId: number }[];

    const CHUNK = 50;
    for (let i = 0; i < allPairs.length; i += CHUNK) {
      const batch = allPairs.slice(i, i + CHUNK);
      const guestIds = batch.map(b => b.guestId);
      const episodeIds = batch.map(b => b.episodeId);
      const r: any = await sql`
        INSERT INTO guest_episodes (tenant_id, guest_id, episode_id)
        SELECT ${TENANT}, g, e
        FROM unnest(${guestIds}::int[], ${episodeIds}::int[]) AS t(g, e)
        ON CONFLICT (guest_id, episode_id) DO NOTHING
        RETURNING id
      `;
      geInserted += r.length;
    }
  }
  console.log(`  guest_episodes inserted: ${geInserted}${DRY ? ' (DRY skipped)' : ''}`);

  // --------------------------------------------------------------------------
  // 4. Backfill episodes.guest (source normalisée) pour que les queries cross
  //    et queries.ts s'appuient sur episodes.guest plutôt que guest_from_title.
  //    N'écrase pas une valeur existante.
  // --------------------------------------------------------------------------
  console.log('\n[4/6] Backfilling episodes.guest from normalized name…');
  let backfilled = 0;
  if (!DRY) {
    const CHUNK = 50;
    for (let i = 0; i < pairs.length; i += CHUNK) {
      const batch = pairs.slice(i, i + CHUNK);
      const ids = batch.map(b => b.episodeId);
      const names = batch.map(b => b.name);
      const r: any = await sql`
        UPDATE episodes SET guest = t.n
        FROM unnest(${ids}::int[], ${names}::text[]) AS t(i, n)
        WHERE episodes.id = t.i
          AND episodes.tenant_id = ${TENANT}
          AND (episodes.guest IS NULL OR episodes.guest = '')
        RETURNING episodes.id
      `;
      backfilled += r.length;
    }
  }
  console.log(`  episodes.guest backfilled: ${backfilled}${DRY ? ' (DRY skipped)' : ''}`);

  // --------------------------------------------------------------------------
  // 5. Enrich linkedin_url + bio
  // --------------------------------------------------------------------------
  console.log('\n[5/6] Enriching linkedin_url + bio…');
  let withLinkedin = 0;
  let withBio = 0;
  if (!DRY) {
    // LinkedIn : pour chaque guest, premier linkedin non-host dans ses épisodes.
    const liRes: any = await sql`
      WITH candidates AS (
        SELECT DISTINCT ON (g.id)
          g.id AS guest_id,
          el.url AS linkedin_url
        FROM guests g
        JOIN guest_episodes ge ON ge.guest_id = g.id AND ge.tenant_id = g.tenant_id
        JOIN episode_links el ON el.episode_id = ge.episode_id AND el.tenant_id = g.tenant_id
        WHERE g.tenant_id = ${TENANT}
          AND g.linkedin_url IS NULL
          AND el.link_type = 'linkedin'
          AND el.url ILIKE '%linkedin.com%'
          AND el.url NOT ILIKE '%matthieustefani%'
          AND el.url NOT ILIKE '%amaurydetonquedec%'
        ORDER BY g.id, el.id
      )
      UPDATE guests SET linkedin_url = c.linkedin_url
      FROM candidates c
      WHERE guests.id = c.guest_id
      RETURNING guests.id
    `;
    withLinkedin = liRes.length;

    // Bio : LLM-free — extraction depuis article_content.
    for (const [name, list] of unique) {
      // Prendre le 1er épisode avec article substantiel
      const withArt = list.find(p => p.article && p.article.length > 300);
      if (!withArt) continue;
      const bio = extractBio(name, withArt.article);
      if (!bio) continue;
      const r: any = await sql`
        UPDATE guests SET bio = ${bio}
        WHERE tenant_id = ${TENANT} AND name = ${name}
          AND (bio IS NULL OR bio = '')
        RETURNING id
      `;
      if (r.length) withBio++;
    }
  }
  console.log(`  with linkedin: ${withLinkedin}${DRY ? ' (DRY skipped)' : ''}`);
  console.log(`  with bio:      ${withBio}${DRY ? ' (DRY skipped)' : ''}`);

  // --------------------------------------------------------------------------
  // 6. Update episodes_count
  // --------------------------------------------------------------------------
  console.log('\n[6/6] Updating episodes_count…');
  if (!DRY) {
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
  }

  // --------------------------------------------------------------------------
  // Final stats
  // --------------------------------------------------------------------------
  console.log('\n=== Final ===');
  const [g]: any = await sql`SELECT COUNT(*)::int AS c FROM guests WHERE tenant_id = ${TENANT}`;
  const [gli]: any = await sql`SELECT COUNT(*)::int AS c FROM guests WHERE tenant_id = ${TENANT} AND linkedin_url IS NOT NULL`;
  const [gbio]: any = await sql`SELECT COUNT(*)::int AS c FROM guests WHERE tenant_id = ${TENANT} AND bio IS NOT NULL`;
  const [gmulti]: any = await sql`SELECT COUNT(*)::int AS c FROM guests WHERE tenant_id = ${TENANT} AND episodes_count >= 2`;
  const [ge]: any = await sql`SELECT COUNT(*)::int AS c FROM guest_episodes WHERE tenant_id = ${TENANT}`;
  console.log(`[GDIY-GUESTS] Guests créés     : ${g.c}`);
  console.log(`[GDIY-GUESTS] Avec LinkedIn    : ${gli.c}`);
  console.log(`[GDIY-GUESTS] Avec bio         : ${gbio.c}`);
  console.log(`[GDIY-GUESTS] Multi-épisodes   : ${gmulti.c}`);
  console.log(`[GDIY-GUESTS] guest_episodes   : ${ge.c}`);
  console.log(`[populate-gdiy-guests] done${DRY ? ' (DRY — aucune écriture)' : ''}\n`);
}

main().catch(e => { console.error('[populate-gdiy-guests] FATAL', e); process.exit(1); });
