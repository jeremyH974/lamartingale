/**
 * scripts/validate-pack-v2.ts — validation programmatique du pack V2.
 *
 * Vérifie que pour chaque livrable, tout le contenu textuel du Markdown source
 * est présent dans le fichier docx/xlsx généré. Lit les fichiers XML internes
 * (xl/sharedStrings.xml, word/document.xml) et compare au contenu source.
 *
 * Usage : npx tsx scripts/validate-pack-v2.ts
 *
 * Ne fait pas un diff exact (formatting markdown vs xml), mais vérifie que
 * les MOTS clés (titres, quotes, headings) sont préservés. Sortie : compte
 * fail-rate + sample des manques.
 */

import AdmZip from 'adm-zip';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseBriefAnnexe,
  parseCrossRefs,
  parseKeyMoments,
  parseNewsletter,
  parseQuotes,
} from '../engine/output/parsers/markdownParser';

const SOURCE = resolve(
  'experiments',
  'autonomy-session-2026-04-28',
  'pack-pilote-stefani-orso',
);
const V2 = resolve(
  'experiments',
  'autonomy-session-2026-04-28',
  process.env.PACK_V2_OUT ?? 'pack-pilote-stefani-orso-v2',
);

const EPISODES = ['plais-platform-sh', 'boissenot-pokemon', 'nooz-optics', 'veyrat-stoik'];

function extractDocxText(path: string): string {
  const zip = new AdmZip(path);
  const xml = zip.getEntry('word/document.xml')?.getData().toString('utf-8') ?? '';
  // Strip XML tags, decode common entities
  return xml
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractXlsxText(path: string): string {
  const zip = new AdmZip(path);
  const sharedStrings =
    zip.getEntry('xl/sharedStrings.xml')?.getData().toString('utf-8') ?? '';
  const sheetXml =
    zip.getEntry('xl/worksheets/sheet1.xml')?.getData().toString('utf-8') ?? '';
  const all = (sharedStrings + ' ' + sheetXml)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return all;
}

function checkContains(extracted: string, needles: string[]): { hits: number; misses: string[] } {
  const norm = (s: string) =>
    s
      .toLowerCase()
      // Strip markdown emphasis markers — le docx les retire et applique le bold/italic via XML.
      .replace(/\*+/g, '')
      .replace(/['']/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  const hay = norm(extracted);
  let hits = 0;
  const misses: string[] = [];
  for (const n of needles) {
    const candidate = norm(n);
    // On vérifie un échantillon de 30 caractères (plus tolérant aux différences mineures de ponctuation)
    const sample = candidate.slice(0, 30);
    if (sample && hay.includes(sample)) {
      hits++;
    } else {
      misses.push(candidate.slice(0, 50));
    }
  }
  return { hits, misses };
}

let totalChecks = 0;
let totalHits = 0;
const allMisses: string[] = [];

for (const slug of EPISODES) {
  console.log(`\n=== ${slug} ===`);

  // L1 — Key moments xlsx
  {
    const md = readFileSync(resolve(SOURCE, slug, '01-key-moments.md'), 'utf-8');
    const livrable = parseKeyMoments(md);
    const text = extractXlsxText(resolve(V2, slug, '01-key-moments.xlsx'));
    const needles = livrable.moments.flatMap((m) => [m.titre, m.quote, m.pourquoi.slice(0, 60)]);
    const { hits, misses } = checkContains(text, needles);
    totalChecks += needles.length;
    totalHits += hits;
    if (misses.length) allMisses.push(...misses.map((m) => `[${slug}/L1] ${m}`));
    console.log(`  L1 key moments xlsx : ${hits}/${needles.length} preserved`);
  }

  // L2 — Quotes xlsx
  {
    const md = readFileSync(resolve(SOURCE, slug, '02-quotes.md'), 'utf-8');
    const livrable = parseQuotes(md);
    const text = extractXlsxText(resolve(V2, slug, '02-quotes.xlsx'));
    const needles = livrable.quotes.flatMap((q) => [q.text.slice(0, 50), q.auteur, q.pourquoi.slice(0, 60)]);
    const { hits, misses } = checkContains(text, needles);
    totalChecks += needles.length;
    totalHits += hits;
    if (misses.length) allMisses.push(...misses.map((m) => `[${slug}/L2] ${m}`));
    console.log(`  L2 quotes xlsx       : ${hits}/${needles.length} preserved`);
  }

  // L3 — Cross-refs docx
  {
    const md = readFileSync(resolve(SOURCE, slug, '03-cross-refs-by-lens.md'), 'utf-8');
    const livrable = parseCrossRefs(md);
    const text = extractDocxText(resolve(V2, slug, '03-cross-refs-by-lens.docx'));
    const needles: string[] = [];
    for (const sec of livrable.sections) {
      needles.push(sec.lensIntro.slice(0, 40));
      for (const r of sec.refs) {
        if (r.guestName) needles.push(r.guestName);
        if (r.episodeTitle) needles.push(r.episodeTitle.slice(0, 40));
        for (const p of r.bodyParagraphs) needles.push(p.slice(0, 40));
      }
    }
    const { hits, misses } = checkContains(text, needles);
    totalChecks += needles.length;
    totalHits += hits;
    if (misses.length) allMisses.push(...misses.map((m) => `[${slug}/L3] ${m}`));
    console.log(`  L3 cross-refs docx   : ${hits}/${needles.length} preserved`);
  }

  // L4 — Newsletter docx
  {
    const md = readFileSync(resolve(SOURCE, slug, '04-newsletter.md'), 'utf-8');
    const livrable = parseNewsletter(md);
    const text = extractDocxText(resolve(V2, slug, '04-newsletter.docx'));
    const needles = [livrable.newsletterTitle, ...livrable.sections.flatMap((s) => s.map((p) => p.slice(0, 40)))];
    const { hits, misses } = checkContains(text, needles);
    totalChecks += needles.length;
    totalHits += hits;
    if (misses.length) allMisses.push(...misses.map((m) => `[${slug}/L4] ${m}`));
    console.log(`  L4 newsletter docx   : ${hits}/${needles.length} preserved`);
  }

  // L5 — Brief annexe docx
  {
    const md = readFileSync(resolve(SOURCE, slug, '05-brief-annexe.md'), 'utf-8');
    const livrable = parseBriefAnnexe(md);
    const text = extractDocxText(resolve(V2, slug, '05-brief-annexe.docx'));
    const needles = [
      livrable.intro.slice(0, 40),
      ...livrable.sections.flatMap((s) => [s.heading, ...s.paragraphs.map((p) => p.slice(0, 40))]),
    ];
    const { hits, misses } = checkContains(text, needles);
    totalChecks += needles.length;
    totalHits += hits;
    if (misses.length) allMisses.push(...misses.map((m) => `[${slug}/L5] ${m}`));
    console.log(`  L5 brief annexe docx : ${hits}/${needles.length} preserved`);
  }
}

const rate = ((totalHits / totalChecks) * 100).toFixed(2);
console.log(`\n========================`);
console.log(`Preservation rate: ${totalHits}/${totalChecks} (${rate}%)`);

if (allMisses.length > 0) {
  console.log(`\nFirst 20 misses:`);
  for (const m of allMisses.slice(0, 20)) console.log(`  ${m}`);
}

if (totalHits / totalChecks < 0.95) {
  console.error(`\n❌ FAIL: preservation rate < 95%`);
  process.exit(1);
}
console.log(`\n✅ PASS: content preservation ≥ 95%`);
