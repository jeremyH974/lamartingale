/**
 * Shared types for primitives layer (engine/primitives/*).
 *
 * Discipline anti-overgeneralization (cap 4 du brief) :
 * - On ne place ici que les types CONSOMMÉS par 2+ primitives ACTUELLES.
 * - Les types mono-consommateur restent inline dans leur primitive.
 *
 * Cas présents (consommateurs effectifs) :
 *   PodcastContext  → extractKeyMoments, extractQuotes, lensClassificationAgent
 *   LLMFn           → extractKeyMoments, extractQuotes, crossReferenceEpisode,
 *                     lensClassificationAgent
 */

/**
 * Métadonnées de cadrage éditorial du podcast source.
 * Injecté par le caller (typiquement le pipeline runPack qui charge la config
 * client + le tenant_id de l'épisode source).
 */
export interface PodcastContext {
  podcast_id: string; // tenant_id, ex: 'gdiy', 'lamartingale'
  podcast_name: string; // ex: 'GDIY', 'La Martingale'
  editorial_focus: string; // ex: 'entrepreneuriat tech B2B', 'finance personnelle'
  host_name?: string;
}

/**
 * Signature LLM injectable. Match volontairement le contrat de
 * engine/agents/guestBriefAgent.ts pour cohérence cross-niveaux.
 *
 * En prod : factory qui binde getLLM() / getLLMFast() (engine/ai/llm.ts).
 * En tests : mock direct.
 */
export type LLMFn = (
  prompt: string,
  options?: { maxTokens?: number; temperature?: number },
) => Promise<string | unknown>;

/**
 * Helper : extraire un objet JSON valide d'une réponse LLM, en strippant les
 * fences markdown ```json...``` que Sonnet ajoute parfois malgré l'instruction
 * "no markdown wrapping".
 *
 * Repris du pattern guestBriefAgent — préfère factoriser dès qu'utilisé par 2+
 * primitives (cap 4 anti-overgeneralization respecté : 4 primitives Phase 1
 * + lensClassificationAgent Phase 3 utiliseront cette fonction).
 */
export function stripJsonFences(raw: string): string {
  const trimmed = raw.trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first === -1 || last === -1 || last < first) return trimmed;
  return trimmed.slice(first, last + 1);
}

export function parseLLMJsonResponse(raw: string | unknown, primitiveName: string): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(stripJsonFences(raw));
  } catch {
    throw new Error(
      `${primitiveName}: LLM response is not valid JSON. Snippet: ${raw.slice(0, 200)}`,
    );
  }
}
