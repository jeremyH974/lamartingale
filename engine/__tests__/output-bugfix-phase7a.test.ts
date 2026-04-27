// Régressions Phase 7a (post-validation visuelle Jérémy 2026-04-27).
// Bug 1 : DocxFormatter L3 — head H3 avec italique inline + parenthèses
// → contenu préservé (était cassé : "→ #N — Auteur —  ()").
// Bug 2 : XlsxFormatter L1/L2 — N moments markdown source → N lignes data
// (était cassé : moment #1 manquant à cause du split parser).

import AdmZip from 'adm-zip';
import { describe, expect, it } from 'vitest';
import { DocxFormatter } from '../output/formats/docxFormatter';
import { XlsxFormatter } from '../output/formats/xlsxFormatter';
import {
  parseCrossRefs,
  parseKeyMoments,
  parseQuotes,
} from '../output/parsers/markdownParser';
import type { FormatterContext } from '../output/types';

const CTX: FormatterContext = {
  clientId: 'test',
  clientDisplayName: 'Test client',
  generatedAt: '2026-04-27T18:00:00.000Z',
  brandPrimary: '004CFF',
};

function extractDocxText(buffer: Buffer): string {
  const zip = new AdmZip(buffer);
  return (zip.getEntry('word/document.xml')?.getData().toString('utf-8') ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

describe('Phase 7a Bug 1 — L3 cross-refs head with hyphenated name + italic + parens', () => {
  const md = `# 🔗 Cross-références par lens — Test

> ⚙️ **Filtrage** : note.

## Si vous avez aimé l'angle test

Lens intro paragraph.

---

### → #271 — Pierre-Eric Leibovici — *Le VC-as-a-Platform* (Finscale)

Body paragraph 1.

---
`;

  it('parser preserves hyphenated guest name (Pierre-Eric, not Pierre)', () => {
    const out = parseCrossRefs(md);
    const ref = out.sections[0].refs[0];
    expect(ref.episodeNumber).toBe('#271');
    expect(ref.guestName).toBe('Pierre-Eric Leibovici');
    expect(ref.episodeTitle).toBe('Le VC-as-a-Platform');
    expect(ref.podcastSource).toBe('Finscale');
  });

  it('docx renders the head with all 4 fields visible (no empty " —  ()" artifact)', async () => {
    const livrable = parseCrossRefs(md);
    const f = new DocxFormatter();
    const out = await f.formatLivrable(livrable, CTX);
    const text = extractDocxText(out.buffer);
    expect(text).toContain('Pierre-Eric Leibovici');
    expect(text).toContain('Le VC-as-a-Platform');
    expect(text).toContain('Finscale');
    expect(text).toContain('#271');
    // Ne doit JAMAIS contenir l'artefact "—  ()" (séparateurs avec champs vides)
    expect(text).not.toMatch(/—\s+—\s+\(\s*\)/);
    expect(text).not.toMatch(/—\s+\(\s*\)/);
  });

  it('docx rendering skips empty fields gracefully when title or source absent', async () => {
    const mdNoTitle = `# 🔗 Cross-références — Test

## Si vous avez aimé

Intro.

---

### → GDIY #122 — Vincent Huguet (Malt)

Body.

---
`;
    const livrable = parseCrossRefs(mdNoTitle);
    const f = new DocxFormatter();
    const out = await f.formatLivrable(livrable, CTX);
    const text = extractDocxText(out.buffer);
    expect(text).toContain('Vincent Huguet');
    expect(text).toContain('#122');
    expect(text).toContain('GDIY');
    // Pas de " — ()" résiduel
    expect(text).not.toMatch(/\(\s*\)/);
  });
});

describe('Phase 7a Bug 2 — L1 key moments / L2 quotes first item preserved', () => {
  const KEY_MOMENTS_MD = `# 🎙️ Key moments — Test

*5 moments — fixture régression*

## 1. Premier moment important
**00:01–00:30** · saliency 0.95

> Quote du moment 1.

**Pourquoi c'est saillant** : Premier moment doit apparaître.

## 2. Deuxième moment
**01:00–01:30** · saliency 0.85

> Quote du moment 2.

**Pourquoi c'est saillant** : Deuxième moment.

## 3. Troisième moment
**02:00–02:30** · saliency 0.75

> Quote du moment 3.

**Pourquoi c'est saillant** : Troisième moment.

## 4. Quatrième moment
**03:00–03:30** · saliency 0.65

> Quote du moment 4.

**Pourquoi c'est saillant** : Quatrième moment.

## 5. Cinquième moment
**04:00–04:30** · saliency 0.55

> Quote du moment 5.

**Pourquoi c'est saillant** : Cinquième moment.
`;

  it('parser captures all 5 moments from source markdown', () => {
    const out = parseKeyMoments(KEY_MOMENTS_MD);
    expect(out.moments).toHaveLength(5);
    expect(out.moments[0].numero).toBe(1);
    expect(out.moments[0].titre).toBe('Premier moment important');
    expect(out.moments[4].numero).toBe(5);
  });

  it('xlsx contains a data row for moment #1 (no off-by-one)', async () => {
    const livrable = parseKeyMoments(KEY_MOMENTS_MD);
    const f = new XlsxFormatter();
    const out = await f.formatLivrable(livrable, CTX);
    const zip = new AdmZip(out.buffer);
    const sheet = zip.getEntry('xl/worksheets/sheet1.xml')?.getData().toString('utf-8') ?? '';
    const sharedStrings =
      zip.getEntry('xl/sharedStrings.xml')?.getData().toString('utf-8') ?? '';
    const all = sheet + sharedStrings;
    // Le moment #1 doit être présent dans le xlsx
    expect(all).toContain('Premier moment important');
    // Saliency 0.95 (le plus haut) — moment #1 — doit être présent
    expect(sheet).toMatch(/0\.95/);
  });

  const QUOTES_MD = `# 💬 Quotes — Test

*5 citations — fixture régression*

## Citation 1

> *« Première citation marquante. »*
> — **Auteur Premier** · 00:10

**Plateforme(s)** : twitter, linkedin
**Pourquoi cette citation** : Premier qui doit apparaître.

## Citation 2

> *« Deuxième citation. »*
> — **Auteur Deux** · 00:20

**Plateforme(s)** : twitter
**Pourquoi cette citation** : Deuxième.

## Citation 3

> *« Troisième. »*
> — **Auteur Trois** · 00:30

**Plateforme(s)** : linkedin
**Pourquoi cette citation** : Troisième.

---

*Sillon — production éditoriale cross-corpus écosystème Orso.*
`;

  it('parser captures all 3 quotes from source markdown', () => {
    const out = parseQuotes(QUOTES_MD);
    expect(out.quotes).toHaveLength(3);
    expect(out.quotes[0].numero).toBe(1);
    expect(out.quotes[0].auteur).toBe('Auteur Premier');
  });

  it('xlsx contains a data row for citation #1 (no off-by-one)', async () => {
    const livrable = parseQuotes(QUOTES_MD);
    const f = new XlsxFormatter();
    const out = await f.formatLivrable(livrable, CTX);
    const zip = new AdmZip(out.buffer);
    const sheet =
      zip.getEntry('xl/worksheets/sheet1.xml')?.getData().toString('utf-8') ?? '';
    const sharedStrings =
      zip.getEntry('xl/sharedStrings.xml')?.getData().toString('utf-8') ?? '';
    const all = sheet + sharedStrings;
    expect(all).toContain('Première citation marquante');
    expect(all).toContain('Auteur Premier');
  });
});
