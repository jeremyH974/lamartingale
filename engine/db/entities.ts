import { neon } from '@neondatabase/serverless';
import type { Entity, EntityType, CreateEntityInput } from './types/entity';

// Helper minimal d'accès `entities`.
// Volontairement réduit à 2 fonctions (get + create). updateEntity /
// deleteEntity / listEntities seront ajoutées quand un cas d'usage les
// imposera (anti-overgeneralization).

function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error('[entities] DATABASE_URL not set');
  }
  return neon(process.env.DATABASE_URL);
}

function rowToEntity(row: Record<string, unknown>): Entity {
  return {
    id: Number(row.id),
    entity_type: row.entity_type as EntityType,
    canonical_slug: String(row.canonical_slug),
    display_name: String(row.display_name),
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    created_at: new Date(String(row.created_at)),
    updated_at: new Date(String(row.updated_at)),
  };
}

export async function getEntityBySlug(
  slug: string,
  entityType: EntityType = 'person',
): Promise<Entity | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, entity_type, canonical_slug, display_name, metadata,
           created_at, updated_at
    FROM entities
    WHERE canonical_slug = ${slug}
      AND entity_type = ${entityType}
    LIMIT 1
  `) as Record<string, unknown>[];
  if (rows.length === 0) return null;
  return rowToEntity(rows[0]);
}

export async function createEntity(input: CreateEntityInput): Promise<Entity> {
  const sql = getSql();
  const metadata = input.metadata ?? {};
  const rows = (await sql`
    INSERT INTO entities (entity_type, canonical_slug, display_name, metadata)
    VALUES (${input.entity_type}, ${input.canonical_slug}, ${input.display_name},
            ${JSON.stringify(metadata)}::jsonb)
    RETURNING id, entity_type, canonical_slug, display_name, metadata,
              created_at, updated_at
  `) as Record<string, unknown>[];
  return rowToEntity(rows[0]);
}
