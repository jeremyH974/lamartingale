import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { neon } from '@neondatabase/serverless';
import { createEntity, getEntityBySlug } from '@engine/db/entities';
import { ENTITY_TYPES } from '@engine/db/types/entity';

// Tests `entities` table — DB-level (pattern tenant-isolation.test.ts).
// Skippe gracieusement si DATABASE_URL absent (CI headless).
//
// Préfixe slug `__test_entities__` pour cleanup ciblé sans toucher aux
// données réelles si la table est partagée avec d'autres entités.

const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

const SLUG_PREFIX = '__test_entities__';

d('entities table — schema + helpers', () => {
  // neon() instancié à l'exécution (pas au top-level) pour ne pas crasher
  // l'import quand DATABASE_URL est absent (vitest exécute la callback de
  // describe.skip pour discovery, donc une instanciation top-level throw).
  const getSql = () => neon(process.env.DATABASE_URL!);

  beforeAll(async () => {
    const sql = getSql();
    await sql`DELETE FROM entities WHERE canonical_slug LIKE ${SLUG_PREFIX + '%'}`;
  });

  afterAll(async () => {
    const sql = getSql();
    await sql`DELETE FROM entities WHERE canonical_slug LIKE ${SLUG_PREFIX + '%'}`;
  });

  it('1. createEntity + getEntityBySlug happy path (person)', async () => {
    const slug = `${SLUG_PREFIX}create-read`;
    const created = await createEntity({
      entity_type: 'person',
      canonical_slug: slug,
      display_name: 'Test Person',
      metadata: { linkedin_url: 'https://linkedin.com/in/test' },
    });
    expect(created.id).toBeGreaterThan(0);
    expect(created.entity_type).toBe('person');
    expect(created.canonical_slug).toBe(slug);
    expect(created.metadata).toMatchObject({ linkedin_url: 'https://linkedin.com/in/test' });

    const found = await getEntityBySlug(slug, 'person');
    expect(found).not.toBeNull();
    expect(found?.id).toBe(created.id);
    expect(found?.display_name).toBe('Test Person');

    const missing = await getEntityBySlug(`${SLUG_PREFIX}does-not-exist`, 'person');
    expect(missing).toBeNull();
  });

  it('2. CHECK constraint rejects invalid entity_type', async () => {
    const sql = getSql();
    await expect(
      sql`INSERT INTO entities (entity_type, canonical_slug, display_name)
          VALUES ('foo', ${SLUG_PREFIX + 'invalid'}, 'Foo')`,
    ).rejects.toThrow(/entities_type_check|check constraint/i);
  });

  it('3. canonical_slug UNIQUE constraint enforced', async () => {
    const slug = `${SLUG_PREFIX}unique-slug`;
    await createEntity({
      entity_type: 'person',
      canonical_slug: slug,
      display_name: 'First',
    });
    await expect(
      createEntity({
        entity_type: 'person',
        canonical_slug: slug,
        display_name: 'Duplicate',
      }),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it('4. ENTITY_TYPES constant matches CHECK constraint', () => {
    expect(ENTITY_TYPES).toEqual(['person', 'organization']);
  });
});
