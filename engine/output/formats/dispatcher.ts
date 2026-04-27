// engine/output/formats/dispatcher.ts — route Livrable → Formatter selon config.
//
// Phase 7a : un livrable, un format. Phase V2 (prévu) : config peut spécifier
// un array de formats pour produire plusieurs versions simultanément.

import type { FormatterContext, FormatterOutput, Livrable, LivrableType, OutputFormat } from '../types';
import { DocxFormatter } from './docxFormatter';
import { MarkdownFormatter } from './markdownFormatter';
import { PdfFormatter } from './pdfFormatter';
import type { OutputFormatsConfig, OutputFormatter } from './types';
import { XlsxFormatter } from './xlsxFormatter';

export class FormatDispatcher {
  private readonly formatters = new Map<OutputFormat, OutputFormatter>();

  constructor(formatters?: OutputFormatter[]) {
    const list = formatters ?? defaultFormatters();
    for (const f of list) this.formatters.set(f.format, f);
  }

  /**
   * Détermine le format à utiliser pour un livrable donné. Retourne le format
   * de la config si déclaré, sinon throw (la config doit être exhaustive).
   */
  resolveFormat(type: LivrableType, config: OutputFormatsConfig): OutputFormat {
    const format = config[type];
    if (!format) {
      throw new Error(
        `FormatDispatcher.resolveFormat: no format configured for livrable "${type}". ` +
          `Configure outputFormats[${type}] in client config.`,
      );
    }
    return format;
  }

  /**
   * Convertit un livrable en sortie binaire au format spécifié dans la config.
   * Throw si format non supporté par le formatter résolu.
   */
  async dispatch(
    livrable: Livrable,
    config: OutputFormatsConfig,
    context: FormatterContext,
  ): Promise<FormatterOutput> {
    const format = this.resolveFormat(livrable.type, config);
    const formatter = this.formatters.get(format);
    if (!formatter) {
      throw new Error(
        `FormatDispatcher.dispatch: no formatter registered for format "${format}". ` +
          `Registered: ${[...this.formatters.keys()].join(', ')}`,
      );
    }
    if (!formatter.supportedLivrables.includes(livrable.type)) {
      throw new Error(
        `FormatDispatcher.dispatch: formatter "${format}" does not support livrable "${livrable.type}". ` +
          `Supported by ${format}: ${formatter.supportedLivrables.join(', ')}`,
      );
    }
    return formatter.formatLivrable(livrable, context);
  }

  /** Liste les formats enregistrés (utile pour diagnostics). */
  registeredFormats(): OutputFormat[] {
    return [...this.formatters.keys()];
  }
}

export function defaultFormatters(): OutputFormatter[] {
  return [new MarkdownFormatter(), new DocxFormatter(), new XlsxFormatter(), new PdfFormatter()];
}
