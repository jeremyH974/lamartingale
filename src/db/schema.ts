import { pgTable, serial, integer, text, timestamp, real, jsonb, unique, index, customType } from 'drizzle-orm/pg-core';

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
// Tables
// ============================================================================

export const episodes = pgTable('episodes', {
  id: serial('id').primaryKey(),
  episodeNumber: integer('episode_number').unique(),
  title: text('title').notNull(),
  slug: text('slug'),
  guest: text('guest'),
  pillar: text('pillar').notNull(),
  difficulty: text('difficulty'),
  dateCreated: timestamp('date_created'),
  abstract: text('abstract'),
  articleUrl: text('article_url'),
  url: text('url'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_episodes_pillar').on(table.pillar),
  index('idx_episodes_difficulty').on(table.difficulty),
  index('idx_episodes_guest').on(table.guest),
  index('idx_episodes_date').on(table.dateCreated),
]);

export const episodesMedia = pgTable('episodes_media', {
  id: serial('id').primaryKey(),
  episodeId: integer('episode_id').references(() => episodes.id),
  thumbnail350: text('thumbnail_350'),
  thumbnailFull: text('thumbnail_full'),
  audioPlayerUrl: text('audio_player_url'),
});

export const episodesEnrichment = pgTable('episodes_enrichment', {
  id: serial('id').primaryKey(),
  episodeId: integer('episode_id').references(() => episodes.id),
  tags: text('tags').array(),
  subThemes: text('sub_themes').array(),
  searchText: text('search_text'),
  embedding: vector('embedding'),
});

export const guests = pgTable('guests', {
  id: serial('id').primaryKey(),
  name: text('name').unique().notNull(),
  company: text('company'),
  bio: text('bio'),
  specialty: text('specialty').array(),
  authorityScore: integer('authority_score'),
  episodesCount: integer('episodes_count'),
});

export const guestEpisodes = pgTable('guest_episodes', {
  id: serial('id').primaryKey(),
  guestId: integer('guest_id').references(() => guests.id),
  episodeId: integer('episode_id').references(() => episodes.id),
}, (table) => [
  unique('uq_guest_episode').on(table.guestId, table.episodeId),
]);

export const quizQuestions = pgTable('quiz_questions', {
  id: serial('id').primaryKey(),
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
]);

export const taxonomy = pgTable('taxonomy', {
  id: serial('id').primaryKey(),
  pillar: text('pillar').unique().notNull(),
  name: text('name'),
  color: text('color'),
  icon: text('icon'),
  episodeCount: integer('episode_count'),
  subThemes: text('sub_themes').array(),
});

export const learningPaths = pgTable('learning_paths', {
  id: serial('id').primaryKey(),
  pathId: text('path_id').unique().notNull(),
  name: text('name').notNull(),
  description: text('description'),
  difficulty: text('difficulty'),
  estimatedHours: real('estimated_hours'),
  targetAudience: text('target_audience'),
  prerequisites: text('prerequisites').array(),
  outcomes: text('outcomes').array(),
  episodesOrdered: jsonb('episodes_ordered').$type<{ order: number; episode_id: number; why: string }[]>(),
});

export const episodeSimilarities = pgTable('episode_similarities', {
  id: serial('id').primaryKey(),
  episodeId: integer('episode_id').references(() => episodes.id),
  similarEpisodeId: integer('similar_episode_id').references(() => episodes.id),
  similarityScore: real('similarity_score'),
}, (table) => [
  unique('uq_similarity').on(table.episodeId, table.similarEpisodeId),
  index('idx_similarity_episode').on(table.episodeId),
]);
