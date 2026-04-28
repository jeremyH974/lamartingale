/**
 * extractQuotes — Primitive : 5 quotes prêtes pour réseaux sociaux.
 *
 * Discipline (cf. brief-primitives-2026-04-28.md, Phase 1.3) :
 * - Pure : pas d'accès DB, pas d'env, LLM injecté.
 * - Verbatim strict : chaque quote est validée contre transcript.full_text via
 *   normalisation (accents, ponctuation, casse, espaces). Si non-verbatim,
 *   quote REJETÉE (pas warning seulement — c'est un cap qualité 7+/10 sur
 *   un finding critique : Sonnet paraphrase si on ne le contraint pas).
 * - platform_fit auto-cohérent : on retire 'twitter' si quote > 280 chars
 *   (limite tweet) plutôt que rejeter — la quote est valide, juste son
 *   placement plateforme l'est moins.
 *
 * Phase 8 (28/04/26) — Fix timestamps L2 (audit Phase 7b : 21% OK pré-fix) :
 * - Le LLM ne reçoit plus `full_text` mais un bloc segmenté `[N] text` où
 *   N est l'index du segment Whisper. Aucune info temporelle (MM:SS) dans
 *   le prompt → impossible pour Sonnet de "raisonner à la louche temporelle"
 *   (origine du bug).
 * - L'agent retourne `segment_index_start` / `segment_index_end` (sélection
 *   d'index existants) au lieu de `start_seconds` / `end_seconds` (calcul
 *   halluciné). Le pipeline résout ces index → timestamps Whisper réels.
 * - Validation post-extraction : verbatim doit apparaître dans la fenêtre
 *   du segment annoncé ±10s (absorbe les chevauchements Whisper).
 * - Le PROMPT_TRANSCRIPT_CHAR_LIMIT passe de 50_000 à 250_000 pour couvrir
 *   intégralement les épisodes longs (Plais GDIY 188 min = 233k chars
 *   indexés). Au passage : règle le bug historique de truncation 76% sur
 *   Plais qui causait les hallucinations cluster-debut.
 * - Output public inchangé : `{ text, author, start_seconds, end_seconds,
 *   platform_fit, rationale }` — backward-compat Phase 7a/Phase 6.
 *
 * @see docs/brief-primitives-2026-04-28.md (Phase 1.3)
 * @see docs/brief-phase8-extractquotes-fix-2026-04-28.md (Phase 8)
 * @see docs/DETTE.md ("Phase 7b audit timestamps L2")
 */

import { z } from 'zod';
import type { TranscribedSegment, TranscriptResult } from './transcribeAudio';
import type { LLMFn, PodcastContext } from './types';
import { parseLLMJsonResponse } from './types';

const DEFAULT_MAX_QUOTES = 5;
const PROMPT_TRANSCRIPT_CHAR_LIMIT = 250_000;
const TWITTER_CHAR_LIMIT = 280;
const VERBATIM_WINDOW_SECONDS = 10;

export const QuotePlatformSchema = z.enum(['twitter', 'linkedin', 'instagram']);
export type QuotePlatform = z.infer<typeof QuotePlatformSchema>;

/**
 * Schéma INTERNE — ce que le LLM retourne. Sonnet sélectionne 2 indices de
 * segments existants ; aucun calcul de seconds.
 */
export const RawQuoteSchema = z
  .object({
    text: z.string().min(1).max(1000),
    author: z.string().min(1),
    segment_index_start: z.number().int().nonnegative(),
    segment_index_end: z.number().int().nonnegative(),
    platform_fit: z.array(QuotePlatformSchema).min(1),
    rationale: z.string().min(10).max(500),
  })
  .refine((q) => q.segment_index_end >= q.segment_index_start, {
    message: 'segment_index_end must be >= segment_index_start',
    path: ['segment_index_end'],
  });

export type RawQuote = z.infer<typeof RawQuoteSchema>;

/**
 * Schéma PUBLIC — output backward-compatible avec Phase 6 / Phase 7a.
 * Les `start_seconds` / `end_seconds` sont DÉRIVÉS du lookup segments,
 * pas inventés par le LLM.
 */
export const QuoteSchema = z
  .object({
    text: z.string().min(1).max(1000),
    author: z.string().min(1),
    start_seconds: z.number().nonnegative(),
    end_seconds: z.number().nonnegative(),
    platform_fit: z.array(QuotePlatformSchema).min(1),
    rationale: z.string().min(10).max(500),
  })
  .refine((q) => q.end_seconds >= q.start_seconds, {
    message: 'end_seconds must be >= start_seconds',
    path: ['end_seconds'],
  });

export type Quote = z.infer<typeof QuoteSchema>;

export interface ExtractQuotesOptions {
  guestName: string;
  hostName?: string;
  podcastContext: PodcastContext;
  maxQuotes?: number;
  /**
   * Phrases-fétiches du host à rejeter automatiquement (substring match
   * normalisé) même si verbatim guard passe. Mitigation pilote du gap
   * diarization Whisper. Cf. ClientToneProfile.host_blacklist_phrases.
   */
  hostBlacklistPhrases?: string[];
}

export interface ExtractQuotesConfig {
  llmFn: LLMFn;
}

export interface ExtractQuotesResult {
  quotes: Quote[];
  warnings: string[];
}

/**
 * Normalise un texte pour la comparaison verbatim :
 * - lowercase
 * - retrait accents (NFD + diacritiques)
 * - retrait ponctuation
 * - collapse whitespace
 *
 * Permet à Sonnet de retourner « C'est une idéologie. » et de matcher
 * un transcript contenant « c'est une idéologie » sans casser sur les
 * apostrophes/casse/accents.
 */
export function normalizeForVerbatim(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isVerbatim(quoteText: string, transcriptText: string): boolean {
  const normQuote = normalizeForVerbatim(quoteText);
  const normTranscript = normalizeForVerbatim(transcriptText);
  if (normQuote.length < 3) return false;
  return normTranscript.includes(normQuote);
}

/**
 * Construit le bloc transcript indexé `[N] text` à transmettre au LLM.
 * Truncation par segments ENTIERS (jamais mid-text) pour éviter les verbatims
 * orphelins coupés en deux. Format intentionnellement SANS timestamps : le
 * LLM doit sélectionner un index, pas raisonner sur du temps.
 *
 * @returns block (string à insérer dans le prompt) et includedSegmentIndices
 *          (set des index acceptables pour la validation post-LLM — Sonnet
 *          ne peut pas légitimement référencer un index hors de cette fenêtre).
 */
export function buildSegmentedTranscriptBlock(
  segments: TranscribedSegment[],
  maxChars: number,
): { block: string; includedSegmentIndices: Set<number>; truncated: boolean } {
  const lines: string[] = [];
  const includedSegmentIndices = new Set<number>();
  let totalChars = 0;
  let truncated = false;

  for (let i = 0; i < segments.length; i++) {
    const line = `[${i}] ${segments[i].text.trim()}`;
    const candidateLength = totalChars + line.length + 1; // +1 for newline
    if (candidateLength > maxChars) {
      truncated = true;
      break;
    }
    lines.push(line);
    includedSegmentIndices.add(i);
    totalChars = candidateLength;
  }

  return { block: lines.join('\n'), includedSegmentIndices, truncated };
}

export function buildPrompt(
  transcript: TranscriptResult,
  options: ExtractQuotesOptions,
): { prompt: string; includedSegmentIndices: Set<number>; truncated: boolean } {
  const { guestName, hostName, podcastContext, maxQuotes = DEFAULT_MAX_QUOTES } = options;
  const { block, includedSegmentIndices, truncated } = buildSegmentedTranscriptBlock(
    transcript.segments,
    PROMPT_TRANSCRIPT_CHAR_LIMIT,
  );

  const truncatedNote = truncated
    ? '\n[... transcript tronqué pour limites tokens — ne référence PAS de segments au-delà de l\'index max ci-dessus]'
    : '';

  const prompt = `Tu es éditeur expert en podcast français. Tu identifies les meilleures citations VERBATIM d'une interview, prêtes à être postées sur réseaux sociaux.

## CONTEXTE
Podcast : ${podcastContext.podcast_name} (${podcastContext.editorial_focus})
${hostName ? `Animateur : ${hostName}\n` : ''}Invité : ${guestName}

## ATTRIBUTION HOST/INVITÉ — RÈGLE CRITIQUE
Le transcript Whisper ne contient PAS de speaker labels. ${hostName ? `Le host ${hostName} ouvre généralement l'épisode et pose les questions ; les passages affirmatifs longs sont généralement de l'invité ${guestName}.` : ''}

RÈGLE STRICTE (Phase 5 V2 fix F-P5-2) :
- Si une quote contient des marqueurs de PREMIÈRE PERSONNE PLURIELLE ("nous sommes", "on a fait", "notre approche", "nous avons") sans qu'il soit ABSOLUMENT clair par le contexte qu'elle vient de ${guestName}, EXCLUS-la.
- Si une quote ressemble à une question d'interviewer ("est-ce que tu…", "tu peux nous dire…", "donc en fait…"), EXCLUS-la (c'est probablement le host).
- Si une quote est une PHRASE-FÉTICHE connue du host (ex: "Nous sommes la moyenne des personnes que nous fréquentons" est une phrase-fétiche de Matthieu Stefani), EXCLUS-la même si elle apparaît verbatim dans le transcript — elle vient du host pas de l'invité.

## CONSIGNES STRICTES (NON NÉGOCIABLES)
1. Sélectionne jusqu'à ${maxQuotes} citations.
2. Chaque "text" DOIT être VERBATIM du transcript fourni — copie/colle, pas de paraphrase, pas de reformulation, pas de "lissage" même mineur.
3. Si tu ne trouves pas ${maxQuotes} citations vraiment verbatim, retourne MOINS. Mieux 3 verbatims que 5 paraphrases.
4. "author" DOIT être strictement "${guestName}" (texte exact). Si tu n'es pas sûr que la phrase vient de ${guestName}, EXCLUS-la.
5. Idéal text < 280 chars (compatible Twitter). Au-delà, tu peux retourner mais "platform_fit" doit refléter la limite (pas de "twitter" si > 280 chars).
6. Pour chaque quote, indique "segment_index_start" et "segment_index_end" : les NUMÉROS DE SEGMENTS (entre crochets dans le transcript ci-dessous) qui contiennent le verbatim. Si la quote tient dans un seul segment, start = end. Si la quote chevauche 2-3 segments, start = premier segment du verbatim, end = dernier. NE CALCULE JAMAIS de timestamp en secondes — sélectionne des indices de segments existants.
7. platform_fit ⊂ {"twitter", "linkedin", "instagram"} — au moins 1 plateforme.
8. rationale (10-500 chars) explique pourquoi cette citation est saillante éditorialement.
9. Sélectionne les quotes en couvrant la durée complète de l'épisode. Évite de clusteriser au début ou à la fin.

## TRANSCRIPT SEGMENTÉ (chaque ligne = un segment indexable)
${block}${truncatedNote}

## OUTPUT
Réponds UNIQUEMENT en JSON strict (pas de markdown wrapping, pas de préambule) :
{
  "quotes": [
    {
      "text": "Citation verbatim copiée du transcript.",
      "author": "${guestName}",
      "segment_index_start": 42,
      "segment_index_end": 43,
      "platform_fit": ["twitter", "linkedin"],
      "rationale": "Pourquoi cette citation est saillante."
    }
  ]
}`;

  return { prompt, includedSegmentIndices, truncated };
}

/**
 * Résout un RawQuote (avec segment_index_start/end) en timestamps Whisper
 * réels + valide que le verbatim est trouvable dans la fenêtre annoncée
 * ±VERBATIM_WINDOW_SECONDS.
 *
 * Pure : aucun side-effect. Permet test isolé du contrat de validation.
 */
export function resolveQuoteTimestamps(
  rawQuote: RawQuote,
  segments: TranscribedSegment[],
  includedSegmentIndices: Set<number>,
):
  | { ok: true; start_seconds: number; end_seconds: number }
  | { ok: false; reason: string } {
  const { segment_index_start: idxStart, segment_index_end: idxEnd, text } = rawQuote;

  if (idxStart >= segments.length || idxEnd >= segments.length) {
    return {
      ok: false,
      reason: `segment_index out of bounds (start=${idxStart}, end=${idxEnd}, max=${segments.length - 1})`,
    };
  }

  if (!includedSegmentIndices.has(idxStart) || !includedSegmentIndices.has(idxEnd)) {
    return {
      ok: false,
      reason: `segment_index outside the prompt window (start=${idxStart}, end=${idxEnd}) — likely hallucination`,
    };
  }

  const segStart = segments[idxStart];
  const segEnd = segments[idxEnd];

  // Fenêtre étendue ±VERBATIM_WINDOW_SECONDS pour absorber les chevauchements
  // Whisper aux frontières de segments.
  const windowStart = segStart.start_seconds - VERBATIM_WINDOW_SECONDS;
  const windowEnd = segEnd.end_seconds + VERBATIM_WINDOW_SECONDS;

  const windowSegments = segments.filter(
    (s) => s.end_seconds >= windowStart && s.start_seconds <= windowEnd,
  );
  const concatText = windowSegments.map((s) => s.text).join(' ');

  if (!isVerbatim(text, concatText)) {
    return {
      ok: false,
      reason: 'verbatim not in segment window',
    };
  }

  return {
    ok: true,
    start_seconds: segStart.start_seconds,
    end_seconds: segEnd.end_seconds,
  };
}

export async function extractQuotes(
  transcript: TranscriptResult,
  options: ExtractQuotesOptions,
  config: ExtractQuotesConfig,
): Promise<ExtractQuotesResult> {
  if (!options.guestName?.trim()) {
    throw new Error('extractQuotes: guestName is required');
  }
  if (!transcript.full_text?.trim()) {
    throw new Error('extractQuotes: transcript.full_text is empty');
  }
  if (!transcript.segments || transcript.segments.length === 0) {
    throw new Error('extractQuotes: transcript.segments is empty (Phase 8 requires segmented transcript)');
  }
  const maxQuotes = options.maxQuotes ?? DEFAULT_MAX_QUOTES;
  const allowedAuthors = new Set(
    [options.guestName, options.hostName].filter(
      (n): n is string => typeof n === 'string' && n.trim().length > 0,
    ),
  );

  const { prompt, includedSegmentIndices } = buildPrompt(transcript, options);
  const raw = await config.llmFn(prompt, { temperature: 0.3 });
  const parsed = parseLLMJsonResponse(raw, 'extractQuotes');

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('extractQuotes: LLM output is not an object');
  }
  const obj = parsed as { quotes?: unknown };
  if (!Array.isArray(obj.quotes)) {
    throw new Error('extractQuotes: quotes[] missing or not an array');
  }

  const warnings: string[] = [];
  const accepted: Quote[] = [];

  for (let i = 0; i < obj.quotes.length; i++) {
    const candidate = obj.quotes[i];
    let rawQuote: RawQuote;
    try {
      rawQuote = RawQuoteSchema.parse(candidate);
    } catch (err) {
      warnings.push(
        `quote[${i}] failed zod validation: ${(err as Error).message.slice(0, 200)}`,
      );
      continue;
    }

    if (!allowedAuthors.has(rawQuote.author)) {
      warnings.push(
        `quote[${i}] rejected: author "${rawQuote.author}" not in allowed set [${[...allowedAuthors].join(', ')}]`,
      );
      continue;
    }

    const resolved = resolveQuoteTimestamps(rawQuote, transcript.segments, includedSegmentIndices);
    if (!resolved.ok) {
      warnings.push(`quote[${i}] rejected: ${resolved.reason}`);
      continue;
    }

    // V2 FIX 5 (F-P5-2) : reject host-blacklisted phrases (e.g. Stefani's
    // signature "Nous sommes la moyenne des personnes…") — even though
    // verbatim guard passes, attribution is structurally ambiguous
    // without speaker labels.
    if (options.hostBlacklistPhrases && options.hostBlacklistPhrases.length > 0) {
      const normQuote = normalizeForVerbatim(rawQuote.text);
      const matchedHostPhrase = options.hostBlacklistPhrases.find((phrase) =>
        normQuote.includes(normalizeForVerbatim(phrase)),
      );
      if (matchedHostPhrase) {
        warnings.push(
          `quote[${i}] rejected: text contains host-blacklisted phrase "${matchedHostPhrase.slice(0, 60)}..." (likely attributed to host, not guest)`,
        );
        continue;
      }
    }

    // Auto-fix platform_fit incoherent: remove 'twitter' if text > 280 chars.
    let platforms = rawQuote.platform_fit;
    if (rawQuote.text.length > TWITTER_CHAR_LIMIT && platforms.includes('twitter')) {
      platforms = platforms.filter((p) => p !== 'twitter');
      warnings.push(
        `quote[${i}] auto-fix: removed 'twitter' from platform_fit (text ${rawQuote.text.length} chars > ${TWITTER_CHAR_LIMIT})`,
      );
      if (platforms.length === 0) {
        warnings.push(
          `quote[${i}] rejected: platform_fit empty after twitter auto-fix and text > 280 chars`,
        );
        continue;
      }
    }

    const publicQuote: Quote = {
      text: rawQuote.text,
      author: rawQuote.author,
      start_seconds: resolved.start_seconds,
      end_seconds: resolved.end_seconds,
      platform_fit: platforms,
      rationale: rawQuote.rationale,
    };
    accepted.push(publicQuote);
  }

  let quotes = accepted;
  if (quotes.length > maxQuotes) {
    quotes = quotes.slice(0, maxQuotes);
    warnings.push(
      `Truncated to top ${maxQuotes} quotes (received ${accepted.length} accepted)`,
    );
  } else if (quotes.length < maxQuotes) {
    warnings.push(
      `Returned ${quotes.length} quotes (expected ${maxQuotes})`,
    );
  }

  return { quotes, warnings };
}
