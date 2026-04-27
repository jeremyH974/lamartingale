// engine/output/formats/pdfFormatter.ts — placeholder V2.
//
// Phase 7a : pdf n'est PAS implémenté. Throw NotImplementedError pour signaler
// explicitement le scope V2 plutôt que produire un fichier vide silencieux.
// Quand V2 atterrira, deux options envisagées dans le brief Phase 7a :
//   (a) docx → pdf via LibreOffice headless (cohérence avec les autres
//       livrables docx, mais dépend de LibreOffice présent sur le runner)
//   (b) génération native via puppeteer (HTML → PDF, plus contrôle stylé)
// Décision déférée à la phase pdf concrète.

import {
  MIME_TYPES,
  NotImplementedError,
  type FormatterContext,
  type FormatterOutput,
  type Livrable,
  type LivrableType,
} from '../types';
import type { OutputFormatter } from './types';

// Quand pdf sera implémenté V2, il couvrira tous les livrables (équivalent à
// docx + xlsx → pdf). On déclare ce scope dès maintenant pour que le
// dispatcher délègue à pdfFormatter et hérite du throw NotImplementedError
// (signal explicite "pas encore implémenté"), au lieu de "format non supporté".
const SUPPORTED: readonly LivrableType[] = [
  'L1_keyMoments',
  'L2_quotes',
  'L3_crossRefs',
  'L4_newsletter',
  'L5_briefAnnexe',
];

export class PdfFormatter implements OutputFormatter {
  readonly format = 'pdf' as const;
  readonly supportedLivrables = SUPPORTED;

  async formatLivrable(
    _livrable: Livrable,
    _context: FormatterContext,
  ): Promise<FormatterOutput> {
    void MIME_TYPES; // silence unused import in V1
    throw new NotImplementedError(
      'PDF format scheduled for V2 — see engine/output/formats/pdfFormatter.ts header',
    );
  }
}
