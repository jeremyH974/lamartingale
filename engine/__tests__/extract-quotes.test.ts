import { describe, it, expect, vi } from 'vitest';
import {
  extractQuotes,
  buildPrompt,
  isVerbatim,
  normalizeForVerbatim,
  QuoteSchema,
} from '@engine/primitives/extractQuotes';
import type { TranscriptResult } from '@engine/primitives/transcribeAudio';
import type { LLMFn, PodcastContext } from '@engine/primitives/types';

const LM_CTX: PodcastContext = {
  podcast_id: 'lamartingale',
  podcast_name: 'La Martingale',
  editorial_focus: 'finance personnelle',
  host_name: 'Matthieu Stefani',
};

const TRANSCRIPT: TranscriptResult = {
  full_text:
    "Pour moi, le Bitcoin n'est pas un investissement, c'est une idéologie. Quand j'ai commencé en 2013, personne n'y croyait. Aujourd'hui, j'ai investi 10% de mon patrimoine sur des cartes Pokémon vintage. C'est un marché illiquide mais asymétrique. La rentabilité des cartes Charizard édition 1999 a explosé entre 2018 et 2021, multipliée par cinquante sur certains grades. Les acheteurs sont devenus plus sophistiqués. Les fonds spécialisés cherchent des actifs alternatifs.",
  segments: [
    {
      start_seconds: 0,
      end_seconds: 30,
      text: "Pour moi, le Bitcoin n'est pas un investissement, c'est une idéologie.",
    },
    {
      start_seconds: 30,
      end_seconds: 60,
      text: "Quand j'ai commencé en 2013, personne n'y croyait.",
    },
    {
      start_seconds: 60,
      end_seconds: 120,
      text: "Aujourd'hui, j'ai investi 10% de mon patrimoine sur des cartes Pokémon vintage. C'est un marché illiquide mais asymétrique.",
    },
  ],
  duration_seconds: 120,
  cost_usd: 0.012,
};

// Verbatim chunk > 280 chars (used for platform_fit auto-fix tests)
const LONG_VERBATIM = "le Bitcoin n'est pas un investissement, c'est une idéologie. Quand j'ai commencé en 2013, personne n'y croyait. Aujourd'hui, j'ai investi 10% de mon patrimoine sur des cartes Pokémon vintage. C'est un marché illiquide mais asymétrique. La rentabilité des cartes Charizard édition 1999 a explosé entre 2018 et 2021";

function fixedLlmFn(payload: unknown): LLMFn {
  return vi.fn(async () => JSON.stringify(payload));
}

const VERBATIM_VALID = {
  quotes: [
    {
      text: "le Bitcoin n'est pas un investissement, c'est une idéologie",
      author: 'Alexandre Boissenot',
      start_seconds: 0,
      end_seconds: 30,
      platform_fit: ['twitter', 'linkedin'],
      rationale: 'Position éditoriale forte sur la nature du Bitcoin.',
    },
    {
      text: "j'ai investi 10% de mon patrimoine sur des cartes Pokémon vintage",
      author: 'Alexandre Boissenot',
      start_seconds: 60,
      end_seconds: 90,
      platform_fit: ['twitter'],
      rationale: 'Donnée chiffrée saillante sur allocation alternative.',
    },
    {
      text: "C'est un marché illiquide mais asymétrique",
      author: 'Alexandre Boissenot',
      start_seconds: 90,
      end_seconds: 120,
      platform_fit: ['linkedin'],
      rationale: 'Caractérisation technique du marché collectibles.',
    },
  ],
};

describe('normalizeForVerbatim', () => {
  it('lowercases', () => {
    expect(normalizeForVerbatim('HELLO World')).toBe('hello world');
  });

  it('removes accents', () => {
    expect(normalizeForVerbatim('idéologie')).toBe('ideologie');
  });

  it('removes punctuation but keeps content', () => {
    expect(normalizeForVerbatim("c'est, vraiment ; bien.")).toBe('c est vraiment bien');
  });

  it('collapses whitespace', () => {
    expect(normalizeForVerbatim('a  \t  b\n\nc')).toBe('a b c');
  });
});

describe('isVerbatim', () => {
  it('matches exact substring', () => {
    expect(isVerbatim('le Bitcoin', TRANSCRIPT.full_text)).toBe(true);
  });

  it('matches across casing/punctuation/accent variants', () => {
    expect(
      isVerbatim("LE BITCOIN N'EST PAS UN INVESTISSEMENT", TRANSCRIPT.full_text),
    ).toBe(true);
    expect(isVerbatim('idéologie', TRANSCRIPT.full_text)).toBe(true);
    expect(isVerbatim('ideologie', TRANSCRIPT.full_text)).toBe(true);
  });

  it('rejects paraphrase', () => {
    expect(
      isVerbatim('Bitcoin est plus une idéologie qu\'un investissement', TRANSCRIPT.full_text),
    ).toBe(false);
  });

  it('rejects hallucinated quote', () => {
    expect(
      isVerbatim('J\'ai gagné 100 millions avec Bitcoin', TRANSCRIPT.full_text),
    ).toBe(false);
  });

  it('rejects too short (< 3 chars normalized)', () => {
    expect(isVerbatim('a', TRANSCRIPT.full_text)).toBe(false);
  });
});

describe('QuoteSchema', () => {
  it('rejects empty platform_fit', () => {
    expect(() =>
      QuoteSchema.parse({
        text: 'x',
        author: 'X',
        start_seconds: 0,
        end_seconds: 1,
        platform_fit: [],
        rationale: 'long enough rationale.',
      }),
    ).toThrow();
  });

  it('rejects unknown platform', () => {
    expect(() =>
      QuoteSchema.parse({
        text: 'x',
        author: 'X',
        start_seconds: 0,
        end_seconds: 1,
        platform_fit: ['tiktok'],
        rationale: 'long enough rationale.',
      }),
    ).toThrow();
  });
});

describe('buildPrompt', () => {
  it('includes guest, host, podcast and verbatim instruction', () => {
    const p = buildPrompt(TRANSCRIPT, {
      guestName: 'Alexandre Boissenot',
      hostName: 'Matthieu Stefani',
      podcastContext: LM_CTX,
    });
    expect(p).toContain('Alexandre Boissenot');
    expect(p).toContain('Matthieu Stefani');
    expect(p).toContain('VERBATIM');
    expect(p).toContain('La Martingale');
  });
});

describe('extractQuotes', () => {
  it('returns 3 verbatim quotes when LLM returns 3 valid', async () => {
    const result = await extractQuotes(TRANSCRIPT, {
      guestName: 'Alexandre Boissenot',
      hostName: 'Matthieu Stefani',
      podcastContext: LM_CTX,
    }, { llmFn: fixedLlmFn(VERBATIM_VALID) });
    expect(result.quotes).toHaveLength(3);
    // Returned 3 of expected 5 → expect "Returned 3 quotes" warning
    expect(result.warnings.some((w) => /Returned 3/.test(w))).toBe(true);
  });

  it('rejects non-verbatim quote (paraphrase) and keeps the rest', async () => {
    const mixed = {
      quotes: [
        ...VERBATIM_VALID.quotes,
        {
          text: 'Bitcoin est plus une idéologie quun investissement', // paraphrase
          author: 'Alexandre Boissenot',
          start_seconds: 0,
          end_seconds: 30,
          platform_fit: ['twitter'],
          rationale: 'Test rejet paraphrase.',
        },
      ],
    };
    const result = await extractQuotes(TRANSCRIPT, {
      guestName: 'Alexandre Boissenot',
      hostName: 'Matthieu Stefani',
      podcastContext: LM_CTX,
    }, { llmFn: fixedLlmFn(mixed) });
    expect(result.quotes).toHaveLength(3);
    expect(result.warnings.some((w) => /not verbatim/.test(w))).toBe(true);
  });

  it('rejects quote with author not in {guestName, hostName}', async () => {
    const wrongAuthor = {
      quotes: [
        {
          ...VERBATIM_VALID.quotes[0],
          author: 'Some Other Person',
        },
      ],
    };
    const result = await extractQuotes(TRANSCRIPT, {
      guestName: 'Alexandre Boissenot',
      hostName: 'Matthieu Stefani',
      podcastContext: LM_CTX,
    }, { llmFn: fixedLlmFn(wrongAuthor) });
    expect(result.quotes).toHaveLength(0);
    expect(result.warnings.some((w) => /not in allowed set/.test(w))).toBe(true);
  });

  it('auto-fixes platform_fit by removing twitter when text > 280 chars', async () => {
    expect(LONG_VERBATIM.length).toBeGreaterThan(280);
    const longQuote = {
      quotes: [
        {
          text: LONG_VERBATIM,
          author: 'Alexandre Boissenot',
          start_seconds: 0,
          end_seconds: 120,
          platform_fit: ['twitter', 'linkedin'],
          rationale: 'Passage long mais cohérent éditorialement.',
        },
      ],
    };
    const result = await extractQuotes(TRANSCRIPT, {
      guestName: 'Alexandre Boissenot',
      hostName: 'Matthieu Stefani',
      podcastContext: LM_CTX,
    }, { llmFn: fixedLlmFn(longQuote) });
    expect(result.quotes).toHaveLength(1);
    expect(result.quotes[0].platform_fit).toEqual(['linkedin']);
    expect(result.warnings.some((w) => /removed 'twitter'/.test(w))).toBe(true);
  });

  it('rejects quote when platform_fit empty after twitter strip and text > 280', async () => {
    const result = await extractQuotes(TRANSCRIPT, {
      guestName: 'Alexandre Boissenot',
      podcastContext: LM_CTX,
    }, {
      llmFn: fixedLlmFn({
        quotes: [
          {
            text: LONG_VERBATIM,
            author: 'Alexandre Boissenot',
            start_seconds: 0,
            end_seconds: 120,
            platform_fit: ['twitter'], // only twitter, will be stripped → empty
            rationale: 'Long text, twitter only.',
          },
        ],
      }),
    });
    expect(result.quotes).toHaveLength(0);
    expect(result.warnings.some((w) => /platform_fit empty after twitter auto-fix/.test(w))).toBe(true);
  });

  it('skips quote that fails zod validation but keeps others', async () => {
    const partial = {
      quotes: [
        VERBATIM_VALID.quotes[0],
        {
          text: 'short',
          author: 'Alexandre Boissenot',
          start_seconds: 100,
          end_seconds: 50, // invalid: end < start
          platform_fit: ['twitter'],
          rationale: 'Test schema fail rationale 10+',
        },
      ],
    };
    const result = await extractQuotes(TRANSCRIPT, {
      guestName: 'Alexandre Boissenot',
      podcastContext: LM_CTX,
    }, { llmFn: fixedLlmFn(partial) });
    expect(result.quotes).toHaveLength(1);
    expect(result.warnings.some((w) => /failed zod validation/.test(w))).toBe(true);
  });

  it('truncates to maxQuotes if more accepted than asked', async () => {
    const six = {
      quotes: [
        ...VERBATIM_VALID.quotes,
        ...VERBATIM_VALID.quotes, // duplicate to get 6 verbatim entries
      ],
    };
    const result = await extractQuotes(TRANSCRIPT, {
      guestName: 'Alexandre Boissenot',
      podcastContext: LM_CTX,
      maxQuotes: 4,
    }, { llmFn: fixedLlmFn(six) });
    expect(result.quotes).toHaveLength(4);
    expect(result.warnings.some((w) => /Truncated to top 4/.test(w))).toBe(true);
  });

  it('throws when guestName missing', async () => {
    await expect(
      extractQuotes(TRANSCRIPT, {
        guestName: '',
        podcastContext: LM_CTX,
      }, { llmFn: fixedLlmFn(VERBATIM_VALID) }),
    ).rejects.toThrow(/guestName is required/);
  });

  it('rejects quote matching a host-blacklisted phrase (V2 FIX 5 / F-P5-2)', async () => {
    // Use a phrase that IS verbatim in TRANSCRIPT so verbatim guard passes,
    // then test that the host-blacklist filter rejects it. The phrase
    // mimics Stefani's signature attribution scenario.
    const VERBATIM_PHRASE_FROM_TRANSCRIPT =
      "le Bitcoin n'est pas un investissement, c'est une idéologie";
    const blacklistTest = {
      quotes: [
        {
          text: VERBATIM_PHRASE_FROM_TRANSCRIPT,
          author: 'Alexandre Boissenot',
          start_seconds: 0,
          end_seconds: 30,
          platform_fit: ['twitter'],
          rationale: 'Test rejet host-blacklist phrase even when verbatim guard passes.',
        },
      ],
    };
    const result = await extractQuotes(TRANSCRIPT, {
      guestName: 'Alexandre Boissenot',
      podcastContext: LM_CTX,
      hostBlacklistPhrases: [VERBATIM_PHRASE_FROM_TRANSCRIPT],
    }, { llmFn: fixedLlmFn(blacklistTest) });
    expect(result.quotes).toHaveLength(0);
    expect(result.warnings.some((w) => /host-blacklisted phrase/.test(w))).toBe(true);
  });

  it('keeps quote when host-blacklist is empty/undefined (default behavior)', async () => {
    const result = await extractQuotes(TRANSCRIPT, {
      guestName: 'Alexandre Boissenot',
      podcastContext: LM_CTX,
    }, { llmFn: fixedLlmFn(VERBATIM_VALID) });
    expect(result.quotes.length).toBeGreaterThan(0);
  });

  it('throws when transcript empty', async () => {
    await expect(
      extractQuotes({ ...TRANSCRIPT, full_text: '' }, {
        guestName: 'X',
        podcastContext: LM_CTX,
      }, { llmFn: fixedLlmFn(VERBATIM_VALID) }),
    ).rejects.toThrow(/full_text is empty/);
  });
});
