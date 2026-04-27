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
 * @see docs/brief-primitives-2026-04-28.md (Phase 1.3)
 */

import { z } from 'zod';
import type { TranscriptResult } from './transcribeAudio';
import type { LLMFn, PodcastContext } from './types';
import { parseLLMJsonResponse } from './types';

const DEFAULT_MAX_QUOTES = 5;
const PROMPT_TRANSCRIPT_CHAR_LIMIT = 50_000;
const TWITTER_CHAR_LIMIT = 280;

export const QuotePlatformSchema = z.enum(['twitter', 'linkedin', 'instagram']);
export type QuotePlatform = z.infer<typeof QuotePlatformSchema>;

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

export function buildPrompt(
  transcript: TranscriptResult,
  options: ExtractQuotesOptions,
): string {
  const { guestName, hostName, podcastContext, maxQuotes = DEFAULT_MAX_QUOTES } = options;
  const truncated =
    transcript.full_text.length > PROMPT_TRANSCRIPT_CHAR_LIMIT
      ? transcript.full_text.slice(0, PROMPT_TRANSCRIPT_CHAR_LIMIT) +
        '\n[... transcript tronqué pour limites tokens]'
      : transcript.full_text;

  return `Tu es éditeur expert en podcast français. Tu identifies les meilleures citations VERBATIM d'une interview, prêtes à être postées sur réseaux sociaux.

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
6. start_seconds / end_seconds = bornes du segment transcript où la quote apparaît.
7. platform_fit ⊂ {"twitter", "linkedin", "instagram"} — au moins 1 plateforme.
8. rationale (10-500 chars) explique pourquoi cette citation est saillante éditorialement.

## TRANSCRIPT (verbatim source)
${truncated}

## OUTPUT
Réponds UNIQUEMENT en JSON strict (pas de markdown wrapping, pas de préambule) :
{
  "quotes": [
    {
      "text": "Citation verbatim copiée du transcript.",
      "author": "${guestName}",
      "start_seconds": 120,
      "end_seconds": 130,
      "platform_fit": ["twitter", "linkedin"],
      "rationale": "Pourquoi cette citation est saillante."
    }
  ]
}`;
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
  const maxQuotes = options.maxQuotes ?? DEFAULT_MAX_QUOTES;
  const allowedAuthors = new Set(
    [options.guestName, options.hostName].filter(
      (n): n is string => typeof n === 'string' && n.trim().length > 0,
    ),
  );

  const prompt = buildPrompt(transcript, options);
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
    let validated: Quote;
    try {
      validated = QuoteSchema.parse(candidate);
    } catch (err) {
      warnings.push(
        `quote[${i}] failed zod validation: ${(err as Error).message.slice(0, 200)}`,
      );
      continue;
    }

    if (!allowedAuthors.has(validated.author)) {
      warnings.push(
        `quote[${i}] rejected: author "${validated.author}" not in allowed set [${[...allowedAuthors].join(', ')}]`,
      );
      continue;
    }

    if (!isVerbatim(validated.text, transcript.full_text)) {
      warnings.push(
        `quote[${i}] rejected: text not verbatim in transcript (paraphrase or hallucination)`,
      );
      continue;
    }

    // V2 FIX 5 (F-P5-2) : reject host-blacklisted phrases (e.g. Stefani's
    // signature "Nous sommes la moyenne des personnes…") — even though
    // verbatim guard passes, attribution is structurally ambiguous
    // without speaker labels.
    if (options.hostBlacklistPhrases && options.hostBlacklistPhrases.length > 0) {
      const normQuote = normalizeForVerbatim(validated.text);
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
    let platforms = validated.platform_fit;
    if (validated.text.length > TWITTER_CHAR_LIMIT && platforms.includes('twitter')) {
      platforms = platforms.filter((p) => p !== 'twitter');
      warnings.push(
        `quote[${i}] auto-fix: removed 'twitter' from platform_fit (text ${validated.text.length} chars > ${TWITTER_CHAR_LIMIT})`,
      );
      if (platforms.length === 0) {
        warnings.push(
          `quote[${i}] rejected: platform_fit empty after twitter auto-fix and text > 280 chars`,
        );
        continue;
      }
    }

    accepted.push({ ...validated, platform_fit: platforms });
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
