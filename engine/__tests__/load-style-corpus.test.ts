import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  loadStyleCorpusNewsletters,
  buildFewShotBlock,
  detectHostBlacklistMatches,
  detectEcosystemMention,
  stripFrontMatter,
} from '@engine/agents/loadStyleCorpus';
import type { ClientStyleCorpus } from '@engine/types/client-config';

async function makeFixture(): Promise<{ root: string; corpus: ClientStyleCorpus }> {
  const root = await fs.mkdtemp(join(tmpdir(), 'style-corpus-test-'));
  await fs.mkdir(join(root, 'host-x'), { recursive: true });
  await fs.writeFile(join(root, 'host-x', 'a.md'), '# A\n\nBody A short.', 'utf-8');
  await fs.writeFile(join(root, 'host-x', 'b.md'), '# B\n\n' + 'x'.repeat(10000), 'utf-8');
  await fs.writeFile(join(root, 'host-x', 'c.md'), '# C\n\nBody C anecdote.', 'utf-8');
  // d.md not created on purpose to test missing-file silent skip
  const corpus: ClientStyleCorpus = {
    newsletters: [
      { id: 'a', title: 'A', date: '2026-01-01', pattern_tags: ['anecdote', 'tech'], excerpts: [] },
      { id: 'b', title: 'B', date: '2026-01-02', pattern_tags: ['analyse'], excerpts: [] },
      { id: 'c', title: 'C', date: '2026-01-03', pattern_tags: ['anecdote'], excerpts: [] },
      { id: 'd', title: 'D missing', date: '2026-01-04', pattern_tags: ['x'], excerpts: [] },
    ],
    host_blacklist_phrases: ['Phrase fétiche du host', 'Casquette Verte'],
    signature_expressions: ['Boom.'],
    ecosystem_reference: {
      canonical_phrase: 'écosystème Foo',
      alternatives: ['catalogue Foo Media'],
      must_appear_in: ['newsletter'],
      appearance_style: 'naturelle',
    },
  };
  return { root, corpus };
}

describe('loadStyleCorpusNewsletters', () => {
  it('loads N newsletters in declarative order without preferredTags', async () => {
    const { root, corpus } = await makeFixture();
    const out = await loadStyleCorpusNewsletters({
      corpus,
      hostSlug: 'host-x',
      count: 2,
      corpusRoot: root,
    });
    expect(out).toHaveLength(2);
    expect(out.map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('reorders by preferredTags overlap (anecdote prioritized)', async () => {
    const { root, corpus } = await makeFixture();
    const out = await loadStyleCorpusNewsletters({
      corpus,
      hostSlug: 'host-x',
      count: 3,
      preferredTags: ['anecdote'],
      corpusRoot: root,
    });
    // a + c match anecdote (score 1) ; b matches none (score 0).
    // Stable sort puts a/c first.
    expect(out.slice(0, 2).map((n) => n.id).sort()).toEqual(['a', 'c']);
  });

  it('truncates large newsletters to maxCharsPerNewsletter', async () => {
    const { root, corpus } = await makeFixture();
    const out = await loadStyleCorpusNewsletters({
      corpus,
      hostSlug: 'host-x',
      count: 2,
      corpusRoot: root,
      maxCharsPerNewsletter: 500,
    });
    const big = out.find((n) => n.id === 'b');
    expect(big?.truncated).toBe(true);
    expect(big!.body.length).toBeLessThan(700);
  });

  it('silently skips missing files', async () => {
    const { root, corpus } = await makeFixture();
    const out = await loadStyleCorpusNewsletters({
      corpus,
      hostSlug: 'host-x',
      count: 4,
      corpusRoot: root,
    });
    expect(out.map((n) => n.id)).not.toContain('d');
    expect(out.length).toBe(3);
  });

  it('returns empty when corpus has no newsletters', async () => {
    const out = await loadStyleCorpusNewsletters({
      corpus: {
        newsletters: [],
        host_blacklist_phrases: [],
        signature_expressions: [],
        ecosystem_reference: {
          canonical_phrase: 'x',
          alternatives: [],
          must_appear_in: [],
          appearance_style: '',
        },
      },
      hostSlug: 'host-x',
      count: 3,
    });
    expect(out).toEqual([]);
  });
});

describe('buildFewShotBlock', () => {
  it('builds a few-shot block with all loaded newsletters', () => {
    const block = buildFewShotBlock([
      {
        id: 'a',
        title: 'Title A',
        date: '2026-01-01',
        pattern_tags: ['anecdote'],
        excerpts: [],
        body: 'Corps newsletter A.',
        truncated: false,
      },
      {
        id: 'b',
        title: 'Title B',
        date: '2026-01-02',
        pattern_tags: ['analyse'],
        excerpts: [],
        body: 'Corps newsletter B.',
        truncated: false,
      },
    ]);
    expect(block).toContain('EXEMPLES RÉELS DU HOST');
    expect(block).toContain('Title A');
    expect(block).toContain('Title B');
    expect(block).toContain('Corps newsletter A.');
  });

  it('returns empty string when no newsletters', () => {
    expect(buildFewShotBlock([])).toBe('');
  });
});

describe('detectHostBlacklistMatches', () => {
  it('detects case-insensitive substring matches', () => {
    const matches = detectHostBlacklistMatches(
      'Comme dirait l\'autre, Casquette verte forever.',
      ['Casquette Verte', 'Phrase rare'],
    );
    expect(matches).toEqual(['Casquette Verte']);
  });

  it('returns empty array when nothing matches', () => {
    expect(detectHostBlacklistMatches('Texte propre.', ['XYZ'])).toEqual([]);
  });
});

describe('stripFrontMatter (Phase 5 V5 fix F-V4-1)', () => {
  it('strips H1 + blockquote front-matter and preserves body', () => {
    const raw = `# Acheter juste

> Date : 03/11/2025
> Auteur : Matthieu Stefani
> URL : https://matt.kessel.media/posts/pst_xyz
> Pattern tags : opening-court, tension-personnelle

Ou pourquoi est-il devenu si compliqué de consommer.

En 2025, il "faut" passer à l'électrique.`;
    const out = stripFrontMatter(raw);
    expect(out).not.toContain('# Acheter juste');
    expect(out).not.toContain('> Date');
    expect(out).not.toContain('> Auteur');
    expect(out).not.toContain('> URL');
    expect(out).not.toContain('> Pattern tags');
    expect(out).toContain('Ou pourquoi est-il devenu si compliqué de consommer');
    expect(out).toContain('En 2025');
  });

  it('returns content unchanged when no front-matter present', () => {
    const raw = `Body sans front-matter.

Deuxième paragraphe.`;
    expect(stripFrontMatter(raw)).toBe(raw);
  });

  it('handles file with H1 only (no front-matter block)', () => {
    const raw = `# Titre

Corps direct sans bloc cite.`;
    const out = stripFrontMatter(raw);
    expect(out).not.toContain('# Titre');
    expect(out.trim().startsWith('Corps direct')).toBe(true);
  });

  it('strips real Stefani corpus file (acheter-juste-2025-11.md) cleanly', async () => {
    const file = join(process.cwd(), 'data', 'style-corpus', 'stefani', 'acheter-juste-2025-11.md');
    const raw = await fs.readFile(file, 'utf-8');
    const out = stripFrontMatter(raw);
    // No leaked front-matter
    expect(out).not.toContain('> Date :');
    expect(out).not.toContain('> Auteur :');
    expect(out).not.toContain('> URL :');
    expect(out).not.toContain('> Pattern tags');
    // No H1 leaked
    expect(out.startsWith('# ')).toBe(false);
    // Body preserved (Stefani signature lines from this file)
    expect(out).toContain('passer à l\'électrique');
    expect(out).toContain('je cale');
  });
});

describe('detectEcosystemMention', () => {
  const ref = {
    canonical_phrase: 'écosystème Orso',
    alternatives: ['catalogue Orso Media'],
    must_appear_in: ['newsletter' as const],
    appearance_style: 'naturelle',
  };

  it('detects canonical phrase', () => {
    expect(detectEcosystemMention('Dans l\'écosystème Orso, ...', ref)).toBe(true);
  });

  it('detects alternative phrase', () => {
    expect(detectEcosystemMention('Le catalogue Orso Media compte 6 podcasts.', ref)).toBe(true);
  });

  it('returns false when nothing matches', () => {
    expect(detectEcosystemMention('Pas de mention ici.', ref)).toBe(false);
  });
});
