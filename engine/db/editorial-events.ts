/**
 * editorial-events DB helpers — wrappers Neon HTTP pour la table
 * `editorial_events` (créée par 2026-04-28-create-editorial-events.sql).
 *
 * Branche la primitive pure `engine/primitives/persistEditorialEvents.ts`
 * sur Postgres. Pure côté primitive (deps injectées) ; le pattern
 * d'orchestration vit ici (factory `createInsertBatchFn` + helpers de
 * lecture).
 *
 * Discipline :
 * - Toutes les écritures passent par `persistEditorialEvents` (validation
 *   zod par type via le registry). Ce module n'expose pas d'INSERT direct
 *   non validé.
 * - Lectures : pas de touch tenant_id (la table est multi-source par
 *   design — `source_id`/`source_type` portent l'identifiant). Si un jour
 *   on veut filtrer par tenant, on rajoute une colonne dédiée — pas
 *   maintenant (cap 4 anti-overgeneralization).
 */

import type { NeonQueryFunction } from '@neondatabase/serverless';
import type {
  EditorialEvent,
  EditorialEventInput,
  InsertBatchFn,
} from '@engine/primitives/persistEditorialEvents';

type SqlClient = NeonQueryFunction<false, false>;

/**
 * Factory d'insert batch — branche `persistEditorialEvents.insertBatchFn`
 * sur une connexion Neon active.
 *
 * Implémentation : un INSERT multi-rows par batch (le batching à 8 est
 * géré côté primitive). Returning *.
 */
export function createInsertBatchFn(sql: SqlClient): InsertBatchFn {
  return async (
    events: EditorialEventInput[],
    sourceId: string,
    sourceType: string,
  ): Promise<EditorialEvent[]> => {
    if (events.length === 0) return [];

    const rows: EditorialEvent[] = [];
    for (const ev of events) {
      const result = (await sql`
        INSERT INTO editorial_events (
          source_id, source_type, type, position,
          content_text, metadata, lens_tags
        ) VALUES (
          ${sourceId},
          ${sourceType},
          ${ev.type},
          ${JSON.stringify(ev.position)}::jsonb,
          ${ev.content_text ?? null},
          ${JSON.stringify(ev.metadata ?? {})}::jsonb,
          ${ev.lens_tags ?? []}
        )
        RETURNING
          id::text          AS id,
          source_id         AS source_id,
          source_type       AS source_type,
          type              AS type,
          position          AS position,
          content_text      AS content_text,
          metadata          AS metadata,
          lens_tags         AS lens_tags,
          created_at::text  AS created_at
      `) as Array<EditorialEvent>;
      if (result[0]) rows.push(result[0]);
    }
    return rows;
  };
}

export interface GetEditorialEventsBySourceOptions {
  types?: string[];
  lensTags?: string[];
  limit?: number;
}

/**
 * Lit les éditorial_events d'une source donnée, filtrés optionnellement
 * par type(s) et/ou lens_tags. Order: created_at ASC.
 */
export async function getEditorialEventsBySource(
  sql: SqlClient,
  sourceId: string,
  sourceType: string = 'episode',
  options: GetEditorialEventsBySourceOptions = {},
): Promise<EditorialEvent[]> {
  const limit = options.limit ?? 1000;
  const types = options.types ?? null;
  const lensTags = options.lensTags ?? null;

  // Conditional WHERE clauses are inline-tagged (pas de SQL builder magique
  // ici — les filtres sont peu nombreux et lisibles à plat).
  const result = (await sql`
    SELECT
      id::text          AS id,
      source_id         AS source_id,
      source_type       AS source_type,
      type              AS type,
      position          AS position,
      content_text      AS content_text,
      metadata          AS metadata,
      lens_tags         AS lens_tags,
      created_at::text  AS created_at
    FROM editorial_events
    WHERE source_id = ${sourceId}
      AND source_type = ${sourceType}
      AND (${types}::text[] IS NULL OR type = ANY(${types}::text[]))
      AND (${lensTags}::text[] IS NULL OR lens_tags && ${lensTags}::text[])
    ORDER BY created_at ASC
    LIMIT ${limit}
  `) as Array<EditorialEvent>;
  return result;
}

/**
 * Compte les éditorial_events d'une source. Utile pour debug / dashboards.
 */
export async function countEditorialEventsBySource(
  sql: SqlClient,
  sourceId: string,
  sourceType: string = 'episode',
): Promise<number> {
  const result = (await sql`
    SELECT count(*)::int AS c
    FROM editorial_events
    WHERE source_id = ${sourceId} AND source_type = ${sourceType}
  `) as Array<{ c: number }>;
  return result[0]?.c ?? 0;
}
