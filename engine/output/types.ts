// engine/output/types.ts — types communs pack/livrables/formatters/channels.
//
// Phase 7a (brief 2026-04-30) : transformation pack pilote Markdown sandbox
// vers formats pro docx/xlsx + architecture V2-ready (multi-format,
// multi-channel, multi-source config).
//
// Règle anti-overgeneralization : chaque champ ici est imposé par le pilote
// Stefani-Orso ET utile à un client podcast futur (Bababam Q3 2026, Sillon
// Daily P2 — cf ROADMAP_INTERNE.md). Pas d'auth, pas de webhooks, pas de
// streaming.

/**
 * Type de livrable. Un pack pilote = 5 livrables (L1..L5). Étendre ce type
 * littéral quand un nouveau livrable est ajouté au pack.
 */
export type LivrableType =
  | 'L1_keyMoments'
  | 'L2_quotes'
  | 'L3_crossRefs'
  | 'L4_newsletter'
  | 'L5_briefAnnexe';

/**
 * Format de sortie cible. 'markdown' existait avant Phase 7a. 'docx' + 'xlsx'
 * ajoutés Phase 7a. 'pdf' est un placeholder V2 (throw NotImplementedError).
 */
export type OutputFormat = 'markdown' | 'docx' | 'xlsx' | 'pdf';

/**
 * MIME types associés par format. Centralisé pour éviter les duplications.
 */
export const MIME_TYPES: Record<OutputFormat, string> = {
  markdown: 'text/markdown; charset=utf-8',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

/**
 * Représentation structurée d'un livrable, indépendante du format de sortie.
 *
 * Phase 7a : les livrables actuels sont stockés en Markdown dans
 * `experiments/.../pack-pilote-stefani-orso/{episode}/0X-*.md`. Un parser
 * (`engine/output/parsers/`) reconstruit ces objets typés depuis le Markdown
 * source pour permettre la transformation vers docx/xlsx sans recourir au
 * pipeline runPack (encore squelettique). Phase V2 : le pipeline runPack
 * produira directement ces objets, sans étape Markdown intermédiaire.
 */
export type Livrable =
  | KeyMomentsLivrable
  | QuotesLivrable
  | CrossRefsLivrable
  | NewsletterLivrable
  | BriefAnnexeLivrable;

export interface BaseLivrable {
  type: LivrableType;
  /** Titre du livrable (ex: "Key moments — GDIY #266 Frédéric Plais"). */
  title: string;
  /** Sous-titre / phrase d'introduction (markdown italique d'origine). */
  subtitle?: string;
  /** Identifiant épisode source (ex: "GDIY #266"). */
  episodeRef: string;
}

export interface KeyMoment {
  numero: number;
  titre: string;
  timestampStart: string; // mm:ss
  timestampEnd: string;   // mm:ss
  saliency: number;        // 0.0–1.0
  quote: string;
  pourquoi: string;
}

export interface KeyMomentsLivrable extends BaseLivrable {
  type: 'L1_keyMoments';
  moments: KeyMoment[];
}

export interface Quote {
  numero: number;
  text: string;
  auteur: string;
  timestamp: string; // mm:ss
  plateformes: string[];
  pourquoi: string;
}

export interface QuotesLivrable extends BaseLivrable {
  type: 'L2_quotes';
  quotes: Quote[];
}

export interface CrossRef {
  episodeNumber: string; // "#299"
  guestName: string;
  episodeTitle: string;
  podcastSource: string; // "Finscale", "GDIY", etc.
  bodyParagraphs: string[];
}

export interface CrossRefsLensSection {
  lensId: string;
  lensIntro: string;
  refs: CrossRef[];
}

export interface CrossRefsLivrable extends BaseLivrable {
  type: 'L3_crossRefs';
  filteringNote?: string;
  sections: CrossRefsLensSection[];
  skippedNote?: string;
}

export interface NewsletterLivrable extends BaseLivrable {
  type: 'L4_newsletter';
  /** Newsletter title (h1 secondaire, ex: "140 millions levés. Zéro bureau."). */
  newsletterTitle: string;
  /** Sections séparées par `---`. Chaque section = liste de paragraphes. */
  sections: string[][];
  footer?: string;
}

export interface BriefAnnexeLivrable extends BaseLivrable {
  type: 'L5_briefAnnexe';
  intro: string;
  /** Sections : titre + paragraphes corps. */
  sections: { heading: string; paragraphs: string[] }[];
  /** Note finale sur lens skippés (gate intelligent). */
  skippedNote?: string;
  footer?: string;
}

/**
 * Pack production complet — un dossier épisode × N livrables.
 */
export interface ProductionPack {
  clientId: string;
  packId: string; // ex: "stefani-orso-pilot"
  generatedAt: string; // ISO-8601
  episodes: ProductionEpisode[];
}

export interface ProductionEpisode {
  /** Slug court pour le dossier (ex: "plais-platform-sh"). */
  slug: string;
  /** Référence affichable (ex: "GDIY #266 Frédéric Plais (Platform.sh)"). */
  displayRef: string;
  livrables: Livrable[];
}

/**
 * Sortie d'un formatter — fichier prêt à être écrit par un OutputChannel.
 */
export interface FormatterOutput {
  /** Nom de fichier final (ex: "01-key-moments.xlsx"). */
  filename: string;
  /** Contenu binaire. Pour markdown, encoder en UTF-8 buffer. */
  buffer: Buffer;
  mimeType: string;
}

/**
 * Contexte injecté dans chaque formatter — branding client + métadonnées.
 */
export interface FormatterContext {
  clientId: string;
  /** Display name du client (ex: "Matthieu Stefani / Orso Media"). */
  clientDisplayName: string;
  /** Date de génération ISO-8601, pour footers. */
  generatedAt: string;
  /** Couleur primaire brand pour styling docx/xlsx (hex sans #). */
  brandPrimary?: string;
}

/**
 * Erreur dédiée pour signaler les formats V2 non encore implémentés.
 * Throw par pdfFormatter et driveChannel.
 */
export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotImplementedError';
  }
}
