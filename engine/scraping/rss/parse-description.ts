/**
 * Parse RSS description blocks — extrait les blocs structurés des descriptions
 * RSS ("Le sujet", "Découvrez", "Références", "Avantages", timestamps, YouTube,
 * cross-promo). Config-aware : adapte les patterns selon le tenant (LM vs GDIY).
 *
 * Contrat : fonction pure, jamais d'I/O, retourne null/[] en cas de doute.
 */
import { htmlToText } from './extractors';

export interface ParsedReference {
  label: string;
  url?: string;
}

export interface ParsedCrossEpisode {
  number: number;
  title?: string;
}

export interface ParsedPromo {
  code?: string;
  partner?: string;
  url?: string;
  description?: string;
}

export interface ParsedChapter {
  title: string;
  timestamp_seconds: number;
  order: number;
}

export interface ParsedDescription {
  topic: string | null;
  guestIntro: string | null;
  discover: string[];
  references: ParsedReference[];
  crossEpisodes: ParsedCrossEpisode[];
  promo: ParsedPromo | null;
  chapters: ParsedChapter[];
  youtubeUrl: string | null;
  crossPromo: string | null;
}

export const EMPTY_PARSED: ParsedDescription = {
  topic: null,
  guestIntro: null,
  discover: [],
  references: [],
  crossEpisodes: [],
  promo: null,
  chapters: [],
  youtubeUrl: null,
  crossPromo: null,
};

// ============================================================================
// Helpers
// ============================================================================

function hmsToSeconds(hms: string): number | null {
  const parts = hms.trim().split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

function cleanText(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

// Normalise les retours à la ligne, préserve la structure pour regex multi-ligne.
// Avant htmlToText : convertit <li> en "\n- " pour préserver les bullets.
function normalize(description: string): string {
  let pre = description;
  if (/<[a-z]/i.test(pre)) {
    // Injecte un bullet visible pour chaque <li> avant de passer à htmlToText.
    pre = pre
      .replace(/<li[^>]*>/gi, '\n- ')
      .replace(/<\/li>/gi, '\n')
      .replace(/<\/?(?:ul|ol)[^>]*>/gi, '\n');
    pre = htmlToText(pre);
  }
  return pre
    .replace(/\r\n/g, '\n')
    .replace(/\u00A0/g, ' ')
    // Normalise les apostrophes Unicode (’ U+2019, ‘ U+2018) vers ASCII '
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

// ============================================================================
// Block boundaries — liste ordonnée des headers qui terminent un bloc.
// ============================================================================
const BLOCK_HEADERS = [
  /Le\s+sujet\s*:/i,
  /L'?\s*invit[ée]e?s?\s+du\s+jour\s*:/i,
  /Les\s+invit[ée]e?s\s*:/i,
  /Au\s+micro\s*:/i,
  /D[ée]couvrez\s*:/i,
  /Au\s+programme\s*:/i,
  /Dans\s+cet\s+[ée]pisode\s*:/i,
  /Ils?\s+citent\s+les\s+r[ée]f[ée]rences\s+suivantes\s*:/i,
  /R[ée]f[ée]rences?\s*:/i,
  /Ressources\s*:/i,
  /Ainsi\s+que\s+d'anciens\s+[ée]pisodes/i,
  /Les\s+anciens\s+[ée]pisodes\s+de\s+\w+\s+mentionn[ée]s/i,
  /Avantages?\s*:/i,
  /Bonne\s+nouvelle\s*!/i,
  /Chapitres\s*:/i,
  /TIMELINE\s*:/i,
  /H[ée]berg[ée]\s+par/i,
  /Voir\s+l'?\s*acast\.com/i,
  // Terminators génériques (fin du contenu éditorial LM)
  /On\s+vous\s+souhaite/i,
  /Merci\s+(?:à|a)\s+(?:notre|nos)\s+partenaire/i,
  /[A-ZÀ-Ý][\w'\s-]+\s+est\s+un\s+podcast\s+du\s+label/i,
  /Pour\s+(?:s'abonner|vous\s+abonner)\s+(?:à|a)\s+la\s+newsletter/i,
  /La\s+libre\s+antenne/i,
];

function captureBlock(text: string, startRx: RegExp): string | null {
  const m = text.match(startRx);
  if (!m || m.index === undefined) return null;
  const from = m.index + m[0].length;
  let end = text.length;
  for (const h of BLOCK_HEADERS) {
    if (h.source === startRx.source) continue;
    const rest = text.slice(from);
    const mm = rest.match(h);
    if (mm && mm.index !== undefined) {
      end = Math.min(end, from + mm.index);
    }
  }
  return text.slice(from, end).trim();
}

// ============================================================================
// Extractors
// ============================================================================

function extractTopic(text: string): string | null {
  const block = captureBlock(text, /Le\s+sujet\s*:/i);
  if (!block) return null;
  const cleaned = cleanText(block);
  return cleaned.length > 10 ? cleaned : null;
}

function extractGuestIntro(text: string): string | null {
  const block =
    captureBlock(text, /L[e']?\s*invit[ée]e?s?\s+du\s+jour\s*:/i) ||
    captureBlock(text, /Les\s+invit[ée]e?s\s*:/i) ||
    captureBlock(text, /Au\s+micro\s*:/i);
  if (!block) return null;
  const cleaned = cleanText(block);
  return cleaned.length > 5 ? cleaned : null;
}

const MAX_ITEM_LEN = 280;

function truncateAtSentence(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastDot = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'));
  return (lastDot > max * 0.5 ? cut.slice(0, lastDot + 1) : cut).trim();
}

function splitBulletList(block: string): string[] {
  // Split sur lignes qui commencent par - ou • ou *
  const lines = block.split(/\n/).map((l) => l.trim());
  const items: string[] = [];
  let current = '';
  for (const line of lines) {
    const bullet = line.match(/^[-•*]\s*(.+)$/);
    if (bullet) {
      if (current) items.push(cleanText(current));
      current = bullet[1];
    } else if (current && line) {
      current += ' ' + line;
    }
  }
  if (current) items.push(cleanText(current));

  // Tronque chaque item à MAX_ITEM_LEN (évite qu'un bullet englobe le tail text).
  const trimmed = items
    .map((i) => truncateAtSentence(i, MAX_ITEM_LEN))
    .filter((i) => i.length > 2);
  if (trimmed.length) return trimmed;

  // Fallback : split sur " - " si pas de puces explicites
  const oneLine = cleanText(block);
  if (oneLine.includes(' - ') || oneLine.includes(' — ')) {
    return oneLine
      .split(/\s+[-—]\s+/)
      .map((s) => truncateAtSentence(s.trim(), MAX_ITEM_LEN))
      .filter((s) => s.length > 2);
  }
  return [];
}

function extractDiscover(text: string): string[] {
  const block =
    captureBlock(text, /D[ée]couvrez\s*:/i) ||
    captureBlock(text, /Au\s+programme\s*:/i) ||
    captureBlock(text, /Dans\s+cet\s+[ée]pisode\s*:/i);
  if (!block) return [];
  return splitBulletList(block);
}

function extractReferences(text: string): ParsedReference[] {
  const block =
    captureBlock(text, /Ils?\s+citent\s+les\s+r[ée]f[ée]rences\s+suivantes\s*:/i) ||
    captureBlock(text, /R[ée]f[ée]rences?\s*:/i) ||
    captureBlock(text, /Ressources\s*:/i);
  if (!block) return [];

  const items = splitBulletList(block);
  if (!items.length) return [];

  const urlRx = /(https?:\/\/[^\s<>"'()]+[^\s<>"'().,;:!?])/;
  return items.map((item) => {
    const m = item.match(urlRx);
    if (m) {
      const url = m[1];
      const label = item.replace(url, '').replace(/[→:\-—]\s*$/, '').trim();
      return { label: label || url, url };
    }
    return { label: item };
  });
}

function extractCrossEpisodes(text: string): ParsedCrossEpisode[] {
  const block =
    captureBlock(text, /Ainsi\s+que\s+d['’]anciens\s+[ée]pisodes/i) ||
    captureBlock(text, /Les\s+anciens\s+[ée]pisodes\s+de\s+\w+\s+mentionn[ée]s/i);
  const out: ParsedCrossEpisode[] = [];
  const seen = new Set<number>();

  if (block) {
    const itemRx = /#\s*(\d{1,4})\s*[-–—:]\s*([^\n#]+?)(?=\n|$|#\s*\d)/g;
    let m: RegExpExecArray | null;
    while ((m = itemRx.exec(block)) !== null) {
      const num = parseInt(m[1], 10);
      if (!Number.isFinite(num) || seen.has(num)) continue;
      seen.add(num);
      out.push({ number: num, title: cleanText(m[2]).replace(/[.,;:]+$/, '') || undefined });
    }
  }

  // Fallback global : toute mention "#NNN - titre" dans le texte (moins fiable, on limite).
  if (!out.length) {
    const globalRx = /#\s*(\d{1,4})\s*[-–—]\s*([^\n#]{3,80})(?=\n|#\s*\d|$)/g;
    let m: RegExpExecArray | null;
    while ((m = globalRx.exec(text)) !== null) {
      const num = parseInt(m[1], 10);
      if (!Number.isFinite(num) || seen.has(num)) continue;
      seen.add(num);
      out.push({ number: num, title: cleanText(m[2]).replace(/[.,;:]+$/, '') || undefined });
    }
  }

  return out;
}

function extractPromo(text: string): ParsedPromo | null {
  const block =
    captureBlock(text, /Avantages?\s*:/i) ||
    captureBlock(text, /Bonne\s+nouvelle\s*!/i);
  if (!block) return null;

  const promo: ParsedPromo = {};
  const content = cleanText(block);

  // Code promo (format CODE_MAJUSCULES)
  const codeMatch =
    content.match(/code\s+(?:promo\s+)?([A-Z][A-Z0-9]{2,20})/i) ||
    content.match(/\bavec\s+(?:le\s+)?code\s+([A-Z][A-Z0-9]{2,20})/i);
  if (codeMatch) promo.code = codeMatch[1].toUpperCase();

  // URL
  const urlMatch = content.match(/(https?:\/\/[^\s<>"'()]+[^\s<>"'().,;:!?])/);
  if (urlMatch) promo.url = urlMatch[1];

  // Partenaire : "chez X" ou "de X"
  const partnerMatch =
    content.match(/chez\s+([A-Z][\w&'’\s.\-]{1,40}?)(?:\s+→|\s*$|\s*\(|\s+pour|\s+avec|\s*[.,:;])/) ||
    content.match(/offerts?\s+chez\s+([A-Z][\w&'’\s.\-]{1,40}?)(?:\s+→|\s*$|\s*\(|\s+pour|\s+avec|\s*[.,:;])/);
  if (partnerMatch) promo.partner = cleanText(partnerMatch[1]);

  // Description : première phrase courte sans le code/URL
  const description = content
    .replace(/code\s+(?:promo\s+)?[A-Z][A-Z0-9]{2,20}[,:]?\s*/i, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/→/g, '')
    .trim()
    .split(/[.!]/)[0]
    .trim();
  if (description.length > 5 && description.length < 200) promo.description = description;

  // Ne retourner null que si absolument rien de reconnu
  if (!promo.code && !promo.url && !promo.partner && !promo.description) return null;
  return promo;
}

function extractChapters(text: string): ParsedChapter[] {
  const out: ParsedChapter[] = [];
  const seen = new Set<string>();

  // Pattern principal : HH:MM:SS (ou MM:SS) suivi d'un titre
  // Accepté : "00:08:47 : Titre", "00:08:47 - Titre", "- 00:08:47 : Titre"
  const rx = /(?:^|\n)\s*[-•*]?\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*[:\-–—]\s*([^\n]+)/g;
  let m: RegExpExecArray | null;
  let order = 1;
  while ((m = rx.exec(text)) !== null) {
    const ts = hmsToSeconds(m[1]);
    if (ts === null) continue;
    const title = cleanText(m[2]).replace(/[.,;:]+$/, '');
    if (!title || title.length < 2) continue;
    const key = `${ts}:${title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ timestamp_seconds: ts, title, order: order++ });
  }
  return out;
}

function extractYoutubeUrl(text: string): string | null {
  const m = text.match(/(https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^\s"<>)]+)/i);
  if (!m) return null;
  return m[1].replace(/[.,;:!?]+$/, '');
}

function extractCrossPromo(text: string): string | null {
  // "La Martingale présente Vivement la reprise", "GDIY présente X"
  const m = text.match(/([A-ZÀ-Ý][\w'’\s-]{1,40})\s+pr[ée]sente\s+([A-ZÀ-Ý][\w'’\s-]{2,60})/);
  if (!m) return null;
  return cleanText(`${m[1]} présente ${m[2]}`);
}

// ============================================================================
// Main entry
// ============================================================================

export interface ParseOptions {
  /** Podcast tenant — certains patterns sont config-aware */
  tenantId?: string;
}

export function parseRssDescription(
  description: string | null | undefined,
  opts: ParseOptions = {},
): ParsedDescription {
  if (!description || !description.trim()) return { ...EMPTY_PARSED };

  const text = normalize(description);

  return {
    topic: extractTopic(text),
    guestIntro: extractGuestIntro(text),
    discover: extractDiscover(text),
    references: extractReferences(text),
    crossEpisodes: extractCrossEpisodes(text),
    promo: extractPromo(text),
    chapters: extractChapters(text),
    youtubeUrl: extractYoutubeUrl(text),
    crossPromo: extractCrossPromo(text),
  };
}
