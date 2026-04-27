// engine/output/formats/docxFormatter.ts — produit des .docx pro pour L3/L4/L5.
//
// Phase 7a (brief 2026-04-30) : couvre les livrables éditoriaux (cross-refs,
// newsletter, brief annexe). L1/L2 (tableaux timestamps/quotes) sont produits
// par xlsxFormatter — séparation par cas d'usage : édition collaborative
// (.docx) vs exploitation par community manager (.xlsx).
//
// Skill docx (anthropic-skills:docx) consultée :
// - page A4 explicite (11906 × 16838 DXA)
// - styles override avec IDs Heading1/Heading2/Heading3 + outlineLevel
// - jamais de bullet unicode, utiliser LevelFormat.BULLET
// - footer via PageNumber.CURRENT
// - pas de \n dans les TextRun (utiliser plusieurs Paragraph)

import {
  AlignmentType,
  Document,
  Footer,
  HeadingLevel,
  PageNumber,
  Packer,
  PageOrientation,
  Paragraph,
  TextRun,
  type IRunOptions,
} from 'docx';
import {
  MIME_TYPES,
  type BriefAnnexeLivrable,
  type CrossRefsLivrable,
  type FormatterContext,
  type FormatterOutput,
  type Livrable,
  type LivrableType,
  type NewsletterLivrable,
} from '../types';
import { getFilenameForLivrable } from './markdownFormatter';
import type { OutputFormatter } from './types';

const SUPPORTED: readonly LivrableType[] = ['L3_crossRefs', 'L4_newsletter', 'L5_briefAnnexe'];

const DEFAULT_BRAND = '1F4E79'; // bleu pro cohérent avec brief

export class DocxFormatter implements OutputFormatter {
  readonly format = 'docx' as const;
  readonly supportedLivrables = SUPPORTED;

  async formatLivrable(
    livrable: Livrable,
    context: FormatterContext,
  ): Promise<FormatterOutput> {
    if (!SUPPORTED.includes(livrable.type)) {
      throw new Error(
        `DocxFormatter does not support livrable type "${livrable.type}". Supported: ${SUPPORTED.join(', ')}`,
      );
    }
    const brand = context.brandPrimary || DEFAULT_BRAND;
    const doc = buildDocument(livrable, context, brand);
    const buffer = await Packer.toBuffer(doc);
    return {
      filename: getFilenameForLivrable(livrable.type, 'docx'),
      buffer,
      mimeType: MIME_TYPES.docx,
    };
  }
}

function buildDocument(livrable: Livrable, ctx: FormatterContext, brand: string): Document {
  const children: Paragraph[] =
    livrable.type === 'L3_crossRefs'
      ? buildCrossRefsBody(livrable, brand)
      : livrable.type === 'L4_newsletter'
        ? buildNewsletterBody(livrable)
        : livrable.type === 'L5_briefAnnexe'
          ? buildBriefAnnexeBody(livrable)
          : [];

  return new Document({
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22 } }, // 11pt = 22 half-points
      },
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 40, bold: true, font: 'Calibri', color: brand },
          paragraph: { spacing: { before: 240, after: 240 }, outlineLevel: 0 },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 32, bold: true, font: 'Calibri', color: brand },
          paragraph: { spacing: { before: 200, after: 160 }, outlineLevel: 1 },
        },
        {
          id: 'Heading3',
          name: 'Heading 3',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 28, bold: true, font: 'Calibri' },
          paragraph: { spacing: { before: 160, after: 120 }, outlineLevel: 2 },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            // A4 portrait — 11906 × 16838 DXA. orientation par défaut.
            size: { width: 11906, height: 16838, orientation: PageOrientation.PORTRAIT },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, // 1 inch
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: `Sillon — Pack pilote — ${ctx.generatedAt.slice(0, 10)} · `,
                    size: 16, // 8pt
                    color: '888888',
                  }),
                  new TextRun({
                    children: ['Page ', PageNumber.CURRENT],
                    size: 16,
                    color: '888888',
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
}

// L3 — Cross-refs by lens

function buildCrossRefsBody(l: CrossRefsLivrable, _brand: string): Paragraph[] {
  const out: Paragraph[] = [];
  out.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun(l.title)],
    }),
  );
  if (l.subtitle) {
    out.push(
      new Paragraph({
        children: [new TextRun({ text: l.subtitle, italics: true })],
        spacing: { after: 200 },
      }),
    );
  }
  if (l.filteringNote) {
    out.push(
      new Paragraph({
        children: [new TextRun({ text: l.filteringNote, italics: true, color: '666666' })],
        spacing: { after: 200 },
      }),
    );
  }
  for (const section of l.sections) {
    out.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun(section.lensIntro)],
      }),
    );
    for (const ref of section.refs) {
      out.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: buildRefHeadRuns(ref),
        }),
      );
      for (const para of ref.bodyParagraphs) {
        out.push(...renderInlineParagraphs(para));
      }
    }
  }
  if (l.skippedNote) {
    out.push(
      new Paragraph({
        children: [new TextRun({ text: l.skippedNote, italics: true, color: '888888' })],
        spacing: { before: 240 },
      }),
    );
  }
  return out;
}

// L4 — Newsletter

function buildNewsletterBody(l: NewsletterLivrable): Paragraph[] {
  const out: Paragraph[] = [];
  out.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun(l.title)],
    }),
  );
  out.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun(l.newsletterTitle)],
      spacing: { after: 240 },
    }),
  );
  for (let i = 0; i < l.sections.length; i++) {
    for (const para of l.sections[i]) {
      out.push(...renderInlineParagraphs(para, { spacing: { line: 360 } })); // 1.5 line spacing
    }
    if (i < l.sections.length - 1) {
      out.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: '· · ·', color: '888888' })],
          spacing: { before: 240, after: 240 },
        }),
      );
    }
  }
  if (l.footer) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: l.footer, italics: true, color: '888888' })],
        spacing: { before: 360 },
      }),
    );
  }
  return out;
}

// L5 — Brief annexe

function buildBriefAnnexeBody(l: BriefAnnexeLivrable): Paragraph[] {
  const out: Paragraph[] = [];
  out.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun(l.title)],
    }),
  );
  out.push(...renderInlineParagraphs(l.intro));
  for (const section of l.sections) {
    out.push(
      new Paragraph({
        children: [new TextRun({ text: '· · ·', color: '888888' })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 200 },
      }),
    );
    out.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun(section.heading)],
      }),
    );
    for (const para of section.paragraphs) {
      out.push(...renderInlineParagraphs(para));
    }
  }
  if (l.skippedNote) {
    out.push(
      new Paragraph({
        children: [new TextRun({ text: `Note : ${l.skippedNote}`, italics: true, color: '888888' })],
        spacing: { before: 240 },
      }),
    );
  }
  if (l.footer) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: l.footer, italics: true, color: '888888' })],
        spacing: { before: 360 },
      }),
    );
  }
  return out;
}

/**
 * Construit les TextRun de la ligne de tête d'une cross-ref, en skippant les
 * champs vides pour éviter "→ #271 —  —  ()" quand certains champs absents.
 * Bugfix Phase 7a (2026-04-27) : remplace l'interpolation rigide par une
 * concaténation conditionnelle.
 */
function buildRefHeadRuns(ref: import('../types').CrossRef) {
  const parts: { text: string; italics?: boolean }[] = [];
  parts.push({ text: '→ ' });
  const segments: { text: string; italics?: boolean }[] = [];
  if (ref.episodeNumber) segments.push({ text: ref.episodeNumber });
  if (ref.guestName) segments.push({ text: ref.guestName });
  if (ref.episodeTitle) segments.push({ text: ref.episodeTitle, italics: true });
  for (let i = 0; i < segments.length; i++) {
    parts.push(segments[i]);
    if (i < segments.length - 1) parts.push({ text: ' — ' });
  }
  if (ref.podcastSource) parts.push({ text: ` (${ref.podcastSource})` });
  return parts.map((p) => new TextRun(p));
}

/**
 * Parse un paragraphe Markdown léger (gras `**...**`, italique `*...*`,
 * citation `> ...`) en TextRun docx. Pas de gestion liste/lien — pas dans
 * les livrables source du pack pilote (vérifié par inspection).
 */
function renderInlineParagraphs(
  text: string,
  paragraphProps: { spacing?: { line?: number; before?: number; after?: number } } = {},
): Paragraph[] {
  if (!text || !text.trim()) return [];
  const isQuote = text.trimStart().startsWith('>');
  const cleaned = isQuote ? text.replace(/^\s*>\s?/, '') : text;
  const runs = parseInlineFormatting(cleaned);
  return [
    new Paragraph({
      children: runs.map((r) => new TextRun(r)),
      spacing: paragraphProps.spacing,
      indent: isQuote ? { left: 720 } : undefined,
    }),
  ];
}

/**
 * Parse une chaîne avec `**bold**` et `*italic*` en runs typés docx.
 * Implémentation minimale : gère gras (**) puis italique (*) sans imbrication.
 */
export function parseInlineFormatting(text: string): IRunOptions[] {
  const runs: IRunOptions[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*(.*)$/s);
    const italicMatch = remaining.match(/^(.*?)\*(.+?)\*(.*)$/s);

    // Trouver le premier match (bold prend priorité si à la même position).
    const boldIdx = boldMatch ? remaining.indexOf('**') : -1;
    const italicIdx = italicMatch ? remaining.indexOf('*') : -1;

    if (boldMatch && (italicIdx === -1 || boldIdx <= italicIdx)) {
      if (boldMatch[1]) runs.push({ text: boldMatch[1] });
      runs.push({ text: boldMatch[2], bold: true });
      remaining = boldMatch[3];
    } else if (italicMatch) {
      if (italicMatch[1]) runs.push({ text: italicMatch[1] });
      runs.push({ text: italicMatch[2], italics: true });
      remaining = italicMatch[3];
    } else {
      runs.push({ text: remaining });
      break;
    }
  }
  if (runs.length === 0) runs.push({ text });
  return runs;
}
