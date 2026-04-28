/**
 * Décision de rendu pour la section "Quand un podcast cite l'autre" du hub.
 *
 * Pourquoi ce module — historique :
 *   Avant 2026-04-28 le frontend rendait les 10 premières paires sans seuil.
 *   Audit hub UI 2026-04-28 (P0-4) a montré que sur le périmètre LM/GDIY/LP/FS/PP/CCG,
 *   seules 3-4 paires émergent réellement (LM↔GDIY dominent, FS/PP/CCG ont ~0
 *   articles scrapés donc pas de signal cross-ref). La liste rendue donnait
 *   l'impression d'un écosystème pauvre.
 *
 * Nouvelle règle (Phase A re-codée) :
 *   - On compte les paires "significatives" = celles avec >= MIN_SIGNIFICANT_REFS.
 *   - Si on a >= MIN_SIGNIFICANT_PAIRS paires significatives → mode 'normal'
 *     (rendu standard, top N).
 *   - Sinon → mode 'fallback' avec message explicite ET amorce des 3 paires
 *     top (même si < seuil refs) pour ne pas masquer le signal qu'on a.
 *   - Si 0 paire → fallback sans amorce.
 *
 * Ce module est pur, testable, et n'a aucune dépendance DB / I/O.
 */

export interface UniversePairStatLite {
  from: string;
  to: string;
  count: number;
}

export interface PairStatsRenderingDecision {
  mode: 'normal' | 'fallback';
  /** Paires à afficher (vide en fallback sans amorce, sinon top N). */
  display: UniversePairStatLite[];
  /** Paires d'amorce en mode fallback (top 3, peut être vide si 0 paire). */
  starter: UniversePairStatLite[];
  /** Diagnostic exposé pour debug + tests + telemetry frontend. */
  diagnostics: {
    totalPairs: number;
    significantPairs: number;
    minSignificantRefs: number;
    minSignificantPairs: number;
    topN: number;
  };
}

export interface DecidePairStatsRenderingOptions {
  /** Seuil minimum de refs pour qu'une paire soit "significative". Défaut 5. */
  minSignificantRefs?: number;
  /** Nombre minimum de paires significatives requises pour mode 'normal'. Défaut 5. */
  minSignificantPairs?: number;
  /** Limite de paires en mode 'normal'. Défaut 10. */
  topN?: number;
  /** Limite de paires en mode 'fallback' (amorce). Défaut 3. */
  starterN?: number;
}

const DEFAULTS: Required<DecidePairStatsRenderingOptions> = {
  minSignificantRefs: 5,
  minSignificantPairs: 5,
  topN: 10,
  starterN: 3,
};

export function decidePairStatsRendering(
  pairs: readonly UniversePairStatLite[],
  options: DecidePairStatsRenderingOptions = {},
): PairStatsRenderingDecision {
  const opts = { ...DEFAULTS, ...options };
  const sorted = [...pairs].sort((a, b) => b.count - a.count);
  const significant = sorted.filter((p) => p.count >= opts.minSignificantRefs);
  const diagnostics = {
    totalPairs: pairs.length,
    significantPairs: significant.length,
    minSignificantRefs: opts.minSignificantRefs,
    minSignificantPairs: opts.minSignificantPairs,
    topN: opts.topN,
  };

  if (significant.length >= opts.minSignificantPairs) {
    return {
      mode: 'normal',
      display: sorted.slice(0, opts.topN),
      starter: [],
      diagnostics,
    };
  }
  return {
    mode: 'fallback',
    display: [],
    starter: sorted.slice(0, opts.starterN),
    diagnostics,
  };
}
