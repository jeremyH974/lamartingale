// engine/output/formats/types.ts — interface OutputFormatter (Décision 1).
//
// Un formatter convertit un Livrable structuré vers un fichier (FormatterOutput).
// Chaque formatter déclare son format + les types de livrables qu'il sait
// produire. Le dispatcher route Livrable → Formatter selon la config client.

import type {
  FormatterContext,
  FormatterOutput,
  Livrable,
  LivrableType,
  OutputFormat,
} from '../types';

export interface OutputFormatter {
  readonly format: OutputFormat;
  /** Types de livrables que ce formatter sait produire. */
  readonly supportedLivrables: readonly LivrableType[];

  /**
   * Convertit un Livrable structuré en fichier prêt à écrire.
   * Throw NotImplementedError si format V2 non encore implémenté (pdf).
   */
  formatLivrable(
    livrable: Livrable,
    context: FormatterContext,
  ): Promise<FormatterOutput>;
}

/**
 * Configuration outputFormats côté ClientConfig — décide quel format produire
 * pour chaque livrable. Phase 7a : valeur scalaire ('docx' | 'xlsx'). Phase V2
 * (prévu) : array `['docx', 'xlsx']` pour multi-format simultané.
 */
export type OutputFormatsConfig = Partial<Record<LivrableType, OutputFormat>>;
