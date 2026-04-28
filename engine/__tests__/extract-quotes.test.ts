import { describe, it, expect, vi } from 'vitest';
import {
  extractQuotes,
  buildPrompt,
  buildSegmentedTranscriptBlock,
  resolveQuoteTimestamps,
  isVerbatim,
  normalizeForVerbatim,
  QuoteSchema,
  RawQuoteSchema,
} from '@engine/primitives/extractQuotes';
import type { TranscriptResult, TranscribedSegment } from '@engine/primitives/transcribeAudio';
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
    {
      start_seconds: 120,
      end_seconds: 180,
      text: "La rentabilité des cartes Charizard édition 1999 a explosé entre 2018 et 2021, multipliée par cinquante sur certains grades.",
    },
    {
      start_seconds: 180,
      end_seconds: 210,
      text: "Les acheteurs sont devenus plus sophistiqués. Les fonds spécialisés cherchent des actifs alternatifs.",
    },
  ],
  duration_seconds: 210,
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
      segment_index_start: 0,
      segment_index_end: 0,
      platform_fit: ['twitter', 'linkedin'],
      rationale: 'Position éditoriale forte sur la nature du Bitcoin.',
    },
    {
      text: "j'ai investi 10% de mon patrimoine sur des cartes Pokémon vintage",
      author: 'Alexandre Boissenot',
      segment_index_start: 2,
      segment_index_end: 2,
      platform_fit: ['twitter'],
      rationale: 'Donnée chiffrée saillante sur allocation alternative.',
    },
    {
      text: "C'est un marché illiquide mais asymétrique",
      author: 'Alexandre Boissenot',
      segment_index_start: 2,
      segment_index_end: 2,
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

describe('isVerbatim — dérive subtile (Phase 8 calibration)', () => {
  // Fixture : un segment Whisper avec apostrophe courbe + filler "euh"
  const segmentWithFiller =
    "Donc euh je vis avec ce risque, avec cette épée de Damoclès au-dessus de la tête";

  it('accepte apostrophes courbes vs droites (typographic vs ASCII)', () => {
    // Sonnet retourne souvent des apostrophes droites '
    // Whisper transcrit souvent des apostrophes courbes ' (U+2019)
    const transcriptCurly = "Aujourd’hui, c’est une idéologie";
    const quoteStraight = "Aujourd'hui, c'est une idéologie";
    expect(isVerbatim(quoteStraight, transcriptCurly)).toBe(true);
    // Inverse aussi
    const transcriptStraight = "Aujourd'hui, c'est une idéologie";
    const quoteCurly = "Aujourd’hui, c’est une idéologie";
    expect(isVerbatim(quoteCurly, transcriptStraight)).toBe(true);
  });

  it('accepte une quote qui omet un filler "euh"/"hum" placé EN BORDURE du segment', () => {
    // Cas où le filler est en début/fin du segment, pas dans la quote :
    // includes() reste strict mais la quote est un suffix/prefix → match.
    const quoteCleaned = "je vis avec ce risque, avec cette épée de Damoclès au-dessus de la tête";
    expect(isVerbatim(quoteCleaned, segmentWithFiller)).toBe(true);
  });

  it('LIMITATION CONNUE : reject si filler "euh"/"hum" est AU MILIEU de la quote (Sonnet la nettoie)', () => {
    // Cas plus dérangeant : Whisper transcrit "avec cette euh épée de Damoclès"
    // et Sonnet, voyant ce segment, retourne une quote nettoyée
    // "avec cette épée de Damoclès". includes() strict → REJECT.
    //
    // Implication 8.3 : log explicite des verbatim_not_in_window pour
    // détecter combien de rejets viennent de ce pattern. Si fréquent en
    // régen réelle, follow-up commit pour étendre normalize() avec un
    // strip filler /\b(euh|hum|heu|ben|bah)\b/g.
    const segmentWithMidFiller = "je vis avec cette euh épée de Damoclès au-dessus de la tête";
    const quoteCleaned = "je vis avec cette épée de Damoclès au-dessus de la tête";
    expect(isVerbatim(quoteCleaned, segmentWithMidFiller)).toBe(false);
  });

  it('reject paraphrase légère (mots réordonnés)', () => {
    const segment = "Personne sur le marché collecte ces deux types de données";
    const reordered = "Sur le marché, personne ne collecte ces deux types";
    expect(isVerbatim(reordered, segment)).toBe(false);
  });
});

describe('QuoteSchema (public output)', () => {
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

describe('RawQuoteSchema (LLM internal output)', () => {
  it('rejects when segment_index_end < segment_index_start', () => {
    expect(() =>
      RawQuoteSchema.parse({
        text: 'x',
        author: 'X',
        segment_index_start: 5,
        segment_index_end: 3,
        platform_fit: ['twitter'],
        rationale: 'long enough rationale here.',
      }),
    ).toThrow(/segment_index_end must be >= segment_index_start/);
  });

  it('accepts equal start = end (single segment quote)', () => {
    const parsed = RawQuoteSchema.parse({
      text: 'x',
      author: 'X',
      segment_index_start: 5,
      segment_index_end: 5,
      platform_fit: ['twitter'],
      rationale: 'long enough rationale here.',
    });
    expect(parsed.segment_index_start).toBe(5);
  });

  it('rejects negative or non-integer segment_index', () => {
    expect(() =>
      RawQuoteSchema.parse({
        text: 'x',
        author: 'X',
        segment_index_start: -1,
        segment_index_end: 0,
        platform_fit: ['twitter'],
        rationale: 'long enough rationale here.',
      }),
    ).toThrow();
    expect(() =>
      RawQuoteSchema.parse({
        text: 'x',
        author: 'X',
        segment_index_start: 1.5,
        segment_index_end: 2,
        platform_fit: ['twitter'],
        rationale: 'long enough rationale here.',
      }),
    ).toThrow();
  });
});

describe('buildSegmentedTranscriptBlock', () => {
  it('produces [N] text format with one line per segment, no timestamps', () => {
    const result = buildSegmentedTranscriptBlock(TRANSCRIPT.segments, 1000);
    const lines = result.block.split('\n');
    expect(lines).toHaveLength(5);
    expect(lines[0]).toMatch(/^\[0\]/);
    expect(lines[4]).toMatch(/^\[4\]/);
    // No MM:SS or seconds in the prompt block — anti "raisonnement temporel"
    expect(result.block).not.toMatch(/\d+:\d{2}/);
    expect(result.includedSegmentIndices.size).toBe(5);
    expect(result.truncated).toBe(false);
  });

  it('truncates by ENTIRE segments only (never mid-text)', () => {
    // Plafond très bas qui force la troncature après ~2 segments
    const result = buildSegmentedTranscriptBlock(TRANSCRIPT.segments, 200);
    expect(result.truncated).toBe(true);
    // Aucun segment partiel : chaque ligne doit se terminer par un segment.text complet
    const lines = result.block.split('\n');
    for (const line of lines) {
      const match = line.match(/^\[(\d+)\] (.+)$/);
      expect(match).toBeTruthy();
      const idx = Number(match![1]);
      const text = match![2];
      expect(text).toBe(TRANSCRIPT.segments[idx].text.trim());
    }
    // includedSegmentIndices reflète exactement ce qui a été émis
    expect(result.includedSegmentIndices.size).toBe(lines.length);
  });

  it('returns includedSegmentIndices = subset of [0..n-1]', () => {
    const result = buildSegmentedTranscriptBlock(TRANSCRIPT.segments, 200);
    for (const idx of result.includedSegmentIndices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(TRANSCRIPT.segments.length);
    }
  });
});

describe('resolveQuoteTimestamps', () => {
  const allIncluded = new Set([0, 1, 2, 3, 4]);

  it('resolves single-segment quote → timestamps from segment', () => {
    const raw = {
      text: "le Bitcoin n'est pas un investissement",
      author: 'X',
      segment_index_start: 0,
      segment_index_end: 0,
      platform_fit: ['twitter' as const],
      rationale: 'rationale long enough.',
    };
    const result = resolveQuoteTimestamps(raw, TRANSCRIPT.segments, allIncluded);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.start_seconds).toBe(0);
      expect(result.end_seconds).toBe(30);
    }
  });

  it('resolves multi-segment quote (start < end) — range OK', () => {
    // Quote chevauche les segments 2 et 3
    const raw = {
      text: "C'est un marché illiquide mais asymétrique. La rentabilité des cartes Charizard",
      author: 'X',
      segment_index_start: 2,
      segment_index_end: 3,
      platform_fit: ['linkedin' as const],
      rationale: 'rationale long enough.',
    };
    const result = resolveQuoteTimestamps(raw, TRANSCRIPT.segments, allIncluded);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.start_seconds).toBe(60);
      expect(result.end_seconds).toBe(180);
    }
  });

  it('rejects when segment_index out of bounds (segments.length)', () => {
    const raw = {
      text: 'whatever',
      author: 'X',
      segment_index_start: 99,
      segment_index_end: 99,
      platform_fit: ['twitter' as const],
      rationale: 'rationale long enough.',
    };
    const result = resolveQuoteTimestamps(raw, TRANSCRIPT.segments, allIncluded);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/out of bounds/);
  });

  it('rejects when segment_index outside the prompt window (hallucination)', () => {
    // Sonnet retourne un index 4 alors que seuls 0-2 lui ont été montrés
    const truncatedWindow = new Set([0, 1, 2]);
    const raw = {
      text: "Les acheteurs sont devenus plus sophistiqués",
      author: 'X',
      segment_index_start: 4,
      segment_index_end: 4,
      platform_fit: ['twitter' as const],
      rationale: 'rationale long enough.',
    };
    const result = resolveQuoteTimestamps(raw, TRANSCRIPT.segments, truncatedWindow);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/outside the prompt window/);
  });

  it('rejects when verbatim absent of the segment window ±10s', () => {
    // segment_index valide MAIS texte qui n'existe pas du tout dans le transcript
    // (cas Boissenot-style : double hallucination index plausible + verbatim inventé)
    const raw = {
      text: "Pokémon, c'est trois fois plus qu'Harry Potter",
      author: 'X',
      segment_index_start: 2,
      segment_index_end: 2,
      platform_fit: ['twitter' as const],
      rationale: 'rationale long enough.',
    };
    const result = resolveQuoteTimestamps(raw, TRANSCRIPT.segments, allIncluded);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/verbatim not in segment window/);
  });
});

describe('buildPrompt', () => {
  it('includes guest, host, podcast and verbatim instruction + segmented block', () => {
    const { prompt } = buildPrompt(TRANSCRIPT, {
      guestName: 'Alexandre Boissenot',
      hostName: 'Matthieu Stefani',
      podcastContext: LM_CTX,
    });
    expect(prompt).toContain('Alexandre Boissenot');
    expect(prompt).toContain('Matthieu Stefani');
    expect(prompt).toContain('VERBATIM');
    expect(prompt).toContain('La Martingale');
    expect(prompt).toContain('segment_index_start');
    expect(prompt).toContain('NE CALCULE JAMAIS de timestamp');
    // Bloc segmenté présent
    expect(prompt).toMatch(/\[0\] Pour moi, le Bitcoin/);
    // Anti-clustering primauté
    expect(prompt).toContain('couvrant la durée complète');
    // Pas de timestamps MM:SS dans le prompt
    expect(prompt).not.toMatch(/\d+:\d{2}/);
  });

  it('returns includedSegmentIndices reflecting what was sent to LLM', () => {
    const { includedSegmentIndices, truncated } = buildPrompt(TRANSCRIPT, {
      guestName: 'X',
      podcastContext: LM_CTX,
    });
    expect(truncated).toBe(false);
    expect(includedSegmentIndices.size).toBe(5);
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
    expect(result.warnings.some((w) => /Returned 3/.test(w))).toBe(true);
  });

  it('rejects non-verbatim quote (paraphrase) and keeps the rest', async () => {
    const mixed = {
      quotes: [
        ...VERBATIM_VALID.quotes,
        {
          text: 'Bitcoin est plus une idéologie quun investissement', // paraphrase
          author: 'Alexandre Boissenot',
          segment_index_start: 0,
          segment_index_end: 0,
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
    expect(result.warnings.some((w) => /verbatim not in segment window/.test(w))).toBe(true);
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
          segment_index_start: 0,
          segment_index_end: 3,
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
            segment_index_start: 0,
            segment_index_end: 3,
            platform_fit: ['twitter'],
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
          segment_index_start: 5,
          segment_index_end: 2, // invalid: end < start
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
    const VERBATIM_PHRASE_FROM_TRANSCRIPT =
      "le Bitcoin n'est pas un investissement, c'est une idéologie";
    const blacklistTest = {
      quotes: [
        {
          text: VERBATIM_PHRASE_FROM_TRANSCRIPT,
          author: 'Alexandre Boissenot',
          segment_index_start: 0,
          segment_index_end: 0,
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

  it('throws when transcript.segments empty (Phase 8 requires segmented transcript)', async () => {
    await expect(
      extractQuotes({ ...TRANSCRIPT, segments: [] }, {
        guestName: 'X',
        podcastContext: LM_CTX,
      }, { llmFn: fixedLlmFn(VERBATIM_VALID) }),
    ).rejects.toThrow(/segments is empty/);
  });
});

// ---------------------------------------------------------------------------
// Phase 8 — Tests neufs : timestamps fix
// ---------------------------------------------------------------------------

describe('Phase 8 — extractQuotes timestamps fix', () => {
  // T1 already covered by resolveQuoteTimestamps suite (out of bounds).
  // T2 already covered by RawQuoteSchema suite (end < start).
  // T3 already covered by resolveQuoteTimestamps suite (verbatim not in window).
  // Below: integration-level tests on extractQuotes.

  it('T4 — 5 quotes dont 2 rejetées → output 3 + warnings (no-retry)', async () => {
    const mixed = {
      quotes: [
        VERBATIM_VALID.quotes[0],
        VERBATIM_VALID.quotes[1],
        VERBATIM_VALID.quotes[2],
        // Rejet 1 : segment_index hors-borne
        {
          text: 'whatever',
          author: 'Alexandre Boissenot',
          segment_index_start: 99,
          segment_index_end: 99,
          platform_fit: ['twitter'],
          rationale: 'Hallucination index hors-borne.',
        },
        // Rejet 2 : verbatim absent
        {
          text: 'Phrase totalement inventée par le LLM qui nexiste pas',
          author: 'Alexandre Boissenot',
          segment_index_start: 1,
          segment_index_end: 1,
          platform_fit: ['twitter'],
          rationale: 'Hallucination verbatim absent.',
        },
      ],
    };
    const result = await extractQuotes(TRANSCRIPT, {
      guestName: 'Alexandre Boissenot',
      podcastContext: LM_CTX,
    }, { llmFn: fixedLlmFn(mixed) });
    expect(result.quotes).toHaveLength(3);
    expect(result.warnings.filter((w) => /rejected/.test(w))).toHaveLength(2);
    expect(result.warnings.some((w) => /out of bounds/.test(w))).toBe(true);
    expect(result.warnings.some((w) => /verbatim not in segment window/.test(w))).toBe(true);
  });

  it('T5 — quote multi-segments valide (start ≠ end) sur 2 segments contigus', async () => {
    const multiSeg = {
      quotes: [
        {
          // Texte qui chevauche segments 2 (60s) et 3 (120s)
          text: "C'est un marché illiquide mais asymétrique. La rentabilité des cartes Charizard",
          author: 'Alexandre Boissenot',
          segment_index_start: 2,
          segment_index_end: 3,
          platform_fit: ['linkedin'],
          rationale: 'Quote multi-segments valide.',
        },
      ],
    };
    const result = await extractQuotes(TRANSCRIPT, {
      guestName: 'Alexandre Boissenot',
      podcastContext: LM_CTX,
    }, { llmFn: fixedLlmFn(multiSeg) });
    expect(result.quotes).toHaveLength(1);
    expect(result.quotes[0].start_seconds).toBe(60);
    expect(result.quotes[0].end_seconds).toBe(180);
  });

  it('T6 — buildSegmentedTranscriptBlock truncate par segments entiers (déjà testé via buildSegmentedTranscriptBlock — re-vérif via extractQuotes)', async () => {
    // Le bloc envoyé à Sonnet ne doit jamais contenir un segment partiel
    let capturedPrompt = '';
    const llmFn: LLMFn = vi.fn(async (prompt: string) => {
      capturedPrompt = prompt;
      return JSON.stringify(VERBATIM_VALID);
    });
    await extractQuotes(TRANSCRIPT, {
      guestName: 'Alexandre Boissenot',
      podcastContext: LM_CTX,
    }, { llmFn });
    // Toutes les lignes [N] doivent finir par un segment.text complet
    const blockMatch = capturedPrompt.match(/## TRANSCRIPT SEGMENTÉ.*?\n([\s\S]+?)\n\n## OUTPUT/);
    expect(blockMatch).toBeTruthy();
    const block = blockMatch![1].replace(/\n\[\.\.\..+?\]$/, '');
    const lines = block.split('\n').filter((l) => l.trim().length > 0);
    for (const line of lines) {
      const m = line.match(/^\[(\d+)\] (.+)$/);
      expect(m).toBeTruthy();
      const idx = Number(m![1]);
      expect(TRANSCRIPT.segments[idx].text.trim()).toBe(m![2]);
    }
  });

  it('T7 — Boissenot-style : segment_index valide ET verbatim totalement absent → reject "verbatim not in segment window"', async () => {
    const doubleHallucination = {
      quotes: [
        {
          // Index 1 (segment "Quand j'ai commencé en 2013...") + texte Harry Potter halluciné
          text: "Pokémon, c'est trois fois plus qu'Harry Potter en valorisation totale",
          author: 'Alexandre Boissenot',
          segment_index_start: 1,
          segment_index_end: 1,
          platform_fit: ['twitter'],
          rationale: 'Cas Boissenot Phase 7b — double hallucination plausible.',
        },
      ],
    };
    const result = await extractQuotes(TRANSCRIPT, {
      guestName: 'Alexandre Boissenot',
      podcastContext: LM_CTX,
    }, { llmFn: fixedLlmFn(doubleHallucination) });
    expect(result.quotes).toHaveLength(0);
    expect(result.warnings.some((w) =>
      /rejected:.*verbatim not in segment window/.test(w),
    )).toBe(true);
  });

  it('T8 — snapshot shape Veyrat-style : output public conserve clés/types Phase 7a', async () => {
    const result = await extractQuotes(TRANSCRIPT, {
      guestName: 'Alexandre Boissenot',
      podcastContext: LM_CTX,
    }, { llmFn: fixedLlmFn(VERBATIM_VALID) });
    expect(result.quotes.length).toBeGreaterThan(0);
    for (const q of result.quotes) {
      // Backward-compat Phase 7a : exact set of public keys, types stables
      const keys = Object.keys(q).sort();
      expect(keys).toEqual([
        'author',
        'end_seconds',
        'platform_fit',
        'rationale',
        'start_seconds',
        'text',
      ]);
      expect(typeof q.text).toBe('string');
      expect(typeof q.author).toBe('string');
      expect(typeof q.start_seconds).toBe('number');
      expect(typeof q.end_seconds).toBe('number');
      expect(Array.isArray(q.platform_fit)).toBe(true);
      expect(typeof q.rationale).toBe('string');
      // Aucune clé interne segment_index_* qui leak
      expect(keys).not.toContain('segment_index_start');
      expect(keys).not.toContain('segment_index_end');
    }
  });

  it('T9bis — transcript dépassant le plafond → segment_index hors fenêtre est rejeté (Sonnet ne peut pas inventer un index non montré)', async () => {
    // Construit un transcript de 10 segments dont seuls les 3 premiers
    // tiendront dans un plafond très bas.
    const bigSegments: TranscribedSegment[] = [];
    for (let i = 0; i < 10; i++) {
      bigSegments.push({
        start_seconds: i * 30,
        end_seconds: (i + 1) * 30,
        text: `Segment numero ${i} avec du texte assez long pour remplir un peu la ligne du bloc indexé.`,
      });
    }
    const bigTranscript: TranscriptResult = {
      full_text: bigSegments.map((s) => s.text).join(' '),
      segments: bigSegments,
      duration_seconds: 300,
      cost_usd: 0,
    };

    // On vérifie d'abord que la troncature opère bien : seuls les premiers segments
    // tiennent sous le plafond (~250 chars suffit pour 2-3 lignes max).
    const block = buildSegmentedTranscriptBlock(bigSegments, 250);
    expect(block.truncated).toBe(true);
    expect(block.includedSegmentIndices.size).toBeLessThan(10);
    const maxIncluded = Math.max(...block.includedSegmentIndices);

    // Sonnet (mock) renvoie un index AU-DELÀ de la fenêtre vue.
    // Note : le plafond réel d'extractQuotes (PROMPT_TRANSCRIPT_CHAR_LIMIT = 250k)
    // ne tronque jamais ce petit transcript. On teste donc directement la sémantique
    // de resolveQuoteTimestamps + on confirme que extractQuotes envoie bien la bonne
    // includedSegmentIndices via resolveQuoteTimestamps unitaire (déjà couvert plus haut).
    // Ici : test sémantique strict via resolveQuoteTimestamps avec la fenêtre tronquée.
    const halluc = {
      text: bigSegments[9].text,
      author: 'X',
      segment_index_start: 9,
      segment_index_end: 9,
      platform_fit: ['twitter' as const],
      rationale: 'Sonnet invente un index hors fenêtre tronquée.',
    };
    const resolved = resolveQuoteTimestamps(halluc, bigSegments, block.includedSegmentIndices);
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.reason).toMatch(/outside the prompt window/);
    }
    // Et un index DANS la fenêtre passe (sanity)
    const valid = {
      text: bigSegments[maxIncluded].text,
      author: 'X',
      segment_index_start: maxIncluded,
      segment_index_end: maxIncluded,
      platform_fit: ['twitter' as const],
      rationale: 'Sonnet sélectionne un index montré.',
    };
    const resolvedValid = resolveQuoteTimestamps(valid, bigSegments, block.includedSegmentIndices);
    expect(resolvedValid.ok).toBe(true);
  });
});
