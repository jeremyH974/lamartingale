/**
 * persistEditorialEvents — Primitive : valide et persiste les éditorial_events.
 *
 * Discipline (cf. brief-primitives-2026-04-28.md, Phase 1.5) :
 * - Pure : pas d'accès DB direct, l'`insertBatchFn` est injectée. Le wrapper
 *   prod live dans engine/db/editorial-events.ts (livré en Phase 2 — table SQL
 *   créée par migration de l'Engagement 1).
 * - Validation metadata par type via registry zod injectable. Au démarrage
 *   (Phase 1) : seul `lens_classification` est enregistré par défaut. Les
 *   futurs schemas (key_moment, quote, cross_reference) seront ajoutés au
 *   registry depuis editorial-event-metadata.ts au fur et à mesure de leur
 *   définition (Phase 2 si besoin, sinon en Phase 5).
 * - Batch size 8 : finding Neon HTTP OOM > ~10 inserts parallèles.
 *
 * @see docs/brief-primitives-2026-04-28.md (Phase 1.5)
 * @see engine/db/types/editorial-event-metadata.ts
 */

import { z } from 'zod';
import { LensClassificationMetadataSchema } from '@engine/db/types/editorial-event-metadata';

const DEFAULT_BATCH_SIZE = 8;
const DEFAULT_SOURCE_TYPE = 'episode';

export const EditorialEventPositionSchema = z
  .object({
    start_seconds: z.number().nonnegative(),
    end_seconds: z.number().nonnegative(),
  })
  .refine((p) => p.end_seconds >= p.start_seconds, {
    message: 'end_seconds must be >= start_seconds',
    path: ['end_seconds'],
  });

export interface EditorialEventInput {
  type: string;
  position: { start_seconds: number; end_seconds: number };
  content_text?: string;
  metadata: unknown;
  lens_tags?: string[];
}

/**
 * Représentation d'un éditorial_event tel que stocké/retourné par la couche
 * DB. Pas de schema zod ici : c'est un retour DB-trusted, pas un input à
 * valider runtime.
 */
export interface EditorialEvent {
  id: string;
  source_id: string;
  source_type: string;
  type: string;
  position: { start_seconds: number; end_seconds: number };
  content_text: string | null;
  metadata: unknown;
  lens_tags: string[];
  created_at: string;
}

/**
 * Validator zod pour un type d'événement donné. Doit throw en cas
 * d'invalidation. Le retour n'est pas utilisé (on conserve l'objet original
 * pour le passer à insertBatchFn).
 */
export type MetadataValidator = (metadata: unknown) => unknown;

export type InsertBatchFn = (
  events: EditorialEventInput[],
  sourceId: string,
  sourceType: string,
) => Promise<EditorialEvent[]>;

export interface PersistEditorialEventsConfig {
  insertBatchFn: InsertBatchFn;
  batchSize?: number;
  /**
   * Map<type, validator>. Si un event a un `type` absent du map :
   *   - strictMode=true  : throw avant insertion
   *   - strictMode=false : warning, event accepté tel quel
   *
   * Le registry par défaut (cf. defaultValidators ci-dessous) contient
   * uniquement les schemas dont les schémas zod existent dans
   * editorial-event-metadata.ts à la date de cette primitive.
   */
  validators?: Map<string, MetadataValidator>;
  strictMode?: boolean;
}

export interface PersistEditorialEventsOptions {
  sourceId: string;
  sourceType?: string; // default 'episode'
}

export interface PersistEditorialEventsResult {
  events: EditorialEvent[];
  warnings: string[];
}

/**
 * Registry par défaut. À étendre dès qu'un nouveau schema metadata est
 * ajouté à editorial-event-metadata.ts (key_moment, quote, cross_reference,
 * audience_match…). Pas de spéculation : on n'enregistre que les schémas
 * dont le shape est défini.
 */
export function defaultValidators(): Map<string, MetadataValidator> {
  return new Map<string, MetadataValidator>([
    [
      'lens_classification',
      (meta: unknown) => LensClassificationMetadataSchema.parse(meta),
    ],
  ]);
}

export function chunkArray<T>(arr: T[], size: number): T[][] {
  if (size <= 0) throw new Error('chunkArray: size must be > 0');
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export async function persistEditorialEvents(
  events: EditorialEventInput[],
  options: PersistEditorialEventsOptions,
  config: PersistEditorialEventsConfig,
): Promise<PersistEditorialEventsResult> {
  if (!options.sourceId?.trim()) {
    throw new Error('persistEditorialEvents: sourceId is required');
  }
  if (!Array.isArray(events)) {
    throw new Error('persistEditorialEvents: events must be an array');
  }
  if (events.length === 0) {
    return { events: [], warnings: ['no events to persist (empty input)'] };
  }

  const sourceType = options.sourceType ?? DEFAULT_SOURCE_TYPE;
  const batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE;
  const validators = config.validators ?? defaultValidators();
  const strictMode = config.strictMode ?? false;

  const warnings: string[] = [];

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (typeof ev.type !== 'string' || !ev.type.trim()) {
      throw new Error(`persistEditorialEvents: event[${i}] missing 'type'`);
    }

    try {
      EditorialEventPositionSchema.parse(ev.position);
    } catch (err) {
      throw new Error(
        `persistEditorialEvents: event[${i}] invalid position: ${(err as Error).message.slice(0, 200)}`,
      );
    }

    const validator = validators.get(ev.type);
    if (validator) {
      try {
        validator(ev.metadata);
      } catch (err) {
        throw new Error(
          `persistEditorialEvents: event[${i}] metadata invalid for type '${ev.type}': ${(err as Error).message.slice(0, 300)}`,
        );
      }
    } else if (strictMode) {
      throw new Error(
        `persistEditorialEvents: event[${i}] type '${ev.type}' has no registered validator (strict mode)`,
      );
    } else {
      warnings.push(
        `event[${i}] type '${ev.type}' has no registered validator — accepted as-is`,
      );
    }
  }

  const allInserted: EditorialEvent[] = [];
  const batches = chunkArray(events, batchSize);
  for (const batch of batches) {
    const inserted = await config.insertBatchFn(batch, options.sourceId, sourceType);
    allInserted.push(...inserted);
  }

  return { events: allInserted, warnings };
}
