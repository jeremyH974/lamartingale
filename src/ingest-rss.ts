/**
 * RSS ingestion — INSERT-first (upsert) pour un nouveau podcast.
 *
 * Différences avec scrape-rss.ts (UPDATE-only) :
 *   - Découvre le tenant via getConfig() / PODCAST_ID.
 *   - Pour chaque item RSS : INSERT ... ON CONFLICT (tenant_id, episode_number)
 *     DO UPDATE — idempotent, relançable sans risque.
 *   - Remplit TOUS les champs RSS exhaustifs (voir src/rss/extractors.ts).
 *   - pillar = 'UNCLASSIFIED' si taxonomy.mode === 'auto' (remplacé par
 *     auto-taxonomy à l'étape post-embeddings).
 *   - Slug dérivé du titre (sluggify) si absent.
 *   - Upsert podcast_metadata du canal.
 *
 * Usage :
 *   PODCAST_ID=gdiy npx tsx src/ingest-rss.ts
 *   PODCAST_ID=gdiy npx tsx src/ingest-rss.ts --limit 50       # pour debug
 *   PODCAST_ID=gdiy npx tsx src/ingest-rss.ts --dry            # preview (no DB write)
 */
import 'dotenv/config';
import * as fs from 'fs';
import { XMLParser } from 'fast-xml-parser';
import { neon } from '@neondatabase/serverless';
import { getConfig } from './config';
import { extractItem, extractChannelMetadata, computePublishFrequencyDays } from './rss/extractors';

const sql = neon(process.env.DATABASE_URL!);
const cfg = getConfig();
const TENANT = cfg.database.tenantId;

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry');
const limitFlag = argv.indexOf('--limit');
const LIMIT = limitFlag !== -1 ? parseInt(argv[limitFlag + 1], 10) || null : null;
const feedFileFlag = argv.indexOf('--feed-file');
const FEED_FILE = feedFileFlag !== -1 ? argv[feedFileFlag + 1] : null;

// Si --feed-file : on ignore les URLs RSS et on parse le fichier local (utile
// quand le CDN renvoie 403 ou pour rejouer sur un snapshot).
const FEEDS = FEED_FILE
  ? [{ name: `${cfg.name} (local:${FEED_FILE})`, url: `file://${FEED_FILE}` }]
  : [
      { name: cfg.name, url: cfg.rssFeeds.main },
      ...(cfg.rssFeeds.secondary ? [{ name: `${cfg.name} (secondary)`, url: cfg.rssFeeds.secondary }] : []),
    ];

function sluggify(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200);
}

async function fetchAndParse(url: string) {
  let xml: string;
  if (url.startsWith('file://')) {
    xml = fs.readFileSync(url.replace(/^file:\/\//, ''), 'utf-8');
  } else {
    const res = await fetch(url, {
      headers: {
        'User-Agent': cfg.scraping.userAgent,
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
    });
    if (!res.ok) throw new Error(`Feed ${url} → HTTP ${res.status}`);
    xml = await res.text();
  }
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
  if (DRY_RUN) {
    console.log('[dry] channel:', { title: m.title, author: m.author, categories: m.categories.length });
    return m;
  }
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
      title=EXCLUDED.title, subtitle=EXCLUDED.subtitle, description=EXCLUDED.description,
      author=EXCLUDED.author, owner_name=EXCLUDED.owner_name, owner_email=EXCLUDED.owner_email,
      managing_editor=EXCLUDED.managing_editor, language=EXCLUDED.language, copyright=EXCLUDED.copyright,
      explicit=EXCLUDED.explicit, podcast_type=EXCLUDED.podcast_type, image_url=EXCLUDED.image_url,
      itunes_image_url=EXCLUDED.itunes_image_url, link=EXCLUDED.link, new_feed_url=EXCLUDED.new_feed_url,
      categories=EXCLUDED.categories, keywords=EXCLUDED.keywords, social_links=EXCLUDED.social_links,
      contact_emails=EXCLUDED.contact_emails, last_build_date=EXCLUDED.last_build_date,
      generator=EXCLUDED.generator, raw_channel_xml=EXCLUDED.raw_channel_xml, updated_at=NOW()
  `;
  return m;
}

async function main() {
  console.log(`[INGEST-RSS] tenant=${TENANT} podcast=${cfg.id}${DRY_RUN ? ' (DRY-RUN)' : ''}${LIMIT ? ` limit=${LIMIT}` : ''}`);

  const all: { source: string; parsed: ReturnType<typeof extractItem> }[] = [];
  let channelForMeta: any = null;
  let rawXmlForMeta = '';

  for (const feed of FEEDS) {
    try {
      const { channel, items, rawXml } = await fetchAndParse(feed.url);
      console.log(`  [feed] ${feed.name}: ${items.length} items`);
      if (!channelForMeta) { channelForMeta = channel; rawXmlForMeta = rawXml; }
      for (const it of items) all.push({ source: feed.name, parsed: extractItem(it) });
    } catch (e: any) {
      console.warn(`  [feed] ${feed.name}: FAIL ${e?.message}`);
    }
  }

  const items = LIMIT ? all.slice(0, LIMIT) : all;
  console.log(`  total items: ${all.length}${LIMIT ? ` (limited to ${LIMIT})` : ''}`);

  // Channel metadata
  if (channelForMeta) {
    const meta = await upsertChannelMetadata(channelForMeta, rawXmlForMeta);
    console.log(`  [channel] upsert — title="${meta.title}" author="${meta.author}" categories=${meta.categories.length}`);
  }

  // Publish frequency
  const pubDates = items.map((x) => x.parsed.pubDate).filter(Boolean) as string[];
  const freq = computePublishFrequencyDays(pubDates);
  console.log(`  [freq] publish_frequency_days = ${freq ?? 'n/a'}`);

  // Pillar placeholder pour mode auto
  const pillarPlaceholder = cfg.taxonomy.mode === 'auto' ? 'UNCLASSIFIED' : (cfg.taxonomy.pillars?.[0]?.id || 'UNCLASSIFIED');

  // Détecter inserts vs updates avant d'écrire
  const existing = (await sql`
    SELECT episode_number FROM episodes WHERE tenant_id = ${TENANT} AND episode_number IS NOT NULL
  `) as { episode_number: number }[];
  const existingNums = new Set(existing.map((r) => r.episode_number));

  let inserted = 0, updated = 0, skipped = 0;
  const stats = { withGuid: 0, withAudio: 0, withImage: 0, withSponsors: 0, withLinks: 0 };

  for (const { parsed } of items) {
    if (parsed.episodeNumber == null) {
      skipped++;
      continue;
    }
    const isNew = !existingNums.has(parsed.episodeNumber);

    const slug = sluggify(parsed.title);
    const dateCreated = parsed.pubDate ? new Date(parsed.pubDate) : null;

    if (parsed.guid) stats.withGuid++;
    if (parsed.audioUrl) stats.withAudio++;
    if (parsed.episodeImageUrl) stats.withImage++;
    if (parsed.sponsors.length) stats.withSponsors++;
    if (parsed.links.length) stats.withLinks++;

    if (DRY_RUN) {
      if (isNew) inserted++; else updated++;
      continue;
    }

    await sql`
      INSERT INTO episodes (
        tenant_id, episode_number, title, slug, pillar, date_created,
        guid, season, episode_type, explicit,
        duration_seconds, audio_url, audio_size_bytes, episode_image_url,
        rss_description, rss_content_encoded, guest_from_title,
        sponsors, rss_links, cross_refs, publish_frequency_days
      ) VALUES (
        ${TENANT}, ${parsed.episodeNumber}, ${parsed.title}, ${slug}, ${pillarPlaceholder}, ${dateCreated},
        ${parsed.guid}, ${parsed.season}, ${parsed.episodeType}, ${parsed.explicit},
        ${parsed.durationSeconds}, ${parsed.audioUrl}, ${parsed.audioSizeBytes}, ${parsed.episodeImageUrl},
        ${parsed.description}, ${parsed.rssContentEncoded}, ${parsed.guestFromTitle.name},
        ${JSON.stringify(parsed.sponsors)}::jsonb,
        ${JSON.stringify(parsed.links)}::jsonb,
        ${JSON.stringify(parsed.crossRefs)}::jsonb,
        ${freq}
      )
      ON CONFLICT (tenant_id, episode_number) DO UPDATE SET
        title                = EXCLUDED.title,
        slug                 = COALESCE(EXCLUDED.slug, episodes.slug),
        date_created         = COALESCE(EXCLUDED.date_created, episodes.date_created),
        guid                 = COALESCE(EXCLUDED.guid, episodes.guid),
        season               = COALESCE(EXCLUDED.season, episodes.season),
        episode_type         = COALESCE(EXCLUDED.episode_type, episodes.episode_type),
        explicit             = COALESCE(EXCLUDED.explicit, episodes.explicit),
        duration_seconds     = COALESCE(EXCLUDED.duration_seconds, episodes.duration_seconds),
        audio_url            = COALESCE(EXCLUDED.audio_url, episodes.audio_url),
        audio_size_bytes     = COALESCE(EXCLUDED.audio_size_bytes, episodes.audio_size_bytes),
        episode_image_url    = COALESCE(EXCLUDED.episode_image_url, episodes.episode_image_url),
        rss_description      = COALESCE(EXCLUDED.rss_description, episodes.rss_description),
        rss_content_encoded  = COALESCE(EXCLUDED.rss_content_encoded, episodes.rss_content_encoded),
        guest_from_title     = COALESCE(EXCLUDED.guest_from_title, episodes.guest_from_title),
        sponsors             = EXCLUDED.sponsors,
        rss_links            = EXCLUDED.rss_links,
        cross_refs           = EXCLUDED.cross_refs,
        publish_frequency_days = COALESCE(EXCLUDED.publish_frequency_days, episodes.publish_frequency_days)
    `;
    if (isNew) inserted++; else updated++;
  }

  console.log('\n[INGEST-RSS] complete');
  console.log(`  Inserted           : ${inserted}`);
  console.log(`  Updated            : ${updated}`);
  console.log(`  Skipped (no epNum) : ${skipped}`);
  console.log(`  Coverage :`);
  console.log(`    guid              : ${stats.withGuid}/${items.length}`);
  console.log(`    audio_url         : ${stats.withAudio}/${items.length}`);
  console.log(`    episode_image     : ${stats.withImage}/${items.length}`);
  console.log(`    sponsors detected : ${stats.withSponsors}/${items.length}`);
  console.log(`    rss_links         : ${stats.withLinks}/${items.length}`);
}

main().catch((e) => { console.error('[INGEST-RSS] fatal', e); process.exit(1); });
