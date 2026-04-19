/**
 * RSS Scraper — extraction exhaustive ("capturer maintenant, exploiter plus tard")
 *
 * Pour chaque <item> RSS :
 *   - champs scalaires : title, guid, pubDate, season, episode_number,
 *     episode_type, explicit, duration_seconds, audio_url, audio_size_bytes,
 *     episode_image_url, guest_from_title
 *   - JSONB : sponsors, rss_links (classifiés), cross_refs
 *   - texte enrichi : rss_description, rss_content_encoded
 *
 * Pour le <channel> : 1 ligne dans podcast_metadata (upsert par tenant_id).
 *
 * Matching item↔BDD : (episode_number) d'abord, sinon fuzzy title.
 *
 * Usage :
 *   npx tsx src/scrape-rss.ts                   # tenant actif (getConfig)
 *   PODCAST_ID=gdiy npx tsx src/scrape-rss.ts   # force tenant (pas d'insert,
 *                                                 seulement update des rows existantes)
 */
import 'dotenv/config';
import { XMLParser } from 'fast-xml-parser';
import { neon } from '@neondatabase/serverless';
import { getConfig } from '@engine/config';
import { extractItem, extractChannelMetadata, computePublishFrequencyDays } from './rss/extractors';
import { parseRssDescription } from './rss/parse-description';

const sql = neon(process.env.DATABASE_URL!);
const cfg = getConfig();
const TENANT = cfg.database.tenantId;

const FEEDS: { name: string; url: string }[] = [
  { name: cfg.name, url: cfg.rssFeeds.main },
  ...(cfg.rssFeeds.secondary ? [{ name: `${cfg.name} (secondary)`, url: cfg.rssFeeds.secondary }] : []),
];

function normalizeTitle(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function fetchAndParse(url: string): Promise<{ channel: any; items: any[]; rawXml: string }> {
  const res = await fetch(url, { headers: { 'User-Agent': cfg.scraping.userAgent } });
  if (!res.ok) throw new Error(`Feed ${url} → HTTP ${res.status}`);
  const xml = await res.text();

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    cdataPropName: '#cdata',
  });
  const data = parser.parse(xml);
  const channel = data?.rss?.channel || null;
  const rawItems = channel?.item;
  const items = rawItems ? (Array.isArray(rawItems) ? rawItems : [rawItems]) : [];
  return { channel, items, rawXml: xml };
}

async function upsertChannelMetadata(channel: any, rawXml: string) {
  const m = extractChannelMetadata(channel);

  await sql`
    INSERT INTO podcast_metadata (
      tenant_id, title, subtitle, description, author,
      owner_name, owner_email, managing_editor, language, copyright,
      explicit, podcast_type, image_url, itunes_image_url, link, new_feed_url,
      categories, keywords, social_links, contact_emails,
      last_build_date, generator, raw_channel_xml, updated_at
    ) VALUES (
      ${TENANT}, ${m.title}, ${m.subtitle}, ${m.description}, ${m.author},
      ${m.ownerName}, ${m.ownerEmail}, ${m.managingEditor}, ${m.language}, ${m.copyright},
      ${m.explicit}, ${m.podcastType}, ${m.imageUrl}, ${m.itunesImageUrl}, ${m.link}, ${m.newFeedUrl},
      ${JSON.stringify(m.categories)}::jsonb,
      ${m.keywords.length ? m.keywords : null},
      ${JSON.stringify(m.socialLinks)}::jsonb,
      ${m.contactEmails.length ? m.contactEmails : null},
      ${m.lastBuildDate ? new Date(m.lastBuildDate) : null},
      ${m.generator},
      ${rawXml.length > 500_000 ? rawXml.slice(0, 500_000) : rawXml},
      NOW()
    )
    ON CONFLICT (tenant_id) DO UPDATE SET
      title           = EXCLUDED.title,
      subtitle        = EXCLUDED.subtitle,
      description     = EXCLUDED.description,
      author          = EXCLUDED.author,
      owner_name      = EXCLUDED.owner_name,
      owner_email     = EXCLUDED.owner_email,
      managing_editor = EXCLUDED.managing_editor,
      language        = EXCLUDED.language,
      copyright       = EXCLUDED.copyright,
      explicit        = EXCLUDED.explicit,
      podcast_type    = EXCLUDED.podcast_type,
      image_url       = EXCLUDED.image_url,
      itunes_image_url= EXCLUDED.itunes_image_url,
      link            = EXCLUDED.link,
      new_feed_url    = EXCLUDED.new_feed_url,
      categories      = EXCLUDED.categories,
      keywords        = EXCLUDED.keywords,
      social_links    = EXCLUDED.social_links,
      contact_emails  = EXCLUDED.contact_emails,
      last_build_date = EXCLUDED.last_build_date,
      generator       = EXCLUDED.generator,
      raw_channel_xml = EXCLUDED.raw_channel_xml,
      updated_at      = NOW()
  `;
  return m;
}

async function main() {
  console.log(`[RSS-SCRAPE] start (tenant=${TENANT}, feeds=${FEEDS.length})`);

  const allItems: { source: string; parsed: ReturnType<typeof extractItem> }[] = [];
  let channelForMeta: any = null;
  let rawXmlForMeta = '';

  for (const feed of FEEDS) {
    try {
      const { channel, items, rawXml } = await fetchAndParse(feed.url);
      console.log(`  [feed] ${feed.name}: ${items.length} items`);
      if (!channelForMeta) { channelForMeta = channel; rawXmlForMeta = rawXml; }
      for (const it of items) {
        allItems.push({ source: feed.name, parsed: extractItem(it) });
      }
    } catch (e: any) {
      console.warn(`  [feed] ${feed.name}: FAIL ${e?.message}`);
    }
  }
  console.log(`  total items: ${allItems.length}`);

  // Upsert channel metadata
  if (channelForMeta) {
    const meta = await upsertChannelMetadata(channelForMeta, rawXmlForMeta);
    console.log(`  [channel] upsert OK — title="${meta.title}" author="${meta.author}" categories=${meta.categories.length}`);
  }

  // Publish frequency (tenant-wide)
  const pubDates = allItems.map((x) => x.parsed.pubDate).filter(Boolean) as string[];
  const freq = computePublishFrequencyDays(pubDates);
  console.log(`  [freq] publish_frequency_days (median) = ${freq ?? 'n/a'}`);

  // Charger episodes BDD du tenant pour matcher
  const episodes = (await sql`
    SELECT id, episode_number, title FROM episodes WHERE tenant_id = ${TENANT}
  `) as { id: number; episode_number: number | null; title: string }[];

  const byNumber = new Map<number, typeof episodes[0]>();
  const byTitle = new Map<string, typeof episodes[0]>();
  for (const e of episodes) {
    if (e.episode_number != null) byNumber.set(e.episode_number, e);
    byTitle.set(normalizeTitle(e.title), e);
  }

  let matched = 0, updated = 0, unmatched = 0;
  const stats = {
    withDuration: 0, withGuid: 0, withAudio: 0, withSponsors: 0,
    withLinks: 0, withCrossRefs: 0, withGuestFromTitle: 0, withImage: 0,
  };

  for (const { parsed } of allItems) {
    let dbRow: typeof episodes[0] | undefined;
    if (parsed.episodeNumber != null) dbRow = byNumber.get(parsed.episodeNumber);
    if (!dbRow && parsed.title) dbRow = byTitle.get(normalizeTitle(parsed.title));

    if (!dbRow) { unmatched++; continue; }
    matched++;

    if (parsed.durationSeconds != null) stats.withDuration++;
    if (parsed.guid) stats.withGuid++;
    if (parsed.audioUrl) stats.withAudio++;
    if (parsed.sponsors.length) stats.withSponsors++;
    if (parsed.links.length) stats.withLinks++;
    if (parsed.crossRefs.length) stats.withCrossRefs++;
    if (parsed.guestFromTitle.name) stats.withGuestFromTitle++;
    if (parsed.episodeImageUrl) stats.withImage++;

    // Parse des blocs structurés (topic, discover, refs, promo, chapters timestamps, youtube…)
    const descForParse = parsed.rssContentEncoded || parsed.description || '';
    const blocks = parseRssDescription(descForParse, { tenantId: TENANT });

    await sql`
      UPDATE episodes SET
        duration_seconds       = COALESCE(${parsed.durationSeconds}, duration_seconds),
        rss_description        = COALESCE(${parsed.description}, rss_description),
        rss_content_encoded    = COALESCE(${parsed.rssContentEncoded}, rss_content_encoded),
        guid                   = COALESCE(${parsed.guid}, guid),
        season                 = COALESCE(${parsed.season}, season),
        episode_type           = COALESCE(${parsed.episodeType}, episode_type),
        explicit               = COALESCE(${parsed.explicit}, explicit),
        audio_url              = COALESCE(${parsed.audioUrl}, audio_url),
        audio_size_bytes       = COALESCE(${parsed.audioSizeBytes}, audio_size_bytes),
        episode_image_url      = COALESCE(${parsed.episodeImageUrl}, episode_image_url),
        guest_from_title       = COALESCE(${parsed.guestFromTitle.name}, guest_from_title),
        sponsors               = ${JSON.stringify(parsed.sponsors)}::jsonb,
        rss_links              = ${JSON.stringify(parsed.links)}::jsonb,
        cross_refs             = ${JSON.stringify(parsed.crossRefs)}::jsonb,
        publish_frequency_days = COALESCE(${freq}, publish_frequency_days),
        rss_topic              = ${blocks.topic},
        rss_guest_intro        = ${blocks.guestIntro},
        rss_discover           = ${JSON.stringify(blocks.discover)}::jsonb,
        rss_references         = ${JSON.stringify(blocks.references)}::jsonb,
        rss_cross_episodes     = ${JSON.stringify(blocks.crossEpisodes)}::jsonb,
        rss_promo              = ${blocks.promo ? JSON.stringify(blocks.promo) : null}::jsonb,
        rss_chapters_ts        = ${JSON.stringify(blocks.chapters)}::jsonb,
        youtube_url            = ${blocks.youtubeUrl},
        cross_promo            = ${blocks.crossPromo}
      WHERE id = ${dbRow.id}
    `;
    updated++;
  }

  console.log('\n[RSS-SCRAPE] complete');
  console.log(`  Matched   : ${matched}/${allItems.length}`);
  console.log(`  Updated   : ${updated}`);
  console.log(`  Unmatched : ${unmatched}`);
  console.log(`  Coverage  :`);
  console.log(`    duration          : ${stats.withDuration}/${matched}`);
  console.log(`    guid              : ${stats.withGuid}/${matched}`);
  console.log(`    audio_url         : ${stats.withAudio}/${matched}`);
  console.log(`    episode_image     : ${stats.withImage}/${matched}`);
  console.log(`    guest_from_title  : ${stats.withGuestFromTitle}/${matched}`);
  console.log(`    sponsors detected : ${stats.withSponsors}/${matched}`);
  console.log(`    rss_links         : ${stats.withLinks}/${matched}`);
  console.log(`    cross_refs        : ${stats.withCrossRefs}/${matched}`);
}

main().catch((e) => {
  console.error('[RSS-SCRAPE] fatal', e);
  process.exit(1);
});
