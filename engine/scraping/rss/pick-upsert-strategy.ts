/**
 * Phase A.5.5a (2026-04-28) — choix de stratégie UPSERT pour ingest-rss.ts.
 *
 * Avant : 2 chemins {full → ON CONFLICT (tenant_id, episode_number),
 *                    bonus → ON CONFLICT (tenant_id, guid)}.
 * Bug : si un item RSS a `episodeType='full'` MAIS `episode_number=null`
 * (cas observé sur Le Panier #328 #319 #318 #125 #0 où Audiomeans ne
 * renvoie plus `<itunes:episode>`), le path "full" essayait d'INSERT avec
 * episode_number=NULL, ON CONFLICT (tenant_id, NULL) ne matchait aucun row,
 * → INSERT pur → uq_episodes_tenant_guid violation.
 *
 * Fix : 3-way branching. Si on n'a pas d'episode_number utilisable, fallback
 * sur le path guid (idempotent, gère la perte temporaire d'episode_number).
 *
 * Helper PUR (zero IO) pour pouvoir le tester unitairement sans mock DB.
 */

export type UpsertStrategy = 'episode_number' | 'guid' | 'skip';

export interface UpsertStrategyInput {
  /** valeur de <itunes:episodeType> RSS ('full' | 'bonus' | 'trailer' | null) */
  episodeType: string | null | undefined;
  /** valeur de <itunes:episode> RSS (number) ou null */
  episodeNumber: number | null | undefined;
  /** valeur de <guid> RSS (string) ou null */
  guid: string | null | undefined;
}

export function pickUpsertStrategy(parsed: UpsertStrategyInput): UpsertStrategy {
  const isFull = parsed.episodeType === 'full' || parsed.episodeType == null;
  const hasEpNum = isFull && parsed.episodeNumber != null;
  if (hasEpNum) return 'episode_number';
  if (parsed.guid) return 'guid';
  return 'skip';
}
