/**
 * Build Word (.docx) and PDF versions of the Orso Media feedback
 * from docs/orso-media-feedback.md.
 *
 * Output :
 *   docs/orso-media-feedback.docx   (éditable, Calibri 11pt, A4)
 *   docs/orso-media-feedback.pdf    (via Chrome headless → HTML print)
 *   docs/orso-media-feedback.html   (intermédiaire, conservé pour debug)
 *
 * Usage : npx tsx scripts/build-orso-deliverable.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { marked } from 'marked';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  LevelFormat, PageBreak, TabStopType, TabStopPosition, PageOrientation,
} from 'docx';

const ROOT = path.resolve(__dirname, '..');
const MD_PATH = path.join(ROOT, 'docs', 'orso-media-feedback.md');
const DOCX_PATH = path.join(ROOT, 'docs', 'orso-media-feedback.docx');
const HTML_PATH = path.join(ROOT, 'docs', 'orso-media-feedback.html');
const PDF_PATH = path.join(ROOT, 'docs', 'orso-media-feedback.pdf');

// ---------------------------------------------------------------------------
// PART 1 : Build the DOCX from scratch (styled hand-crafted layout)
// ---------------------------------------------------------------------------

// Colors (hex, no #)
const BRAND = '004CFF';              // La Martingale blue
const GREY_BORDER = 'D0D0D0';
const HEADER_SHADE = 'E6EDFE';
const LIGHT_BG = 'F6F8FB';

const border = { style: BorderStyle.SINGLE, size: 4, color: GREY_BORDER };
const cellBorders = { top: border, bottom: border, left: border, right: border };

function para(text: string, opts: { bold?: boolean; italic?: boolean; size?: number; color?: string; align?: AlignmentType; spacingBefore?: number; spacingAfter?: number } = {}) {
  return new Paragraph({
    alignment: opts.align,
    spacing: { before: opts.spacingBefore ?? 60, after: opts.spacingAfter ?? 60 },
    children: [
      new TextRun({
        text,
        bold: opts.bold,
        italics: opts.italic,
        size: opts.size,
        color: opts.color,
      }),
    ],
  });
}

function heading1(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 160 },
    children: [new TextRun({ text, bold: true, size: 32, color: BRAND })],
  });
}

function heading2(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 140 },
    children: [new TextRun({ text, bold: true, size: 26 })],
  });
}

function bullet(text: string, runs?: TextRun[]) {
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    spacing: { before: 40, after: 40 },
    children: runs ?? [new TextRun(text)],
  });
}

function tableCellText(text: string, opts: { bold?: boolean; header?: boolean; width: number }) {
  return new TableCell({
    borders: cellBorders,
    width: { size: opts.width, type: WidthType.DXA },
    shading: opts.header
      ? { fill: HEADER_SHADE, type: ShadingType.CLEAR, color: 'auto' }
      : undefined,
    margins: { top: 100, bottom: 100, left: 140, right: 140 },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: opts.bold || opts.header, size: opts.header ? 22 : 22 })],
      }),
    ],
  });
}

function simpleTable(headers: string[], rows: string[][], widths: number[]) {
  const total = widths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h, i) =>
          tableCellText(h, { header: true, width: widths[i] })
        ),
      }),
      ...rows.map(
        (r) =>
          new TableRow({
            children: r.map((c, i) => tableCellText(c, { width: widths[i] })),
          })
      ),
    ],
  });
}

// Metadata block as a two-col table, unbordered-looking
function metaRow(label: string, value: string) {
  const cellLabel = new TableCell({
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    },
    width: { size: 1800, type: WidthType.DXA },
    shading: { fill: LIGHT_BG, type: ShadingType.CLEAR, color: 'auto' },
    margins: { top: 80, bottom: 80, left: 140, right: 140 },
    children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20, color: '555555' })] })],
  });
  const cellValue = new TableCell({
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    },
    width: { size: 7226, type: WidthType.DXA },
    margins: { top: 80, bottom: 80, left: 140, right: 140 },
    children: [new Paragraph({ children: [new TextRun({ text: value, size: 22 })] })],
  });
  return new TableRow({ children: [cellLabel, cellValue] });
}

function metaBlock() {
  return new Table({
    width: { size: 9026, type: WidthType.DXA }, // A4 content width (~1 inch margins)
    columnWidths: [1800, 7226],
    rows: [
      metaRow('À', 'Matthieu Stefani & l\u2019équipe Orso Media'),
      metaRow('De', 'Jeremy Henry — projet indépendant data autour de La Martingale'),
      metaRow('Date', '18 avril 2026'),
      metaRow('Sujet', 'Retour qualité données sur l\u2019archive du podcast (313 épisodes)'),
    ],
  });
}

function rule() {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BRAND, space: 1 } },
    children: [new TextRun('')],
  });
}

function buildDoc() {
  const children: any[] = [];

  // Title
  children.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 0, after: 60 },
      children: [new TextRun({ text: 'La Martingale', bold: true, size: 40, color: BRAND })],
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 0, after: 240 },
      children: [new TextRun({ text: 'Audit data croisé site & RSS', bold: true, size: 32, color: '333333' })],
    }),
  );

  // Metadata block
  children.push(metaBlock());
  children.push(rule());

  // En un mot
  children.push(heading1('En un mot'));
  children.push(para(
    'J\u2019ai passé les dernières semaines à construire une base de données enrichie autour des 313 épisodes de La Martingale (transcriptions d\u2019articles, recherche sémantique, quiz adaptatifs, etc. — projet perso, 100 % admirateur du podcast). En croisant systématiquement trois sources — le site lamartingale.io, le flux RSS Audiomeans, les pages épisode elles-mêmes — j\u2019ai repéré quelques petites incohérences qui peuvent mériter un coup d\u2019œil côté CMS.'
  ));
  children.push(para(
    'Rien d\u2019urgent. L\u2019archive est globalement propre — 99 % des épisodes ont une page article, 93 % ont un vrai chapitrage H2, la synchronisation RSS/site fonctionne. Ce document liste les 5 anomalies résiduelles.',
    { italic: true }
  ));

  // Résumé exécutif
  children.push(heading1('Résumé exécutif'));
  children.push(simpleTable(
    ['#', 'Sujet', 'Impact', 'Volume'],
    [
      ['1', 'Un épisode sans page web', 'Invisible en SEO & apps', '1 ép (#224)'],
      ['2', 'Désynchronisation titre site / RSS', 'Non-match dans apps podcast', '4 ép'],
      ['3', 'URL CMS partagée entre 2 numéros', 'Mauvaise redirection depuis les apps', '2 ép (#262/#264)'],
      ['4', 'Articles sans sous-titres H2', 'SEO & lisibilité dégradés', '~22 ép à vérifier'],
      ['5', 'Écart bios invités consolidées', 'Potentiel annuaire invités', '~233 noms à structurer'],
    ],
    [600, 4000, 2800, 1626]
  ));

  // Section 1
  children.push(heading1('1. Un épisode sans article publié'));
  children.push(para('Épisode #224 — « Crowdfunding et immobilier fractionné : la fin de la récré ? » (Yann Balthazard, 25 juillet 2024)', { bold: true }));
  children.push(para(
    'L\u2019épisode existe dans le flux RSS Audiomeans (donc écoutable sur Spotify, Apple Podcasts, etc.), mais aucune page article /tous/… n\u2019a pu être trouvée sur lamartingale.io. J\u2019ai testé cinq variantes de slug plausibles — toutes en 404.'
  ));
  children.push(para(
    'Conséquence concrète : un visiteur qui cherche « Yann Balthazard » ou « crowdfunding fractionné » sur Google ne retrouve pas l\u2019épisode via votre site. Les autres canaux (Spotify, YouTube potentiellement) prennent le relais, mais la valeur SEO est perdue.',
    { italic: true, color: '555555' }
  ));
  children.push(para('Recommandation : républier un article dédié, ou rediriger vers un épisode proche si le contenu a été remplacé.', { bold: true }));

  // Section 2
  children.push(heading1('2. Quatre épisodes mal synchronisés entre site & RSS'));
  children.push(para('Les titres diffèrent entre la page lamartingale.io et le flux RSS Audiomeans, au point qu\u2019un moteur de recherche automatique ne retrouve pas l\u2019épisode dans les deux sources sous le même identifiant.'));
  children.push(simpleTable(
    ['#', 'Titre côté site'],
    [
      ['#307', 'La décennie qui va tout changer'],
      ['#295', 'Comment gagner de l\u2019argent grâce au luxe de seconde main ?'],
      ['#291', 'Private Equity : les 3 critères pour identifier les meilleurs gérants'],
      ['#174', 'L\u2019essor des cartes Pokémon : une aubaine pour investir ?'],
    ],
    [900, 8126]
  ));
  children.push(para(
    'Conséquence concrète : si une app podcast tente de lier un épisode RSS à un article web (ce que Google, Apple et certaines extensions font), elle n\u2019y parvient pas pour ces quatre. L\u2019épisode s\u2019affiche, mais sans les métadonnées enrichies.',
    { italic: true, color: '555555' }
  ));
  children.push(para('Recommandation : aligner le titre RSS sur le titre du site (ou inversement). C\u2019est une modif CMS simple côté Audiomeans.', { bold: true }));

  // Section 3
  children.push(heading1('3. Deux numéros d\u2019épisode pointant sur la même URL'));
  children.push(bullet('Slug investir-comme-chez-goldman-sachs partagé par #262 et #264.'));
  children.push(bullet('Les 22 « slugs vides » que vous verrez parfois évoqués dans des audits proviennent d\u2019un import historique côté projet, pas d\u2019une anomalie site — voir section 4.'));
  children.push(para(
    'Conséquence concrète : un auditeur qui clique sur le lien de l\u2019épisode #264 depuis son app podcast arrive sur la page de l\u2019épisode #262 (ou vice-versa). Soit les deux sont bien la même rediffusion — auquel cas il suffit de ne garder qu\u2019un numéro dans le RSS — soit c\u2019est une erreur de slug CMS qu\u2019il faut corriger.',
    { italic: true, color: '555555' }
  ));
  children.push(para('Recommandation : clarifier si #264 est une rediffusion de #262 ou un épisode distinct, et ajuster la numérotation RSS ou le slug.', { bold: true }));

  // Section 4
  children.push(heading1('4. 22 articles anciens sans chapitrage H2 (SEO)'));
  children.push(para(
    'Sur environ 20 épisodes dans la plage #126–#279, la page article ne comporte aucun sous-titre H2. Les moteurs de recherche (et les lecteurs humains) ne peuvent donc pas naviguer rapidement dans le texte.'
  ));
  children.push(para('C\u2019est probablement lié à un template éditorial plus ancien, utilisé avant d\u2019adopter le format « Les cases à ne pas oublier — … » systématique qu\u2019on voit sur les épisodes récents.'));
  children.push(para(
    'Conséquence concrète : ces 22 articles sont moins bien référencés sur Google (Google valorise la structure h2/h3), et sont moins agréables à parcourir sans ctrl+F. Pour un lecteur qui arrive sur l\u2019article via un featured snippet, le décrochage est plus rapide.',
    { italic: true, color: '555555' }
  ));
  children.push(para('Recommandation : batch éditorial d\u2019ajout de 3-5 H2 sur les anciens articles. Pour un stagiaire ou un rédacteur, c\u2019est ~1 h par article. Impact SEO mesurable sous 2-3 mois. Liste précise disponible sur demande.', { bold: true }));

  // Section 5
  children.push(heading1('5. Annuaire d\u2019invités — opportunité de consolidation'));
  children.push(para(
    'Sur les 313 épisodes, il y a environ 261 noms d\u2019invités distincts. Actuellement, seuls ~28 sont consolidés quelque part avec une bio formelle (si j\u2019interprète correctement la structure apparente du site). Pour les 233 autres, la bio, l\u2019entreprise et les liens LinkedIn sont uniquement dans le corps de l\u2019article.'
  ));
  children.push(para(
    'Conséquence concrète : difficile pour un visiteur de retrouver « tous les épisodes avec tel invité » ou « tous les invités qui ont parlé de SCPI ». Une page annuaire /invites/ permettrait ça, et est un très bon aimant SEO (pages peu concurrentielles sur des noms propres).',
    { italic: true, color: '555555' }
  ));
  children.push(para('Recommandation : partir des 9 901 liens qu\u2019on peut déjà extraire automatiquement des articles (dont 545 LinkedIn distincts d\u2019invités/intervenants) pour peupler une table d\u2019invités. Si l\u2019équipe est intéressée, je peux partager le script d\u2019extraction.', { bold: true }));

  // Annexe
  children.push(heading1('Annexe — Chiffres globaux (pour contexte positif)'));
  children.push(simpleTable(
    ['Dimension', 'Valeur'],
    [
      ['Épisodes numérotés', '313 (range #1–#313)'],
      ['Trous de numérotation', '0 — continuité parfaite'],
      ['Articles propres (>200 caractères)', '312 / 313 (99,7 %)'],
      ['Articles avec H2', '290 / 313 (92,7 %)'],
      ['Épisodes matchés RSS', '309 / 313 (98,7 %)'],
      ['Durée moyenne', '65 minutes'],
      ['Liens externes moyens par article', '~32'],
      ['Invités avec LinkedIn identifié', '259 profils uniques'],
    ],
    [5000, 4026]
  ));
  children.push(para(
    'Franchement, pour une archive de 9 ans et 313 épisodes gérée dans un CMS et un host RSS séparés, ce niveau de propreté est remarquable. La plupart des podcasts que j\u2019ai regardés ont un taux d\u2019anomalies bien supérieur. Bravo.',
    { spacingBefore: 120 }
  ));

  // Closing
  children.push(rule());
  children.push(heading1('Si vous êtes curieux'));
  children.push(para('Je serais ravi de partager :'));
  children.push(bullet('Le dataset complet (embeddings sémantiques, liens classifiés, bios extraites) en lecture.'));
  children.push(bullet('Une démo de la plateforme que j\u2019ai construite autour (recherche sémantique, quiz adaptatifs, RAG pour poser des questions à l\u2019archive).'));
  children.push(para(
    'C\u2019est un projet 100 % non-commercial, purement par goût du podcast et des données. Si ça peut nourrir une réflexion produit chez Orso — ou juste vous amuser 2 minutes — n\u2019hésitez pas.'
  ));

  children.push(new Paragraph({
    spacing: { before: 200, after: 60 },
    children: [
      new TextRun({ text: 'Contact : ', bold: true }),
      new TextRun('jeremyhenry974@gmail.com'),
    ],
  }));
  children.push(new Paragraph({
    spacing: { before: 0, after: 60 },
    children: [
      new TextRun({ text: 'Projet : ', bold: true }),
      new TextRun('https://lamartingale.vercel.app'),
    ],
  }));

  children.push(rule());
  children.push(para(
    'Ce document a été généré à partir d\u2019un croisement automatique site + RSS + scraping. Données et méthodologie disponibles sur demande.',
    { italic: true, color: '888888', size: 18 }
  ));

  return new Document({
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22 } }, // 11pt
      },
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 32, bold: true, font: 'Calibri', color: BRAND },
          paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 0 },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 26, bold: true, font: 'Calibri' },
          paragraph: { spacing: { before: 300, after: 140 }, outlineLevel: 1 },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: 'bullets',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '\u2022',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children,
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// PART 2 : HTML → PDF via headless Chrome
// ---------------------------------------------------------------------------

function buildHtml(markdown: string): string {
  const body = marked.parse(markdown) as string;
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>La Martingale — Audit data croisé site & RSS</title>
  <style>
    @page { size: A4; margin: 22mm 20mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Helvetica Neue", Arial, sans-serif;
      color: #222;
      font-size: 11pt;
      line-height: 1.55;
      margin: 0;
    }
    h1 {
      color: #004cff;
      font-size: 22pt;
      margin: 28pt 0 10pt;
      padding-bottom: 4pt;
      border-bottom: 1px solid #d0d0d0;
      page-break-after: avoid;
    }
    h1:first-of-type { margin-top: 0; font-size: 26pt; border: none; }
    h2 { font-size: 14pt; margin: 22pt 0 8pt; color: #333; page-break-after: avoid; }
    h3 { font-size: 12pt; color: #555; }
    p { margin: 0 0 10pt; }
    ul { margin: 6pt 0 12pt 18pt; }
    li { margin-bottom: 4pt; }
    table {
      border-collapse: collapse;
      width: 100%;
      font-size: 10.5pt;
      margin: 8pt 0 14pt;
      page-break-inside: avoid;
    }
    th {
      background: #e6edfe;
      color: #003199;
      font-weight: 600;
      text-align: left;
      padding: 6pt 9pt;
      border: 1px solid #c6d1ec;
    }
    td {
      padding: 6pt 9pt;
      border: 1px solid #d9dfee;
      vertical-align: top;
    }
    blockquote {
      margin: 10pt 0;
      padding: 8pt 14pt;
      background: #f6f8fb;
      border-left: 3px solid #004cff;
      color: #444;
      font-style: italic;
    }
    code { background: #f0f2f8; padding: 1pt 4pt; border-radius: 3px; font-family: Consolas, monospace; font-size: 9.5pt; }
    hr { border: none; border-top: 1px solid #d0d0d0; margin: 22pt 0; }
    strong { color: #111; }
    em { color: #444; }
    a { color: #004cff; text-decoration: none; }
    .footer { margin-top: 40pt; color: #888; font-size: 9pt; font-style: italic; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

function chromePath(): string | null {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return null;
}

async function main() {
  console.log('[build-orso-deliverable]');

  // ---- DOCX ----
  console.log('  building .docx ...');
  const doc = buildDoc();
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(DOCX_PATH, buffer);
  console.log(`  ✓ ${DOCX_PATH} (${(buffer.length / 1024).toFixed(1)} KB)`);

  // ---- HTML ----
  console.log('  building .html ...');
  const md = fs.readFileSync(MD_PATH, 'utf-8');
  const html = buildHtml(md);
  fs.writeFileSync(HTML_PATH, html, 'utf-8');
  console.log(`  ✓ ${HTML_PATH}`);

  // ---- PDF via Chrome headless ----
  const chrome = chromePath();
  if (!chrome) {
    console.error('  ✗ Chrome not found — skipping PDF');
    return;
  }
  console.log('  rendering .pdf via Chrome headless ...');
  const fileUrl = 'file:///' + HTML_PATH.replace(/\\/g, '/');
  const result = spawnSync(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    `--print-to-pdf=${PDF_PATH}`,
    fileUrl,
  ], { stdio: 'pipe', encoding: 'utf-8' });

  if (result.status !== 0) {
    console.error('  ✗ Chrome failed:', result.stderr?.slice(0, 500));
    process.exit(1);
  }
  if (!fs.existsSync(PDF_PATH)) {
    console.error('  ✗ PDF not created');
    process.exit(1);
  }
  const pdfSize = fs.statSync(PDF_PATH).size;
  console.log(`  ✓ ${PDF_PATH} (${(pdfSize / 1024).toFixed(1)} KB)`);

  console.log('\n✅ Deliverables ready:');
  console.log(`   Markdown : ${MD_PATH}`);
  console.log(`   Word     : ${DOCX_PATH}`);
  console.log(`   HTML     : ${HTML_PATH}`);
  console.log(`   PDF      : ${PDF_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
