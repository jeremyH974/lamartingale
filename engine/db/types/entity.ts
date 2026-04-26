// Types pour la table `entities` (généralisation polymorphe de
// cross_podcast_guests). Voir engine/db/migrations/2026-04-27-create-entities.sql.
//
// Règle anti-overgeneralization :
// - EntityType : 'person' (cas présent : cross_podcast_guests) +
//   'organization' (cas futur explicite ROADMAP_INTERNE.md : presse, cinéma,
//   talent). 'brand'/'place'/'work' ajoutés via ALTER quand cas concret.
// - EntityMetadataPerson : seul shape typé pour le pilote (cas présent).
//   Le shape pour 'organization' sera ajouté quand on construira presse/cinéma.

export type EntityType = 'person' | 'organization';

export const ENTITY_TYPES: readonly EntityType[] = [
  'person',
  'organization',
] as const;

export interface Entity {
  id: number;
  entity_type: EntityType;
  canonical_slug: string;
  display_name: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

// Shape de `metadata` quand `entity_type === 'person'`.
// Reproduit l'information actuellement stockée sur cross_podcast_guests
// (linkedin_url, instagram_url, website_url, bio, tenant_appearances) en
// version généralisée podcasts_appearances pour préserver la sémantique
// cross-podcast déjà éprouvée.
export interface EntityMetadataPerson {
  linkedin_url?: string;
  twitter_url?: string;
  instagram_url?: string;
  website_url?: string;
  bio_short?: string;
  podcasts_appearances?: Array<{
    podcast: string;
    episodes: number[];
    role: 'guest' | 'host';
  }>;
}

export interface CreateEntityInput {
  entity_type: EntityType;
  canonical_slug: string;
  display_name: string;
  metadata?: Record<string, unknown>;
}
