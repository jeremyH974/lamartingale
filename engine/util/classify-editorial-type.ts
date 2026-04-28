/**
 * Classification du TYPE ÉDITORIAL d'un épisode à partir de son titre RSS brut.
 *
 * À NE PAS CONFONDRE avec `episode_type` (colonne SQL de même schema), qui
 * stocke la sémantique iTunes RSS du tag `<itunes:episodeType>` (full | bonus |
 * trailer). Ces deux notions sont ORTHOGONALES :
 *
 *   episode_type     | editorial_type | exemple
 *   ─────────────────┼────────────────┼──────────────────────────────────────
 *   full   (iTunes)  | full           | "#535 - Marwan Mery"
 *   full   (iTunes)  | extract        | "[EXTRAIT] Clément Buyse" (Finscale)
 *   bonus  (iTunes)  | hs             | "#HS 1 to 1 Monaco"
 *   trailer          | teaser         | "[teaser] Saison 5"
 *
 * Le hub queries en double filtre :
 *   (episode_type='full' OR episode_type IS NULL) AND editorial_type='full'
 *
 * Phase A.5.4 (2026-04-28) — la règle est appliquée :
 *   1) au backfill des episodes existants (scripts/migrate-editorial-type.ts)
 *   2) à l'INSERT de chaque nouvel épisode dans engine/scraping/ingest-rss.ts
 *
 * Source de vérité unique : si tu modifies les regex, mets à jour les deux
 * call sites + relance le backfill (--dry/--write).
 *
 * Hypothèses :
 *   - title est le titre RSS brut, pas un titre nettoyé pour l'affichage
 *   - title peut être null/undefined/vide → 'unknown'
 *   - patterns testés en lower-case implicite (regex avec flag /i)
 *   - "extract" couvre [EXTRAIT] (français) ET [EXCERPT] (anglais Finscale)
 *   - "rediff" couvre [REDIFF], [REDIFFUSION], [REPLAY]
 *   - "hs" couvre les hors-séries : "#HS …", "#HS-…", "Hors-série", "Hors série"
 *   - les markers sont mutuellement exclusifs (1 seul attribué) ;
 *     ordre de priorité = ordre des cases ci-dessous
 */

export type EditorialType =
  | 'full'
  | 'extract'
  | 'teaser'
  | 'rediff'
  | 'bonus'
  | 'hs'
  | 'unknown';

const PATTERNS: Array<{ type: Exclude<EditorialType, 'full' | 'unknown'>; re: RegExp }> = [
  { type: 'extract', re: /\[(extrait|excerpt)\]/i },
  { type: 'teaser', re: /\[teaser\]/i },
  { type: 'rediff', re: /\[(rediff(?:usion)?|replay)\]/i },
  { type: 'bonus', re: /\[bonus\]/i },
  { type: 'hs', re: /^\s*#?\s*HS\b|hors[- ]?s[ée]rie/i },
];

export function classifyEditorialType(title: string | null | undefined): EditorialType {
  if (title == null) return 'unknown';
  const t = String(title);
  if (!t.trim()) return 'unknown';
  for (const { type, re } of PATTERNS) {
    if (re.test(t)) return type;
  }
  return 'full';
}
