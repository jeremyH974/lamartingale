import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseBriefAnnexe,
  parseCrossRefs,
  parseKeyMoments,
  parseNewsletter,
  parseQuotes,
} from '../output/parsers/markdownParser';

const ROOT = resolve(
  'experiments',
  'autonomy-session-2026-04-28',
  'pack-pilote-stefani-orso',
);

const EPISODES = ['plais-platform-sh', 'boissenot-pokemon', 'nooz-optics', 'veyrat-stoik'];

function readEp(slug: string, file: string): string {
  return readFileSync(resolve(ROOT, slug, file), 'utf-8');
}

describe('markdown parsers — Phase 7a', () => {
  describe('parseKeyMoments', () => {
    it.each(EPISODES)('parses key moments from %s', (slug) => {
      const md = readEp(slug, '01-key-moments.md');
      const out = parseKeyMoments(md);
      expect(out.type).toBe('L1_keyMoments');
      expect(out.title).toBeTruthy();
      expect(out.moments.length).toBeGreaterThan(0);
      for (const m of out.moments) {
        expect(m.numero).toBeGreaterThan(0);
        expect(m.titre).toBeTruthy();
        expect(m.timestampStart).toMatch(/^\d{1,2}:\d{2}$/);
        expect(m.timestampEnd).toMatch(/^\d{1,2}:\d{2}$/);
        expect(m.saliency).toBeGreaterThanOrEqual(0);
        expect(m.saliency).toBeLessThanOrEqual(1);
        expect(m.quote).toBeTruthy();
        expect(m.pourquoi).toBeTruthy();
      }
    });
  });

  describe('parseQuotes', () => {
    it.each(EPISODES)('parses quotes from %s', (slug) => {
      const md = readEp(slug, '02-quotes.md');
      const out = parseQuotes(md);
      expect(out.type).toBe('L2_quotes');
      expect(out.quotes.length).toBeGreaterThanOrEqual(3);
      for (const q of out.quotes) {
        expect(q.text).toBeTruthy();
        expect(q.auteur).toBeTruthy();
        expect(q.timestamp).toMatch(/^\d{1,2}:\d{2}$/);
        expect(q.plateformes.length).toBeGreaterThan(0);
        expect(q.pourquoi).toBeTruthy();
      }
    });
  });

  describe('parseCrossRefs', () => {
    it.each(EPISODES)('parses cross-refs from %s', (slug) => {
      const md = readEp(slug, '03-cross-refs-by-lens.md');
      const out = parseCrossRefs(md);
      expect(out.type).toBe('L3_crossRefs');
      expect(out.sections.length).toBeGreaterThan(0);
      for (const s of out.sections) {
        expect(s.lensIntro).toBeTruthy();
        expect(s.refs.length).toBeGreaterThan(0);
        for (const r of s.refs) {
          // Au moins l'un de (episodeNumber, guestName, episodeTitle) est non vide
          expect(`${r.episodeNumber}${r.guestName}${r.episodeTitle}`.length).toBeGreaterThan(0);
          expect(r.bodyParagraphs.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('parseNewsletter', () => {
    it.each(EPISODES)('parses newsletter from %s', (slug) => {
      const md = readEp(slug, '04-newsletter.md');
      const out = parseNewsletter(md);
      expect(out.type).toBe('L4_newsletter');
      expect(out.newsletterTitle).toBeTruthy();
      expect(out.sections.length).toBeGreaterThan(0);
      // Au moins une section avec des paragraphes
      const hasContent = out.sections.some((s) => s.length > 0);
      expect(hasContent).toBe(true);
    });
  });

  describe('parseBriefAnnexe', () => {
    it.each(EPISODES)('parses brief annexe from %s', (slug) => {
      const md = readEp(slug, '05-brief-annexe.md');
      const out = parseBriefAnnexe(md);
      expect(out.type).toBe('L5_briefAnnexe');
      expect(out.intro).toBeTruthy();
      expect(out.sections.length).toBeGreaterThan(0);
      // Au moins une section a un heading + paragraphes (les autres peuvent
      // être des notes de fin sans heading bold).
      const hasRich = out.sections.some(
        (s) => s.heading && s.paragraphs.length > 0,
      );
      expect(hasRich).toBe(true);
    });
  });
});
