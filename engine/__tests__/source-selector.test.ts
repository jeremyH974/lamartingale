import { describe, it, expect } from 'vitest';
import {
  extractContent,
  selectBestSource,
  type SourceEpisode,
} from '@engine/agents/wrappers/sourceSelector';

// Fixtures inspirés des cas réels Larchevêque (gdiy#243, lamartingale#3,
// passionpatrimoine#26). Pas de hit DB — sourceSelector est pur.

const RICH_EP: SourceEpisode = {
  // ~3000c : largement au-dessus du minLength 500 d'article_content
  article_content: 'A'.repeat(3238),
  chapters: [
    { title: "Présentation d'Eric Larchevêque" },
    { title: 'Bitcoin et ruptures technologiques' },
  ],
  key_takeaways: null,
  rss_description: 'rss desc gdiy 243...',
};

const MID_EP: SourceEpisode = {
  // article 2986c, chapter unique + 2 takeaways
  article_content: 'B'.repeat(2986),
  chapters: [{ title: 'Derniers épisodes' }],
  key_takeaways: ['Notre invité du jour :', 'Au programme de ce troisième épisode :'],
  rss_description: 'rss desc lm 3 ...'.repeat(50),
};

const MINIMAL_EP: SourceEpisode = {
  // 0 article, 0 chapters, 0 takeaways → seul rss_description disponible
  article_content: null,
  chapters: null,
  key_takeaways: null,
  rss_description: 'C'.repeat(2735),
};

const EMPTY_EP: SourceEpisode = {
  article_content: '',
  chapters: [],
  key_takeaways: [],
  rss_description: '',
};

describe('selectBestSource — cascade priorities', () => {
  it('1. épisode riche (gdiy#243-like) → article_content (score 0.8)', () => {
    const sel = selectBestSource(RICH_EP);
    expect(sel.type).toBe('article_content');
    expect(sel.qualityScore).toBe(0.8);
    expect(sel.content.length).toBe(3238);
  });

  it('2. épisode moyen (lm#3-like) → article_content prime même avec chapter+takeaways dispos', () => {
    const sel = selectBestSource(MID_EP);
    expect(sel.type).toBe('article_content');
    expect(sel.qualityScore).toBe(0.8);
    expect(sel.content.length).toBe(2986);
  });

  it('3. épisode minimal (pp#26-like) → fallback rss_description (score 0.1)', () => {
    const sel = selectBestSource(MINIMAL_EP);
    expect(sel.type).toBe('rss_description');
    expect(sel.qualityScore).toBe(0.1);
    expect(sel.content.length).toBe(2735);
  });

  it('4. épisode totalement vide → fallback ultime rss_description avec content="" et score 0.1', () => {
    const sel = selectBestSource(EMPTY_EP);
    expect(sel.type).toBe('rss_description');
    expect(sel.qualityScore).toBe(0.1);
    expect(sel.content).toBe('');
  });

  it('5. article < minLength 500 mais chapters_takeaways suffisants → fallback chapters_takeaways', () => {
    const ep: SourceEpisode = {
      article_content: 'short',
      chapters: Array.from({ length: 10 }, (_, i) => ({
        title: `Chapitre ${i} avec un titre suffisamment descriptif pour gonfler la concat`,
      })),
      key_takeaways: ['Takeaway A long suffisamment pour atteindre le seuil'.repeat(3)],
      rss_description: 'short',
    };
    const sel = selectBestSource(ep);
    expect(sel.type).toBe('chapters_takeaways');
    expect(sel.qualityScore).toBe(0.5);
    expect(sel.content.length).toBeGreaterThanOrEqual(200);
  });
});

describe('extractContent — concat chapters + takeaways', () => {
  it('concatène titres de chapters et takeaways avec double newline séparateur', () => {
    const ep: SourceEpisode = {
      chapters: [{ title: 'Intro' }, { title: 'Coeur de sujet' }],
      key_takeaways: ['Point A', 'Point B'],
    };
    const out = extractContent(ep, 'chapters_takeaways');
    expect(out).toBe('Intro\nCoeur de sujet\n\nPoint A\nPoint B');
  });

  it('inclut summary quand présent (futur-proof, optionnel)', () => {
    const ep: SourceEpisode = {
      chapters: [{ title: 'Intro', summary: 'Présentation rapide' }],
    };
    const out = extractContent(ep, 'chapters_takeaways');
    expect(out).toBe('Intro: Présentation rapide');
  });

  it('renvoie chaîne vide si tout null/undefined', () => {
    const ep: SourceEpisode = {};
    expect(extractContent(ep, 'article_content')).toBe('');
    expect(extractContent(ep, 'chapters_takeaways')).toBe('');
    expect(extractContent(ep, 'rss_description')).toBe('');
    expect(extractContent(ep, 'transcript')).toBe('');
  });
});
