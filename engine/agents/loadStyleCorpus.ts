/**
 * loadStyleCorpus — charge les fichiers .md du corpus de style depuis
 * data/style-corpus/<host-slug>/ pour few-shot injection L3/L4/L5.
 *
 * Phase 5 V4 (refonte 2026-04-30) Change 1.
 *
 * - Pure : pas d'accès DB. Lecture fichiers locaux uniquement.
 * - Sélection : prend N newsletters parmi `style_corpus.newsletters` filtrées
 *   par pattern_tags si fourni, sinon N premières.
 * - Truncation defensive : chaque newsletter limitée à `maxCharsPerNewsletter`
 *   (défaut 6000c) pour ne pas exploser le contexte prompt.
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import type {
  ClientStyleCorpus,
  ClientStyleCorpusNewsletter,
} from '../types/client-config';

const DEFAULT_CORPUS_ROOT = join(process.cwd(), 'data', 'style-corpus');
const DEFAULT_MAX_CHARS_PER_NEWSLETTER = 6000;

export interface LoadedNewsletter extends ClientStyleCorpusNewsletter {
  body: string;
  truncated: boolean;
}

export interface LoadStyleCorpusOptions {
  corpus: ClientStyleCorpus;
  /** slug sous-dossier (ex: 'stefani'). Default: derive from canonical_phrase. */
  hostSlug: string;
  /** Combien de newsletters charger (défaut 3). */
  count?: number;
  /** Pattern tags pour filtrer (OR logique). Si vide, pas de filtre. */
  preferredTags?: string[];
  /** Override path. Default: data/style-corpus. */
  corpusRoot?: string;
  /** Cap chars par newsletter (défaut 6000). */
  maxCharsPerNewsletter?: number;
}

export async function loadStyleCorpusNewsletters(
  options: LoadStyleCorpusOptions,
): Promise<LoadedNewsletter[]> {
  const {
    corpus,
    hostSlug,
    count = 3,
    preferredTags = [],
    corpusRoot = DEFAULT_CORPUS_ROOT,
    maxCharsPerNewsletter = DEFAULT_MAX_CHARS_PER_NEWSLETTER,
  } = options;

  if (!corpus?.newsletters || corpus.newsletters.length === 0) {
    return [];
  }

  // Sélection : si preferredTags fournis, scorer par nb tags qui matchent ;
  // sinon ordre déclaratif (les premières du corpus).
  const ranked = preferredTags.length > 0
    ? [...corpus.newsletters]
        .map((n) => ({
          n,
          score: n.pattern_tags.filter((t) => preferredTags.includes(t)).length,
        }))
        .sort((a, b) => b.score - a.score)
        .map((x) => x.n)
    : [...corpus.newsletters];

  const selected = ranked.slice(0, count);
  const out: LoadedNewsletter[] = [];

  for (const meta of selected) {
    const filePath = join(corpusRoot, hostSlug, `${meta.id}.md`);
    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf-8');
    } catch (err) {
      // Fichier manquant : on saute silencieusement (signalé par l'absence
      // dans le résultat). Pas d'erreur fatale pour permettre le pilote
      // même si un fichier est en cours de rédaction.
      continue;
    }
    const truncated = raw.length > maxCharsPerNewsletter;
    out.push({
      ...meta,
      body: truncated
        ? raw.slice(0, maxCharsPerNewsletter) + '\n\n[... extrait tronqué]'
        : raw,
      truncated,
    });
  }

  return out;
}

/**
 * Sérialise les newsletters chargées en bloc prompt few-shot.
 */
export function buildFewShotBlock(newsletters: LoadedNewsletter[]): string {
  if (newsletters.length === 0) return '';
  const blocks = newsletters.map((n, i) => {
    return `### EXEMPLE ${i + 1} — ${n.title} (${n.date})
[pattern: ${n.pattern_tags.join(', ')}]

${n.body}`;
  });
  return `## EXEMPLES RÉELS DU HOST (few-shot — imite le pattern, pas le contenu)

${blocks.join('\n\n---\n\n')}`;
}

/**
 * Détecte si une phrase blacklist host apparaît dans le texte produit.
 * Match case-insensitive substring.
 */
export function detectHostBlacklistMatches(
  text: string,
  blacklist: string[],
): string[] {
  const lower = text.toLowerCase();
  return blacklist.filter((p) => lower.includes(p.toLowerCase()));
}

/**
 * Détecte si une mention écosystème (canonical OR alternative) apparaît.
 */
export function detectEcosystemMention(
  text: string,
  ref: ClientStyleCorpus['ecosystem_reference'],
): boolean {
  const lower = text.toLowerCase();
  const candidates = [ref.canonical_phrase, ...ref.alternatives];
  return candidates.some((c) => lower.includes(c.toLowerCase()));
}
