/**
 * Source selection cascade for an episode.
 *
 * Picks the richest available content field for LLM consumption, with a
 * priority order designed to be easily extended (notably to plug a future
 * audio transcript without touching agent code).
 *
 * Cascade actuelle (post-MEDIUM-3) :
 *   article_content (priority 80, minLength 500)
 *   → chapters_takeaways (priority 50, minLength 200) — concat des
 *     `chapters[].title` et `key_takeaways[]`
 *   → rss_description (priority 10, minLength 100) — fallback ultime
 *
 * Quality score = priority / 100 (range 0..1). Remonté à l'agent pour
 * traçabilité (faible score = matière LLM moins fiable).
 *
 * Si aucune source ne dépasse son minLength, on retombe sur rss_description
 * (même si vide) avec score 0.1. C'est au wrapper d'invocation (cf
 * persistGuestBrief) de filtrer ce cas si besoin — sourceSelector reste pur.
 */

export type SourceType =
  | 'transcript'
  | 'article_content'
  | 'chapters_takeaways'
  | 'rss_description';

export interface SourceQuality {
  type: SourceType;
  priority: number;
  minLength: number;
}

const SOURCE_PRIORITIES: SourceQuality[] = [
  // FUTURE — décommenter quand le pipeline transcript audio arrivera.
  // Aucune autre modification nécessaire dans agent ou wrapper.
  // { type: 'transcript', priority: 100, minLength: 5000 },

  { type: 'article_content', priority: 80, minLength: 500 },
  { type: 'chapters_takeaways', priority: 50, minLength: 200 },
  { type: 'rss_description', priority: 10, minLength: 100 },
];

/**
 * Forme minimale d'un épisode pour le sourceSelector.
 *
 * Pas de dépendance au schema Drizzle complet — on isole les champs réellement
 * lus, ce qui évite de propager le bruit du schema dans les tests.
 *
 * `chapters` : array d'objets `{ order, title, timestamp_seconds? }` (pas de
 * `summary` en BDD actuellement, mais on l'accepte futur-proof).
 *
 * `key_takeaways` : array de strings ou null (jsonb DB).
 */
export interface SourceEpisode {
  article_content?: string | null;
  chapters?: Array<{ title?: string; summary?: string }> | null;
  key_takeaways?: string[] | null;
  rss_description?: string | null;
}

export interface SelectedSource {
  type: SourceType;
  content: string;
  qualityScore: number;
}

export function extractContent(episode: SourceEpisode, type: SourceType): string {
  switch (type) {
    case 'transcript':
      // Champ pas encore en BDD. Renvoie '' pour rester inerte tant que la
      // priorité reste désactivée dans SOURCE_PRIORITIES.
      return '';
    case 'article_content':
      return episode.article_content?.trim() ?? '';
    case 'chapters_takeaways': {
      const chaptersText = (episode.chapters ?? [])
        .map((c) => {
          const t = c.title?.trim() ?? '';
          const s = c.summary?.trim() ?? '';
          return s ? `${t}: ${s}` : t;
        })
        .filter(Boolean)
        .join('\n');
      const takeawaysText = (episode.key_takeaways ?? [])
        .map((t) => t?.trim?.() ?? '')
        .filter(Boolean)
        .join('\n');
      return [chaptersText, takeawaysText].filter(Boolean).join('\n\n');
    }
    case 'rss_description':
      return episode.rss_description?.trim() ?? '';
  }
}

export function selectBestSource(episode: SourceEpisode): SelectedSource {
  for (const candidate of SOURCE_PRIORITIES) {
    const content = extractContent(episode, candidate.type);
    if (content.length >= candidate.minLength) {
      return {
        type: candidate.type,
        content,
        qualityScore: candidate.priority / 100,
      };
    }
  }
  // Fallback ultime : rss_description (potentiellement vide). Le wrapper
  // décide s'il filtre ou non.
  return {
    type: 'rss_description',
    content: extractContent(episode, 'rss_description'),
    qualityScore: 0.1,
  };
}
