import { pgTable, serial, integer, bigint, boolean, text, timestamp, real, jsonb, unique, index, customType } from 'drizzle-orm/pg-core';

// ============================================================================
// Custom type: pgvector (vector column)
// ============================================================================
const vector = customType<{ data: number[]; driverParam: string }>({
  dataType() { return 'vector(3072)'; },
  toDriver(value: number[]): string { return `[${value.join(',')}]`; },
  fromDriver(value: unknown): number[] {
    if (typeof value !== 'string') return [];
    return value.replace(/[\[\]]/g, '').split(',').map(Number);
  },
});

// ============================================================================
// Multi-tenant column helper — utilisé par toutes les tables.
// DEFAULT 'lamartingale' pour rétrocompat.
// ============================================================================
const tenantId = () => text('tenant_id').notNull().default('lamartingale');

// ============================================================================
// Tables
// ============================================================================

export const episodes = pgTable('episodes', {
  id: serial('id').primaryKey(),
  tenantId: tenantId(),
  episodeNumber: integer('episode_number'),
  title: text('title').notNull(),
  slug: text('slug'),
  guest: text('guest'),
  guestCompany: text('guest_company'),
  guestBio: text('guest_bio'),
  pillar: text('pillar').notNull(),
  difficulty: text('difficulty'),
  dateCreated: timestamp('date_created'),
  abstract: text('abstract'),
  articleContent: text('article_content'),
  articleHtml: text('article_html'),
  chapters: jsonb('chapters').$type<{ title: string; order: number; timestamp_seconds?: number }[]>().default([]),
  durationSeconds: integer('duration_seconds'),
  rssDescription: text('rss_description'),
  keyTakeaways: jsonb('key_takeaways').$type<string[]>(),
  relatedEpisodes: jsonb('related_episodes').$type<number[]>(),
  externalReferences: jsonb('external_references').$type<{ title: string; url: string }[]>(),
  communityRating: real('community_rating'),
  sponsor: text('sponsor'),
  articleUrl: text('article_url'),
  url: text('url'),
  // === RSS exhaustive extraction (M3.1) — "capturer maintenant, exploiter plus tard" ===
  season: integer('season'),
  episodeType: text('episode_type'),                       // full|trailer|bonus
  explicit: boolean('explicit'),
  guid: text('guid'),                                      // itunes GUID canonique
  audioUrl: text('audio_url'),
  audioSizeBytes: bigint('audio_size_bytes', { mode: 'number' }),
  rssContentEncoded: text('rss_content_encoded'),
  episodeImageUrl: text('episode_image_url'),
  guestFromTitle: text('guest_from_title'),
  sponsors: jsonb('sponsors').$type<{ name: string; context?: string }[]>().default([]),
  rssLinks: jsonb('rss_links').$type<{ url: string; label?: string; link_type?: string }[]>().default([]),
  crossRefs: jsonb('cross_refs').$type<{ podcast?: string; episode_ref?: string; url?: string }[]>().default([]),
  publishFrequencyDays: real('publish_frequency_days'),
  // === RSS parsed description blocks (M4) — structure extraite de rss_description ===
  rssTopic: text('rss_topic'),
  rssGuestIntro: text('rss_guest_intro'),
  rssDiscover: jsonb('rss_discover').$type<string[]>().default([]),
  rssReferences: jsonb('rss_references').$type<{ label: string; url?: string }[]>().default([]),
  rssCrossEpisodes: jsonb('rss_cross_episodes').$type<{ number: number; title?: string }[]>().default([]),
  rssPromo: jsonb('rss_promo').$type<{ code?: string; partner?: string; url?: string; description?: string } | null>(),
  rssChaptersTs: jsonb('rss_chapters_ts').$type<{ title: string; timestamp_seconds: number; order: number }[]>().default([]),
  youtubeUrl: text('youtube_url'),
  crossPromo: text('cross_promo'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  unique('uq_episodes_tenant_episode_number').on(table.tenantId, table.episodeNumber),
  index('idx_episodes_pillar').on(table.pillar),
  index('idx_episodes_difficulty').on(table.difficulty),
  index('idx_episodes_guest').on(table.guest),
  index('idx_episodes_date').on(table.dateCreated),
  index('idx_episodes_tenant_pillar').on(table.tenantId, table.pillar),
  index('idx_episodes_guid').on(table.guid),
  index('idx_episodes_tenant_guid').on(table.tenantId, table.guid),
  index('idx_episodes_season').on(table.tenantId, table.season),
]);

export const episodesMedia = pgTable('episodes_media', {
  id: serial('id').primaryKey(),
  tenantId: tenantId(),
  episodeId: integer('episode_id').references(() => episodes.id),
  thumbnail350: text('thumbnail_350'),
  thumbnailFull: text('thumbnail_full'),
  audioPlayerUrl: text('audio_player_url'),
});

export const episodesEnrichment = pgTable('episodes_enrichment', {
  id: serial('id').primaryKey(),
  tenantId: tenantId(),
  episodeId: integer('episode_id').references(() => episodes.id),
  tags: text('tags').array(),
  subThemes: text('sub_themes').array(),
  searchText: text('search_text'),
  embedding: vector('embedding'),
});

export const guests = pgTable('guests', {
  id: serial('id').primaryKey(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  company: text('company'),
  bio: text('bio'),
  specialty: text('specialty').array(),
  authorityScore: integer('authority_score'),
  episodesCount: integer('episodes_count'),
  linkedinUrl: text('linkedin_url'),
}, (table) => [
  unique('uq_guests_tenant_name').on(table.tenantId, table.name),
  index('idx_guests_tenant_name').on(table.tenantId, table.name),
]);

export const episodeLinks = pgTable('episode_links', {
  id: serial('id').primaryKey(),
  tenantId: tenantId(),
  episodeId: integer('episode_id').references(() => episodes.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  label: text('label'),
  linkType: text('link_type').notNull(),   // 7 types PUSH : 'resource' | 'linkedin' | 'social' | 'episode_ref' | 'company' | 'tool' | 'cross_podcast_ref'  (voir scripts/sync-rss-links-to-episode-links.ts ; 'audio' et 'other' sont DROP)
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  unique('uq_episode_link').on(table.episodeId, table.url),
  index('idx_episode_links_episode').on(table.episodeId),
  index('idx_episode_links_type').on(table.linkType),
  index('idx_episode_links_tenant_type').on(table.tenantId, table.linkType),
]);

export const guestEpisodes = pgTable('guest_episodes', {
  id: serial('id').primaryKey(),
  tenantId: tenantId(),
  guestId: integer('guest_id').references(() => guests.id),
  episodeId: integer('episode_id').references(() => episodes.id),
}, (table) => [
  unique('uq_guest_episode').on(table.guestId, table.episodeId),
]);

export const quizQuestions = pgTable('quiz_questions', {
  id: serial('id').primaryKey(),
  tenantId: tenantId(),
  episodeId: integer('episode_id').references(() => episodes.id),
  question: text('question').notNull(),
  options: jsonb('options').notNull().$type<string[]>(),
  correctAnswer: integer('correct_answer').notNull(),
  explanation: text('explanation'),
  difficulty: text('difficulty'),
  pillar: text('pillar'),
}, (table) => [
  index('idx_quiz_episode').on(table.episodeId),
  index('idx_quiz_pillar').on(table.pillar),
  index('idx_quiz_tenant_pillar').on(table.tenantId, table.pillar),
]);

export const taxonomy = pgTable('taxonomy', {
  id: serial('id').primaryKey(),
  tenantId: tenantId(),
  pillar: text('pillar').notNull(),
  name: text('name'),
  color: text('color'),
  icon: text('icon'),
  episodeCount: integer('episode_count'),
  subThemes: text('sub_themes').array(),
}, (table) => [
  unique('uq_taxonomy_tenant_pillar').on(table.tenantId, table.pillar),
]);

export const learningPaths = pgTable('learning_paths', {
  id: serial('id').primaryKey(),
  tenantId: tenantId(),
  pathId: text('path_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  difficulty: text('difficulty'),
  estimatedHours: real('estimated_hours'),
  targetAudience: text('target_audience'),
  prerequisites: text('prerequisites').array(),
  outcomes: text('outcomes').array(),
  episodesOrdered: jsonb('episodes_ordered').$type<{ order: number; episode_id: number; why: string }[]>(),
}, (table) => [
  unique('uq_learning_paths_tenant_path_id').on(table.tenantId, table.pathId),
]);

// Channel-level RSS metadata (1 ligne par tenant). Rempli par scrape-rss.ts.
export const podcastMetadata = pgTable('podcast_metadata', {
  id: serial('id').primaryKey(),
  tenantId: text('tenant_id').notNull().unique(),
  title: text('title'),
  subtitle: text('subtitle'),
  description: text('description'),
  author: text('author'),
  ownerName: text('owner_name'),
  ownerEmail: text('owner_email'),
  managingEditor: text('managing_editor'),
  language: text('language'),
  copyright: text('copyright'),
  explicit: boolean('explicit'),
  podcastType: text('podcast_type'),
  imageUrl: text('image_url'),
  itunesImageUrl: text('itunes_image_url'),
  link: text('link'),
  newFeedUrl: text('new_feed_url'),
  categories: jsonb('categories').$type<{ text: string; sub?: string[] }[]>().default([]),
  keywords: text('keywords').array(),
  socialLinks: jsonb('social_links').$type<{ platform: string; url: string }[]>().default([]),
  contactEmails: text('contact_emails').array(),
  lastBuildDate: timestamp('last_build_date'),
  generator: text('generator'),
  rawChannelXml: text('raw_channel_xml'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Vue unifiée des invités de l'univers MS — pas scoped tenant.
// Peuplée par src/cross/match-guests.ts. tenant_appearances jsonb décrit
// les apparitions par tenant : [{ tenant_id, episode_numbers: [136, 198] }].
export const crossPodcastGuests = pgTable('cross_podcast_guests', {
  id: serial('id').primaryKey(),
  canonicalName: text('canonical_name').notNull().unique(),
  displayName: text('display_name').notNull(),
  bio: text('bio'),
  linkedinUrl: text('linkedin_url'),
  instagramUrl: text('instagram_url'),
  websiteUrl: text('website_url'),
  tenantAppearances: jsonb('tenant_appearances').$type<{ tenant_id: string; episode_numbers: number[] }[]>().default([]),
  totalEpisodes: integer('total_episodes').default(0),
  totalPodcasts: integer('total_podcasts').default(0),
  isHost: boolean('is_host').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// Auth Phase E — magic-link passwordless + podcast_access scoping
// ============================================================================

// 1 ligne = 1 droit d'accès (email × tenant).
// role='viewer' par défaut ; role='root' = bypass filtre (voit tous les tenants).
// Pour un utilisateur root, on insère 1 ligne sentinel avec tenant_id='*'
// (convention : tenant_id='*' signifie "tous les tenants").
export const podcastAccess = pgTable('podcast_access', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  tenantId: text('tenant_id').notNull(), // '*' pour root
  role: text('role').notNull().default('viewer'), // 'viewer' | 'root'
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  unique('uq_podcast_access_email_tenant').on(table.email, table.tenantId),
  index('idx_podcast_access_email').on(table.email),
]);

// Magic-link one-shot : envoyé par email, consommé en GET /api/auth/consume.
// TTL 15 min géré côté app (expires_at).
export const magicLink = pgTable('magic_link', {
  token: text('token').primaryKey(), // crypto.randomBytes(32).toString('hex')
  email: text('email').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  consumed: boolean('consumed').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_magic_link_email').on(table.email),
]);

export const episodeSimilarities = pgTable('episode_similarities', {
  id: serial('id').primaryKey(),
  tenantId: tenantId(),
  episodeId: integer('episode_id').references(() => episodes.id),
  similarEpisodeId: integer('similar_episode_id').references(() => episodes.id),
  similarityScore: real('similarity_score'),
}, (table) => [
  unique('uq_similarity').on(table.episodeId, table.similarEpisodeId),
  index('idx_similarity_episode').on(table.episodeId),
]);
