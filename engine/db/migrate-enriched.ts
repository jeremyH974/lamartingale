import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { neon } from '@neondatabase/serverless';

// ============================================================================
// Migration enrichie : pousse article_content, key_takeaways, related_episodes,
// external_references, community_rating, guest_bio, guest_company, sponsor
// dans la BDD existante (UPDATE, pas INSERT)
// ============================================================================

const DATA = path.join(__dirname, '..', '..', 'data');

function loadJSON(file: string): any {
  const p = path.join(DATA, file);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

async function main() {
  console.log('[MIGRATE-ENRICHED] Starting enriched data migration');

  const sql = neon(process.env.DATABASE_URL!);

  // Load all data sources
  const enriched = loadJSON('episodes-enriched.json');
  const bios = loadJSON('guests-bios.json');

  if (!enriched) { console.error('  episodes-enriched.json not found'); return; }

  // Build lookups by episode_id (first match per id)
  const enrichedMap: Record<number, any> = {};
  for (const ep of enriched.episodes) {
    if (ep.id && !enrichedMap[ep.id]) enrichedMap[ep.id] = ep;
  }

  const bioMap: Record<number, any> = {};
  if (bios?.guests) {
    for (const g of bios.guests) {
      if (g.episode_id && !bioMap[g.episode_id]) bioMap[g.episode_id] = g;
    }
  }

  // Get all episodes from DB
  const dbEpisodes = await sql`SELECT id, episode_number FROM episodes ORDER BY episode_number`;
  console.log(`  DB episodes: ${dbEpisodes.length}`);
  console.log(`  Enriched source: ${Object.keys(enrichedMap).length} episodes`);
  console.log(`  Bio source: ${Object.keys(bioMap).length} episodes`);

  let updated = 0;
  let withArticle = 0;
  let withBio = 0;

  for (const dbEp of dbEpisodes) {
    const epNum = dbEp.episode_number;
    const enr = enrichedMap[epNum];
    const bio = bioMap[epNum];

    if (!enr && !bio) continue;

    // Build article content from sections
    let articleContent: string | null = null;
    if (enr?.article_sections?.length) {
      articleContent = enr.article_sections
        .map((s: any) => `## ${s.heading || ''}\n\n${s.content || ''}`)
        .join('\n\n');
      withArticle++;
    }

    // Parse date
    let dateCreated: string | null = null;
    if (enr?.publication_date) {
      const parts = enr.publication_date.split('.');
      if (parts.length === 3) {
        dateCreated = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }

    // Update episode
    await sql`
      UPDATE episodes SET
        abstract = COALESCE(${enr?.abstract || null}, abstract),
        article_content = COALESCE(${articleContent}, article_content),
        key_takeaways = COALESCE(${JSON.stringify(enr?.key_takeaways || null)}::jsonb, key_takeaways),
        related_episodes = COALESCE(${JSON.stringify(enr?.related_episodes || null)}::jsonb, related_episodes),
        external_references = COALESCE(${JSON.stringify(enr?.external_references || null)}::jsonb, external_references),
        community_rating = COALESCE(${enr?.community_rating || null}::real, community_rating),
        sponsor = COALESCE(${enr?.sponsor || null}, sponsor),
        guest_company = COALESCE(${bio?.guest_company || null}, guest_company),
        guest_bio = COALESCE(${bio?.guest_bio || null}, guest_bio),
        date_created = COALESCE(${dateCreated}::timestamp, date_created),
        slug = COALESCE(${enr?.slug || null}, slug),
        url = COALESCE(${enr?.url || null}, url)
      WHERE episode_number = ${epNum}
    `;

    if (bio?.guest_bio) withBio++;
    updated++;
  }

  // Validation
  const [stats] = await sql`
    SELECT
      count(*) as total,
      count(abstract) FILTER (WHERE abstract IS NOT NULL AND abstract != '') as with_abstract,
      count(article_content) FILTER (WHERE article_content IS NOT NULL) as with_article,
      count(key_takeaways) FILTER (WHERE key_takeaways IS NOT NULL) as with_takeaways,
      count(related_episodes) FILTER (WHERE related_episodes IS NOT NULL) as with_related,
      count(community_rating) FILTER (WHERE community_rating IS NOT NULL) as with_rating,
      count(guest_bio) FILTER (WHERE guest_bio IS NOT NULL AND guest_bio != '') as with_bio,
      count(guest_company) FILTER (WHERE guest_company IS NOT NULL AND guest_company != '') as with_company,
      count(sponsor) FILTER (WHERE sponsor IS NOT NULL) as with_sponsor,
      count(date_created) FILTER (WHERE date_created IS NOT NULL) as with_date
    FROM episodes
  `;

  console.log(`\n[MIGRATE-ENRICHED] === RESULTS ===`);
  console.log(`  Updated: ${updated} episodes`);
  console.log(`\n  Field              | Count | %`);
  console.log(`  -------------------|-------|----`);
  const total = Number(stats.total);
  for (const [field, value] of Object.entries(stats)) {
    if (field === 'total') continue;
    const n = Number(value);
    console.log(`  ${field.padEnd(19)}| ${String(n).padStart(5)} | ${Math.round(n / total * 100)}%`);
  }
}

main().catch(e => { console.error('[MIGRATE-ENRICHED] FATAL:', e); process.exit(1); });
