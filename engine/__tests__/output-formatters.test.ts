import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';
import { DocxFormatter, parseInlineFormatting } from '../output/formats/docxFormatter';
import { MarkdownFormatter } from '../output/formats/markdownFormatter';
import { PdfFormatter } from '../output/formats/pdfFormatter';
import { XlsxFormatter } from '../output/formats/xlsxFormatter';
import {
  parseBriefAnnexe,
  parseCrossRefs,
  parseKeyMoments,
  parseNewsletter,
  parseQuotes,
} from '../output/parsers/markdownParser';
import { NotImplementedError, type FormatterContext } from '../output/types';

const ROOT = resolve(
  'experiments',
  'autonomy-session-2026-04-28',
  'pack-pilote-stefani-orso',
);

const CTX: FormatterContext = {
  clientId: 'stefani-orso',
  clientDisplayName: 'Matthieu Stefani / Orso Media',
  generatedAt: '2026-04-30T18:00:00.000Z',
  brandPrimary: '004CFF',
};

function readEp(slug: string, file: string): string {
  return readFileSync(resolve(ROOT, slug, file), 'utf-8');
}

describe('docx formatter — Phase 7a', () => {
  it.each(['plais-platform-sh', 'boissenot-pokemon', 'nooz-optics'])(
    'produces a valid docx buffer for L3 cross-refs (%s)',
    async (slug) => {
      const livrable = parseCrossRefs(readEp(slug, '03-cross-refs-by-lens.md'));
      const f = new DocxFormatter();
      const out = await f.formatLivrable(livrable, CTX);
      expect(out.filename).toBe('03-cross-refs-by-lens.docx');
      expect(out.mimeType).toContain('wordprocessingml');
      expect(out.buffer.length).toBeGreaterThan(1000);
      // .docx files are ZIPs that start with "PK\x03\x04"
      expect(out.buffer.subarray(0, 2).toString()).toBe('PK');
    },
  );

  it.each(['plais-platform-sh', 'boissenot-pokemon', 'nooz-optics'])(
    'produces a valid docx for L4 newsletter (%s)',
    async (slug) => {
      const livrable = parseNewsletter(readEp(slug, '04-newsletter.md'));
      const f = new DocxFormatter();
      const out = await f.formatLivrable(livrable, CTX);
      expect(out.filename).toBe('04-newsletter.docx');
      expect(out.buffer.subarray(0, 2).toString()).toBe('PK');
    },
  );

  it.each(['plais-platform-sh', 'boissenot-pokemon', 'nooz-optics'])(
    'produces a valid docx for L5 brief annexe (%s)',
    async (slug) => {
      const livrable = parseBriefAnnexe(readEp(slug, '05-brief-annexe.md'));
      const f = new DocxFormatter();
      const out = await f.formatLivrable(livrable, CTX);
      expect(out.filename).toBe('05-brief-annexe.docx');
      expect(out.buffer.subarray(0, 2).toString()).toBe('PK');
    },
  );

  it('rejects unsupported livrable types', async () => {
    const livrable = parseKeyMoments(readEp('plais-platform-sh', '01-key-moments.md'));
    const f = new DocxFormatter();
    await expect(f.formatLivrable(livrable, CTX)).rejects.toThrow(/does not support/);
  });
});

describe('xlsx formatter — Phase 7a', () => {
  it.each(['plais-platform-sh', 'boissenot-pokemon', 'nooz-optics'])(
    'produces a valid xlsx for L1 key moments (%s)',
    async (slug) => {
      const livrable = parseKeyMoments(readEp(slug, '01-key-moments.md'));
      const f = new XlsxFormatter();
      const out = await f.formatLivrable(livrable, CTX);
      expect(out.filename).toBe('01-key-moments.xlsx');
      expect(out.mimeType).toContain('spreadsheetml');
      expect(out.buffer.subarray(0, 2).toString()).toBe('PK');
    },
  );

  it.each(['plais-platform-sh', 'boissenot-pokemon', 'nooz-optics'])(
    'produces a valid xlsx for L2 quotes (%s)',
    async (slug) => {
      const livrable = parseQuotes(readEp(slug, '02-quotes.md'));
      const f = new XlsxFormatter();
      const out = await f.formatLivrable(livrable, CTX);
      expect(out.filename).toBe('02-quotes.xlsx');
      expect(out.buffer.subarray(0, 2).toString()).toBe('PK');
    },
  );

  it('rejects unsupported livrable types', async () => {
    const livrable = parseCrossRefs(readEp('plais-platform-sh', '03-cross-refs-by-lens.md'));
    const f = new XlsxFormatter();
    await expect(f.formatLivrable(livrable, CTX)).rejects.toThrow(/does not support/);
  });

  // Phase 8.4 KO follow-up — Garde-fou client-facing : aucun jargon dev
  // (nom de phase roadmap, nom de modèle LLM, nom de variable interne) ne
  // doit apparaître dans les headers ou cellules d'un xlsx livré.
  // Découvert : "Lien vidéo (Phase 7b)" et "Lien micro-clip (Phase 7b)"
  // visibles dans 02-quotes.xlsx + 01-key-moments.xlsx — perçu "produit
  // en cours" par un lecteur externe.
  const BANNED_XLSX_PATTERNS: RegExp[] = [
    /\bPhase \d/i,
    /\bSonnet\b/i,
    /\bHaiku\b/i,
    /\bOpus\b/i,
    /\bWhisper\b/i,
    /\bextractQuotes?\b/i,
    /\bsegment_index\b/i,
    /\btemporal_spread\b/i,
    /\blensClassif/i,
    /\bTODO\b/i,
    /\bFIXME\b/i,
  ];

  async function extractAllXlsxText(buffer: Buffer): Promise<string[]> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const out: string[] = [];
    wb.eachSheet((sheet) => {
      out.push(sheet.name);
      sheet.eachRow((row) => {
        row.eachCell((cell) => {
          const v = cell.value;
          if (v == null) return;
          if (typeof v === 'string' || typeof v === 'number') {
            out.push(String(v));
          } else if (typeof v === 'object' && 'richText' in v && Array.isArray((v as any).richText)) {
            for (const r of (v as any).richText) out.push(String(r.text));
          } else {
            out.push(JSON.stringify(v));
          }
        });
      });
    });
    return out;
  }

  it.each(['plais-platform-sh', 'boissenot-pokemon', 'nooz-optics', 'veyrat-stoik'])(
    'L1 key-moments xlsx contains NO dev jargon (%s)',
    async (slug) => {
      const livrable = parseKeyMoments(readEp(slug, '01-key-moments.md'));
      const f = new XlsxFormatter();
      const out = await f.formatLivrable(livrable, CTX);
      const texts = await extractAllXlsxText(out.buffer);
      const joined = texts.join('\n');
      for (const re of BANNED_XLSX_PATTERNS) {
        expect(joined, `pattern ${re} found in ${slug}/01-key-moments.xlsx`).not.toMatch(re);
      }
    },
  );

  it.each(['plais-platform-sh', 'boissenot-pokemon', 'nooz-optics', 'veyrat-stoik'])(
    'L2 quotes xlsx contains NO dev jargon (%s)',
    async (slug) => {
      const livrable = parseQuotes(readEp(slug, '02-quotes.md'));
      const f = new XlsxFormatter();
      const out = await f.formatLivrable(livrable, CTX);
      const texts = await extractAllXlsxText(out.buffer);
      const joined = texts.join('\n');
      for (const re of BANNED_XLSX_PATTERNS) {
        expect(joined, `pattern ${re} found in ${slug}/02-quotes.xlsx`).not.toMatch(re);
      }
    },
  );
});

describe('markdown formatter — Phase 7a', () => {
  it('round-trips key moments without losing data', async () => {
    const original = readEp('plais-platform-sh', '01-key-moments.md');
    const livrable = parseKeyMoments(original);
    const f = new MarkdownFormatter();
    const out = await f.formatLivrable(livrable, CTX);
    const rendered = out.buffer.toString('utf-8');
    expect(rendered).toContain('Key moments');
    expect(rendered).toContain('saliency');
    // Vérification de préservation : chaque moment titre est dans le rendu.
    for (const m of livrable.moments) {
      expect(rendered).toContain(m.titre);
      expect(rendered).toContain(m.timestampStart);
    }
  });

  // Phase 8.4 — Garde-fou client-facing : aucune fuite de cuisine interne
  // (warnings auto-éval, footers dev, références à des coûts LLM, mentions
  // de phases internes). Le markdown rendu va à Stefani — aucune metadata
  // dev ne doit s'y glisser.
  it.each(['plais-platform-sh', 'boissenot-pokemon', 'nooz-optics', 'veyrat-stoik'])(
    'L2 quotes rendered markdown contains NO dev metadata (%s)',
    async (slug) => {
      const original = readEp(slug, '02-quotes.md');
      const livrable = parseQuotes(original);
      const f = new MarkdownFormatter();
      const out = await f.formatLivrable(livrable, CTX);
      const rendered = out.buffer.toString('utf-8');
      // Aucun marqueur sandbox/dev
      expect(rendered).not.toMatch(/Warnings auto-éval/i);
      expect(rendered).not.toMatch(/Generated Phase \d/i);
      expect(rendered).not.toMatch(/Cost: \$/);
      expect(rendered).not.toMatch(/extractQuotes refactored/i);
      expect(rendered).not.toMatch(/segment_index/);
      expect(rendered).not.toMatch(/temporal_spread/);
      expect(rendered).not.toMatch(/Returned \d+ quotes \(expected \d+\)/i);
      expect(rendered).not.toMatch(/rejected:/i);
      // Footer client-facing présent
      expect(rendered).toContain('Sillon');
    },
  );
});

describe('pdf formatter — V2 placeholder', () => {
  it('throws NotImplementedError for any livrable', async () => {
    const livrable = parseKeyMoments(readEp('plais-platform-sh', '01-key-moments.md'));
    const f = new PdfFormatter();
    await expect(f.formatLivrable(livrable, CTX)).rejects.toThrow(NotImplementedError);
  });
});

describe('inline markdown helper', () => {
  it('parses bold and italic correctly', () => {
    const runs = parseInlineFormatting('hello **bold** and *italic* world');
    expect(runs).toEqual([
      { text: 'hello ' },
      { text: 'bold', bold: true },
      { text: ' and ' },
      { text: 'italic', italics: true },
      { text: ' world' },
    ]);
  });

  it('handles plain text', () => {
    const runs = parseInlineFormatting('plain text');
    expect(runs).toEqual([{ text: 'plain text' }]);
  });
});
