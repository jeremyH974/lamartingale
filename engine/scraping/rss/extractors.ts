/**
 * RSS exhaustive extractors — fonctions pures, testables isolément.
 *
 * Objectif : à partir d'un <item> RSS (parsé par fast-xml-parser) ou du HTML
 * de sa description, extraire tout ce qu'on peut "capturer maintenant, exploiter
 * plus tard" — guest, sponsors, liens classifiés, cross-references,
 * contacts, metadata canal.
 *
 * Contrat : chaque extracteur prend un input ciblé (un item RSS, ou un bloc de
 * texte/HTML) et renvoie des valeurs JSON-safe (string, number, null, array,
 * object plat). Jamais d'I/O.
 */

// ============================================================================
// Low-level helpers
// ============================================================================

/** Récupère la première valeur textuelle non vide parmi plusieurs candidats. */
export function firstString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (v == null) continue;
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
    if (typeof v === 'object') {
      const obj = v as any;
      if (typeof obj['#cdata'] === 'string' && obj['#cdata'].trim()) return obj['#cdata'].trim();
      if (typeof obj.__cdata === 'string' && obj.__cdata.trim()) return obj.__cdata.trim();
      if (typeof obj['#text'] === 'string' && obj['#text'].trim()) return obj['#text'].trim();
      if (typeof obj['#text'] === 'number') return String(obj['#text']);
    }
  }
  return null;
}

/** Parse "HH:MM:SS", "MM:SS", "1234" en secondes. */
export function parseDuration(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const parts = s.split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

/** Nettoie HTML → texte brut (tags supprimés, espaces normalisés). */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ============================================================================
// 1. Guest from title
// ============================================================================
// Formats rencontrés :
//   "#313 - Matthieu Stefani - CEO de Cosa Vostra"
//   "#284 — Nom Prénom (Société) : titre"
//   "Episode 42: Name | Role at Company"
//   "Name, Role at Company — titre"
export interface GuestFromTitle {
  name: string | null;
  company: string | null;
  role: string | null;
}

// Un "token nom" = Title Case (+ diacritiques, apostrophe, tiret) OU particule
// nobiliaire/composée en minuscule (de, du, des, la, le, les, van, von, d',
// l', van der, de la, etc.). Regex pensée pour matcher "Sixte de Vauplane",
// "Jean-Marie Le Pen", "Marie-Amélie Le Fur", "Pierre-Édouard Stérin".
const NAME_TOKEN = "(?:[A-ZÀ-Ý][a-zà-ÿ'’\\-]+|d[ae']|de|du|des|la|le|les|van|von|der|dos|da|del|di|y)";
const NAME_REGEX = new RegExp(`(${NAME_TOKEN}(?:[ ’'\\-]${NAME_TOKEN}){1,4})`);

// Blocklist : ces premiers mots ne sont pas des noms (faux positifs courants).
const NOT_NAME_PREFIX = /^(?:[Cc]omment|[Pp]ourquoi|[Tt]out|[Qq]uand|[Qq]uoi|[Qq]u[ei]|[Qq]uels?|[Ll]e [A-Z]|[Ll]a [A-Z]|[Ll]es [A-Z]|[Uu]n |[Uu]ne |[Dd]es |[Ii]nvestir|[Ii]nvestissement|[Pp]rendre|[Ff]aut-il|[Ss]aas|[Ll]'|[Ll]'|[Ii]mmobilier|[Bb]ourse|[Cc]rypto|[Hh]ors[-\s]*[Ss][ée]rie|[Ee]xtrait|[Bb]onus|[Ee]pisode|[Ss]aison)\b/;

export function extractGuestFromTitle(title: string): GuestFromTitle {
  if (!title) return { name: null, company: null, role: null };

  // Retire préfixe "#NN -", "#NN —", "Episode NN:"
  let s = title
    .replace(/^#?\s*\d+\s*[-–—:]\s*/, '')
    .replace(/^episode\s+\d+\s*[:\-–—]\s*/i, '')
    .replace(/^\[(?:EXTRAIT|BONUS|HORS[-\s]S[ÉE]RIE|HORS[-\s]SERIE)[^\]]*\]\s*[-–—]?\s*/i, '')
    .replace(/^VF\s*[-–—]\s*/i, '')
    .trim();

  // Si le titre commence par un mot non-nom ("Comment", "Pourquoi", "Investir"...) :
  // format LM question → pas de guest extractable.
  if (NOT_NAME_PREFIX.test(s)) return { name: null, company: null, role: null };

  // Variante "Name (Company)" ou "Name (Company) : titre"
  const parenMatch = s.match(/^([^(|,]{2,80})\s*\(([^)]+)\)\s*(?:[:\-–—]\s*(.+))?$/);
  if (parenMatch) {
    return {
      name: parenMatch[1].trim(),
      company: parenMatch[2].trim(),
      role: (parenMatch[3] || '').trim() || null,
    };
  }

  // Variante "Name, Role at/chez/de Company"
  const commaMatch = s.match(/^([^,|]{2,80}),\s*([^|–—-]+?)\s+(?:at|chez|from|@)\s+([^|–—-]{2,80})/i);
  if (commaMatch) {
    return {
      name: commaMatch[1].trim(),
      role: commaMatch[2].trim(),
      company: commaMatch[3].trim(),
    };
  }

  // Variante "Name - Role de/at/chez Company" (ex. "Matthieu Stefani - CEO de Cosa Vostra")
  const dashRoleMatch = s.match(/^([^-–—|]{2,80})\s*[-–—]\s*(.+?)\s+(?:at|chez|de|from|@)\s+([^|–—-]{2,80})$/i);
  if (dashRoleMatch) {
    return {
      name: dashRoleMatch[1].trim(),
      role: dashRoleMatch[2].trim(),
      company: dashRoleMatch[3].trim(),
    };
  }

  // Format GDIY classique : "Name - Company - Titre" ou "Name - Company - Role - Titre"
  // Name = NAME_REGEX (avec particules). Company = texte libre ≤ 60 chars.
  const gdiyMatch = s.match(new RegExp(`^${NAME_TOKEN}(?:[ ’'\\-]${NAME_TOKEN}){1,4}\\s*[-–—]\\s*([^-–—]{2,60})(?:\\s*[-–—]\\s*(.+))?$`));
  if (gdiyMatch) {
    const nameMatch = s.match(new RegExp(`^(${NAME_TOKEN}(?:[ ’'\\-]${NAME_TOKEN}){1,4})`));
    if (nameMatch) {
      return {
        name: nameMatch[1].trim(),
        company: gdiyMatch[1].trim(),
        role: (gdiyMatch[2] || '').trim() || null,
      };
    }
  }

  // Fallback : 2-5 tokens de nom en début de titre.
  const nameOnly = s.match(new RegExp(`^(${NAME_TOKEN}(?:[ ’'\\-]${NAME_TOKEN}){1,4})`));
  if (nameOnly) {
    const n = nameOnly[1].trim();
    // Guard : doit contenir au moins un token Title-Case (pas que des particules).
    if (/[A-ZÀ-Ý]/.test(n)) return { name: n, company: null, role: null };
  }

  return { name: null, company: null, role: null };
}

// ============================================================================
// 2. Sponsors detection
// ============================================================================
export interface SponsorMention {
  name: string;
  context?: string; // extrait ~120 chars autour
}

const SPONSOR_MARKERS = [
  /cet[\s-]+épisode\s+(?:est\s+)?(?:sponsoris[ée]|pr[ée]sent[ée])\s+par\s+([A-Z][\w&'’\s.\-]{1,40})/i,
  /merci\s+(?:à|a)\s+(?:notre\s+)?(?:partenaire|sponsor)\s+([A-Z][\w&'’\s.\-]{1,40})/i,
  /sponsor[ié]*\s+par\s+([A-Z][\w&'’\s.\-]{1,40})/i,
  /en\s+partenariat\s+avec\s+([A-Z][\w&'’\s.\-]{1,40})/i,
  /brought\s+to\s+you\s+by\s+([A-Z][\w&'’\s.\-]{1,40})/i,
];

// Détecte un bloc "Un grand MERCI à nos sponsors : X : url  Y : url  Z : url"
// puis parse chaque entrée. Markers début : "merci à nos (sponsors|partenaires)",
// "grand merci à nos…". Fin : "Vous souhaitez sponsoriser", "TIMELINE", "Hébergé
// par", fin de texte.
const SPONSOR_BLOCK_START = /(?:un\s+(?:grand|[ée]norme)\s+)?merci\s+(?:à|a)\s+(?:tous\s+)?(?:nos|mes)\s+(?:sponsors|partenaires)\s*[:\-—]?\s*/i;
const SPONSOR_BLOCK_END = /(?:vous\s+souhaitez\s+sponsoriser|TIMELINE|timeline\s*:|h[ée]berg[ée]\s+par|montages?\s+[:\-]|ecr[iy]vez[- ]nous|retrouvez[- ]nous|hors[- ]s[ée]rie)/i;

function parseSponsorBlock(block: string): SponsorMention[] {
  const out: SponsorMention[] = [];
  const seen = new Set<string>();
  // Cible stricte : "Name : url" avec `:` obligatoire (pas `-`, trop bruyant).
  // Name = Title Case 3-30 chars, max 4 tokens. Chaque token significatif
  // doit commencer par majuscule (les particules de/du/la/& sont tolérées).
  const urlPart = `(?:https?:\\/\\/\\S+|[a-z0-9][a-z0-9.\\-]*\\.[a-z]{2,}(?:\\/\\S*)?)`;
  const entryRx = new RegExp(
    `([A-ZÀ-Ý][A-Za-zÀ-ÿ0-9&'’\\- ]{2,30}?)\\s*:\\s*(${urlPart})`,
    'g',
  );
  const PARTICLES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'd', '&', 'et', 'y']);
  let m: RegExpExecArray | null;
  while ((m = entryRx.exec(block)) !== null) {
    const name = m[1].replace(/\s+/g, ' ').trim();
    if (!name || name.length < 3) continue;
    if (/^(?:et|aussi|plus|ainsi|aujourd'hui|merci|grand|[ée]norme|http|https)$/i.test(name)) continue;
    const tokens = name.split(' ');
    if (tokens.length > 4) continue;
    // Tous les tokens non-particule doivent commencer par majuscule.
    const looksProper = tokens.every((t) => {
      if (!t) return false;
      if (PARTICLES.has(t.toLowerCase())) return true;
      return /^[A-ZÀ-Ý0-9]/.test(t);
    });
    if (!looksProper) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, context: (m[2] || '').trim() });
  }
  return out;
}

export function extractSponsors(text: string): SponsorMention[] {
  if (!text) return [];
  const plain = htmlToText(text);
  const found: SponsorMention[] = [];
  const seen = new Set<string>();

  // 1. Bloc "Merci à nos sponsors : …" (multi-sponsors GDIY)
  const blockStart = plain.search(SPONSOR_BLOCK_START);
  if (blockStart >= 0) {
    const rest = plain.slice(blockStart + (plain.match(SPONSOR_BLOCK_START)?.[0].length || 0));
    const endMatch = rest.search(SPONSOR_BLOCK_END);
    const block = endMatch > 0 ? rest.slice(0, endMatch) : rest.slice(0, 600);
    for (const s of parseSponsorBlock(block)) {
      const key = s.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(s);
    }
  }

  // 2. Markers single-sponsor ("cet épisode est sponsorisé par X")
  for (const rx of SPONSOR_MARKERS) {
    const m = plain.match(rx);
    if (!m) continue;
    const name = (m[1] || '').replace(/[.,;:!?].*$/, '').trim();
    if (!name || name.length < 2) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const idx = m.index ?? 0;
    const ctxStart = Math.max(0, idx - 60);
    const ctxEnd = Math.min(plain.length, idx + m[0].length + 60);
    found.push({ name, context: plain.slice(ctxStart, ctxEnd).trim() });
  }
  return found;
}

// ============================================================================
// 3. Links extraction + classification
// ============================================================================
export type LinkType =
  | 'resource'
  | 'linkedin'
  | 'episode_ref'
  | 'company'
  | 'tool'
  | 'social'
  | 'cross_podcast_ref'
  | 'audio'
  | 'other';

export interface RssLink {
  url: string;
  label?: string;
  link_type: LinkType;
}

const LINK_PATTERNS: { type: LinkType; rx: RegExp }[] = [
  { type: 'linkedin',           rx: /linkedin\.com\/(?:in|company)\//i },
  { type: 'social',             rx: /(?:twitter\.com|x\.com|instagram\.com|facebook\.com|tiktok\.com|youtube\.com|youtu\.be)\//i },
  { type: 'audio',              rx: /\.(?:mp3|m4a|wav|ogg)(?:\?|$)/i },
  { type: 'cross_podcast_ref',  rx: /(?:podcasts\.apple\.com|spotify\.com\/(?:episode|show)|deezer\.com\/(?:podcast|episode)|audiomeans\.fr|ausha\.co)\//i },
  { type: 'episode_ref',        rx: /lamartingale\.io\/(?:episode|podcast)/i },
];

const TOOL_DOMAINS = /(notion\.so|airtable\.com|figma\.com|github\.com|stripe\.com|typeform\.com|mailchimp\.com|hubspot\.com)/i;

export function classifyUrl(url: string): LinkType {
  if (!url) return 'other';
  for (const p of LINK_PATTERNS) if (p.rx.test(url)) return p.type;
  if (TOOL_DOMAINS.test(url)) return 'tool';
  // Domaines company probables : .com/.fr racine + pas de path de ressource
  if (/^https?:\/\/[^/]+\/?$/.test(url)) return 'company';
  return 'resource';
}

export function extractLinks(html: string): RssLink[] {
  if (!html) return [];
  const results: RssLink[] = [];
  const seen = new Set<string>();

  // 1. Balises <a href="...">label</a>
  const anchorRx = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRx.exec(html)) !== null) {
    const url = m[1].trim();
    if (!/^https?:\/\//i.test(url)) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const label = htmlToText(m[2]).slice(0, 200) || undefined;
    results.push({ url, label, link_type: classifyUrl(url) });
  }

  // 2. URLs nues (texte plein / after stripping)
  const plain = htmlToText(html);
  const urlRx = /https?:\/\/[^\s<>"'()]+[^\s<>"'().,;:!?]/g;
  while ((m = urlRx.exec(plain)) !== null) {
    const url = m[0];
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ url, link_type: classifyUrl(url) });
  }

  return results;
}

// ============================================================================
// 4. Cross-references (mentions d'autres podcasts)
// ============================================================================
export interface CrossRef {
  podcast?: string;
  episode_ref?: string;
  url?: string;
}

const PODCAST_MENTIONS = [
  /\b(generation\s+do\s+it\s+yourself|GDIY)\b/i,
  /\b(la\s+martingale)\b/i,
  /\b(le\s+board|flodcast|sans\s+permission|panier\s+et\s+moi|dans\s+la\s+t[eê]te)\b/i,
];

export function extractCrossRefs(text: string, links: RssLink[] = []): CrossRef[] {
  if (!text && links.length === 0) return [];
  const plain = htmlToText(text || '');
  // Accent-insensitive : on matche sur la version sans diacritiques.
  const asciiPlain = plain.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const refs: CrossRef[] = [];
  const seen = new Set<string>();

  for (const rx of PODCAST_MENTIONS) {
    const m = asciiPlain.match(rx);
    if (!m) continue;
    const name = m[1].replace(/\s+/g, ' ').trim().toLowerCase();
    if (seen.has(name)) continue;
    seen.add(name);
    refs.push({ podcast: name });
  }

  for (const l of links) {
    if (l.link_type !== 'cross_podcast_ref') continue;
    const key = `url:${l.url.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ url: l.url, episode_ref: l.label });
  }

  return refs;
}

// ============================================================================
// 5. Contact / social extraction (depuis channel OR item)
// ============================================================================
export interface ContactInfo {
  emails: string[];
  socials: { platform: string; url: string }[];
}

const EMAIL_RX = /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/gi;

export function extractContact(text: string): ContactInfo {
  const emails: string[] = [];
  const socials: { platform: string; url: string }[] = [];
  if (!text) return { emails, socials };

  const plain = htmlToText(text);

  const mailSeen = new Set<string>();
  for (const e of plain.match(EMAIL_RX) || []) {
    const k = e.toLowerCase();
    if (mailSeen.has(k)) continue;
    mailSeen.add(k);
    emails.push(e);
  }

  const urlSeen = new Set<string>();
  const urlRx = /https?:\/\/[^\s<>"'()]+[^\s<>"'().,;:!?]/g;
  let m: RegExpExecArray | null;
  while ((m = urlRx.exec(plain)) !== null) {
    const url = m[0];
    const k = url.toLowerCase();
    if (urlSeen.has(k)) continue;
    urlSeen.add(k);
    const type = classifyUrl(url);
    if (type === 'social' || type === 'linkedin') {
      const platform =
        /linkedin/i.test(url)   ? 'linkedin'  :
        /(twitter|x\.com)/i.test(url) ? 'twitter' :
        /instagram/i.test(url)  ? 'instagram' :
        /youtube|youtu\.be/i.test(url) ? 'youtube'  :
        /tiktok/i.test(url)     ? 'tiktok'    :
        /facebook/i.test(url)   ? 'facebook'  : 'other';
      socials.push({ platform, url });
    }
  }

  // Extrait aussi les href d'anchors
  const anchorRx = /<a\s+[^>]*href=["']([^"']+)["']/gi;
  while ((m = anchorRx.exec(text)) !== null) {
    const url = m[1];
    const k = url.toLowerCase();
    if (urlSeen.has(k)) continue;
    urlSeen.add(k);
    if (/mailto:/i.test(url)) {
      const mail = url.replace(/^mailto:/i, '').split('?')[0];
      if (mail && !mailSeen.has(mail.toLowerCase())) {
        mailSeen.add(mail.toLowerCase());
        emails.push(mail);
      }
      continue;
    }
    const type = classifyUrl(url);
    if (type === 'social' || type === 'linkedin') {
      const platform =
        /linkedin/i.test(url)   ? 'linkedin'  :
        /(twitter|x\.com)/i.test(url) ? 'twitter' :
        /instagram/i.test(url)  ? 'instagram' :
        /youtube|youtu\.be/i.test(url) ? 'youtube'  :
        /tiktok/i.test(url)     ? 'tiktok'    :
        /facebook/i.test(url)   ? 'facebook'  : 'other';
      socials.push({ platform, url });
    }
  }

  return { emails, socials };
}

// ============================================================================
// 6. Publish frequency
// ============================================================================
/**
 * Retourne la médiane des écarts (en jours) entre pubDates triés décroissants.
 * Retourne null si < 2 dates valides.
 */
export function computePublishFrequencyDays(pubDates: (string | Date | null | undefined)[]): number | null {
  const valid: number[] = pubDates
    .map((d) => (d instanceof Date ? d.getTime() : d ? new Date(d).getTime() : NaN))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => b - a);
  if (valid.length < 2) return null;
  const diffs: number[] = [];
  for (let i = 1; i < valid.length; i++) {
    diffs.push((valid[i - 1] - valid[i]) / (1000 * 60 * 60 * 24));
  }
  diffs.sort((a, b) => a - b);
  const mid = Math.floor(diffs.length / 2);
  const median = diffs.length % 2 ? diffs[mid] : (diffs[mid - 1] + diffs[mid]) / 2;
  return Math.round(median * 100) / 100;
}

// ============================================================================
// 7. Channel metadata (podcast_metadata table)
// ============================================================================
export interface ChannelMetadata {
  title: string | null;
  subtitle: string | null;
  description: string | null;
  author: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  managingEditor: string | null;
  language: string | null;
  copyright: string | null;
  explicit: boolean | null;
  podcastType: string | null;
  imageUrl: string | null;
  itunesImageUrl: string | null;
  link: string | null;
  newFeedUrl: string | null;
  categories: { text: string; sub?: string[] }[];
  keywords: string[];
  socialLinks: { platform: string; url: string }[];
  contactEmails: string[];
  lastBuildDate: string | null;
  generator: string | null;
}

function parseBool(v: unknown): boolean | null {
  const s = firstString(v);
  if (!s) return null;
  if (/^(yes|true|explicit)$/i.test(s)) return true;
  if (/^(no|false|clean)$/i.test(s)) return false;
  return null;
}

export function extractChannelMetadata(channel: any): ChannelMetadata {
  if (!channel) {
    return {
      title: null, subtitle: null, description: null, author: null,
      ownerName: null, ownerEmail: null, managingEditor: null,
      language: null, copyright: null, explicit: null, podcastType: null,
      imageUrl: null, itunesImageUrl: null, link: null, newFeedUrl: null,
      categories: [], keywords: [], socialLinks: [], contactEmails: [],
      lastBuildDate: null, generator: null,
    };
  }

  // itunes:category peut être un objet ou un array, avec attributs @_text et nested <itunes:category @_text="sub">
  const catRaw = channel['itunes:category'];
  const catArr = catRaw ? (Array.isArray(catRaw) ? catRaw : [catRaw]) : [];
  const categories = catArr.map((c: any) => {
    const text = c?.['@_text'] || firstString(c) || '';
    const sub = c?.['itunes:category']
      ? (Array.isArray(c['itunes:category']) ? c['itunes:category'] : [c['itunes:category']])
          .map((s: any) => s?.['@_text'] || firstString(s))
          .filter(Boolean) as string[]
      : undefined;
    return { text, sub };
  }).filter((c) => c.text);

  const keywordsRaw = firstString(channel['itunes:keywords']) || '';
  const keywords = keywordsRaw ? keywordsRaw.split(/\s*,\s*/).filter(Boolean) : [];

  const ownerName = firstString(channel['itunes:owner']?.['itunes:name']);
  const ownerEmail = firstString(channel['itunes:owner']?.['itunes:email']);
  const managingEditor = firstString(channel.managingEditor);

  const descriptionText = firstString(channel.description, channel['itunes:summary']);
  const contact = extractContact(
    [descriptionText, firstString(channel['itunes:summary'])].filter(Boolean).join('\n'),
  );

  const contactEmails = Array.from(new Set([...(ownerEmail ? [ownerEmail] : []), ...contact.emails]));

  const imgUrl = firstString(channel.image?.url) || null;
  const itunesImg = channel['itunes:image']?.['@_href'] || firstString(channel['itunes:image']) || null;

  return {
    title:            firstString(channel.title),
    subtitle:         firstString(channel['itunes:subtitle']),
    description:      descriptionText,
    author:           firstString(channel['itunes:author']),
    ownerName,
    ownerEmail,
    managingEditor,
    language:         firstString(channel.language),
    copyright:        firstString(channel.copyright),
    explicit:         parseBool(channel['itunes:explicit']),
    podcastType:      firstString(channel['itunes:type']),
    imageUrl:         imgUrl,
    itunesImageUrl:   itunesImg,
    link:             firstString(channel.link),
    newFeedUrl:       firstString(channel['itunes:new-feed-url']),
    categories,
    keywords,
    socialLinks:      contact.socials,
    contactEmails,
    lastBuildDate:    firstString(channel.lastBuildDate),
    generator:        firstString(channel.generator),
  };
}

// ============================================================================
// 8. Item extraction — agrège tout le reste
// ============================================================================
export interface ExhaustiveItem {
  guid: string | null;
  title: string;
  pubDate: string | null;
  season: number | null;
  episodeNumber: number | null;
  episodeType: string | null;
  explicit: boolean | null;
  durationSeconds: number | null;
  audioUrl: string | null;
  audioSizeBytes: number | null;
  episodeImageUrl: string | null;
  description: string | null;         // HTML/CDATA cleaned
  rssContentEncoded: string | null;   // raw content:encoded si différent
  guestFromTitle: GuestFromTitle;
  sponsors: SponsorMention[];
  links: RssLink[];
  crossRefs: CrossRef[];
}

export function extractItem(it: any): ExhaustiveItem {
  const title = firstString(it.title) || '';
  const guid = firstString(it.guid);
  const pubDate = firstString(it.pubDate);

  let episodeNumber: number | null = null;
  const epRaw = firstString(it['itunes:episode']);
  if (epRaw) episodeNumber = parseInt(epRaw, 10) || null;
  if (episodeNumber == null) {
    const m = title.match(/^#?\s*(\d+)\s*[-–—]/);
    if (m) episodeNumber = parseInt(m[1], 10);
  }

  const seasonRaw = firstString(it['itunes:season']);
  const season = seasonRaw ? parseInt(seasonRaw, 10) || null : null;

  const durationSeconds = parseDuration(firstString(it['itunes:duration']));
  const audioUrl = firstString(it.enclosure?.['@_url']) || firstString(it.enclosure?.url) || null;
  const audioLen = firstString(it.enclosure?.['@_length']) || firstString(it.enclosure?.length) || null;
  const audioSizeBytes = audioLen ? parseInt(audioLen, 10) || null : null;

  const episodeImageUrl = it['itunes:image']?.['@_href']
    || firstString(it['itunes:image'])
    || null;

  const rawDescription = firstString(it['content:encoded'], it.description, it['itunes:summary']);
  const rssContentEncoded = firstString(it['content:encoded']);
  const description = rawDescription || null;

  const textForExtraction = rawDescription || '';

  const links = extractLinks(textForExtraction);
  const sponsors = extractSponsors(textForExtraction);
  const crossRefs = extractCrossRefs(textForExtraction, links);
  const guestFromTitle = extractGuestFromTitle(title);

  return {
    guid,
    title,
    pubDate,
    season,
    episodeNumber,
    episodeType:    firstString(it['itunes:episodeType']),
    explicit:       parseBool(it['itunes:explicit']),
    durationSeconds,
    audioUrl,
    audioSizeBytes,
    episodeImageUrl,
    description,
    rssContentEncoded,
    guestFromTitle,
    sponsors,
    links,
    crossRefs,
  };
}
