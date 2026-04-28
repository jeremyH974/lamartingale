// engine/output/formats/xlsxFormatter.ts — produit des .xlsx pro pour L1/L2.
//
// Phase 7a : couvre Key moments (timestamps + saliency) et Quotes (verbatim
// social-ready). Choix biblio : `exceljs` (standard Node de fait pour styling
// Excel — couleur fond header, freeze, largeurs colonnes). SheetJS Community
// ne supporte pas les styles ; xlsx-js-style serait une alternative mais
// exceljs est plus mature et téléchargé. Documenté dans STOP Phase 7a.
//
// Skill xlsx (anthropic-skills:xlsx) consultée, mais l'écosystème de la
// skill est Python (openpyxl + LibreOffice recalc.py) — incompatible avec
// le projet Node TS. Les principes appliqués : police pro consistante,
// headers stylés, freeze panes, largeurs colonnes adaptées.

import ExcelJS from 'exceljs';
import {
  MIME_TYPES,
  type FormatterContext,
  type FormatterOutput,
  type KeyMomentsLivrable,
  type Livrable,
  type LivrableType,
  type QuotesLivrable,
} from '../types';
import { getFilenameForLivrable } from './markdownFormatter';
import type { OutputFormatter } from './types';

const SUPPORTED: readonly LivrableType[] = ['L1_keyMoments', 'L2_quotes'];
const DEFAULT_BRAND = '1F4E79';
const HEADER_TEXT_COLOR = 'FFFFFF';

export class XlsxFormatter implements OutputFormatter {
  readonly format = 'xlsx' as const;
  readonly supportedLivrables = SUPPORTED;

  async formatLivrable(
    livrable: Livrable,
    context: FormatterContext,
  ): Promise<FormatterOutput> {
    if (!SUPPORTED.includes(livrable.type)) {
      throw new Error(
        `XlsxFormatter does not support livrable type "${livrable.type}". Supported: ${SUPPORTED.join(', ')}`,
      );
    }
    const brand = context.brandPrimary || DEFAULT_BRAND;
    const wb = new ExcelJS.Workbook();
    wb.creator = `Sillon (${context.clientDisplayName})`;
    wb.created = new Date(context.generatedAt);

    if (livrable.type === 'L1_keyMoments') {
      buildKeyMomentsSheet(wb, livrable, brand);
    } else if (livrable.type === 'L2_quotes') {
      buildQuotesSheet(wb, livrable, brand);
    }

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return {
      filename: getFilenameForLivrable(livrable.type, 'xlsx'),
      buffer,
      mimeType: MIME_TYPES.xlsx,
    };
  }
}

function buildKeyMomentsSheet(wb: ExcelJS.Workbook, l: KeyMomentsLivrable, brand: string) {
  const sheet = wb.addWorksheet('Key moments', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  const columns: Partial<ExcelJS.Column>[] = [
    { header: '#', key: 'numero', width: 4 },
    { header: 'Titre', key: 'titre', width: 40 },
    { header: 'Début', key: 'start', width: 9 },
    { header: 'Fin', key: 'end', width: 9 },
    { header: 'Saliency', key: 'saliency', width: 10 },
    { header: 'Quote / extrait', key: 'quote', width: 60 },
    { header: "Pourquoi c'est saillant", key: 'pourquoi', width: 70 },
  ];
  sheet.columns = columns;

  styleHeaderRow(sheet.getRow(1), brand);

  for (const m of l.moments) {
    const row = sheet.addRow({
      numero: m.numero,
      titre: m.titre,
      start: m.timestampStart,
      end: m.timestampEnd,
      saliency: m.saliency,
      quote: m.quote,
      pourquoi: m.pourquoi,
    });
    styleDataRow(row);
    row.getCell('saliency').numFmt = '0.00';
  }
  applyDefaultFont(sheet);
}

function buildQuotesSheet(wb: ExcelJS.Workbook, l: QuotesLivrable, brand: string) {
  const sheet = wb.addWorksheet('Quotes', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  const columns: Partial<ExcelJS.Column>[] = [
    { header: '#', key: 'numero', width: 4 },
    { header: 'Citation verbatim', key: 'text', width: 70 },
    { header: 'Auteur', key: 'auteur', width: 22 },
    { header: 'Timestamp', key: 'timestamp', width: 10 },
    { header: 'Plateformes suggérées', key: 'plateformes', width: 22 },
    { header: 'Pourquoi cette citation', key: 'pourquoi', width: 60 },
  ];
  sheet.columns = columns;

  styleHeaderRow(sheet.getRow(1), brand);

  for (const q of l.quotes) {
    const row = sheet.addRow({
      numero: q.numero,
      text: q.text,
      auteur: q.auteur,
      timestamp: q.timestamp,
      plateformes: q.plateformes.join(', '),
      pourquoi: q.pourquoi,
    });
    styleDataRow(row);
  }
  applyDefaultFont(sheet);
}

function styleHeaderRow(row: ExcelJS.Row, brand: string) {
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: HEADER_TEXT_COLOR } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: brand },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'CCCCCC' } },
    };
  });
}

function styleDataRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.alignment = { vertical: 'top', wrapText: true };
    cell.font = { name: 'Calibri', size: 11 };
  });
}

function applyDefaultFont(sheet: ExcelJS.Worksheet) {
  sheet.eachRow((row) => {
    if (row.height === undefined) {
      row.alignment = { vertical: 'top', wrapText: true };
    }
  });
}
