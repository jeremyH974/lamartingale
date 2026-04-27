// engine/output/parsers/markdownParser.ts — extrait des Livrable structurés
// depuis les .md du pack pilote sandbox.
//
// Phase 7a : transitoire. Les .md sont produits par les scripts phase5/6 dans
// `experiments/.../pack-pilote-stefani-orso/{slug}/0X-*.md`. Ces parsers les
// reconstituent en objets Livrable typés pour réutiliser les formatters
// docx/xlsx. Phase V2 : le pipeline runPack produira directement les objets
// Livrable, ces parsers deviendront optionnels (utiles pour back-import ou
// tests régression).
//
// Approche : regex ad-hoc — la structure des livrables est très contrainte
// et stable. marked-style AST = sur-engineered ici.

import type {
  BriefAnnexeLivrable,
  CrossRef,
  CrossRefsLensSection,
  CrossRefsLivrable,
  KeyMoment,
  KeyMomentsLivrable,
  NewsletterLivrable,
  Quote,
  QuotesLivrable,
} from '../types';

function stripFirstHeading(md: string): { title: string; rest: string } {
  const m = md.match(/^#\s+(.+?)\n/);
  if (!m) throw new Error('parser: missing top-level heading (# ...)');
  // Strip emoji prefix (ex: "🎙️ Key moments — ..." → "Key moments — ...")
  const titleRaw = m[1].trim();
  const title = titleRaw.replace(/^([\p{Emoji_Presentation}\p{Extended_Pictographic}]\s*)+/u, '').trim();
  return { title, rest: md.slice(m[0].length) };
}

function takeSubtitle(rest: string): { subtitle?: string; remaining: string } {
  // Pattern: une ligne italique `*...*` après le titre, optionnelle.
  const m = rest.match(/^\s*\*([^*\n][^\n]*)\*\s*\n/);
  if (m) return { subtitle: m[1].trim(), remaining: rest.slice(m[0].length) };
  return { remaining: rest };
}

function extractEpisodeRefFromTitle(title: string): string {
  // Cherche un pattern type "GDIY #266 ...", "Finscale #299 ...", "Newsletter — GDIY #266 ..."
  const m = title.match(/(?:[A-Z][a-zA-Zéèà]+\s*)?#\d+[^—]*/);
  return (m ? m[0] : title).trim();
}

// L1 — Key moments

export function parseKeyMoments(md: string): KeyMomentsLivrable {
  const { title, rest } = stripFirstHeading(md);
  const { subtitle, remaining } = takeSubtitle(rest);
  const moments: KeyMoment[] = [];
  // Bugfix Phase 7a (2026-04-27) : préfixe \n pour matcher le PREMIER `## `
  // quand `remaining` commence directement par `##` (cas où le subtitle a été
  // strippé). Sans ce préfixe, slice(1) perd silencieusement le moment #1.
  const blocks = ('\n' + remaining).split(/\n## /).slice(1);
  for (const block of blocks) {
    const m = block.match(
      /^(\d+)\.\s+(.+?)\n\*\*(\d{1,2}:\d{2})[–-](\d{1,2}:\d{2})\*\*\s*·\s*saliency\s+([\d.]+)\s*\n+>\s*(.+?)\n+\*\*Pourquoi c'est saillant\*\*\s*:\s*([\s\S]+?)(?=\n## |\n*$)/,
    );
    if (!m) {
      throw new Error(`parseKeyMoments: failed to parse moment block:\n${block.slice(0, 200)}`);
    }
    moments.push({
      numero: parseInt(m[1], 10),
      titre: m[2].trim(),
      timestampStart: m[3],
      timestampEnd: m[4],
      saliency: parseFloat(m[5]),
      quote: m[6].trim(),
      pourquoi: m[7].trim(),
    });
  }
  return {
    type: 'L1_keyMoments',
    title,
    subtitle,
    episodeRef: extractEpisodeRefFromTitle(title),
    moments,
  };
}

// L2 — Quotes

export function parseQuotes(md: string): QuotesLivrable {
  const { title, rest } = stripFirstHeading(md);
  const { subtitle, remaining } = takeSubtitle(rest);
  const quotes: Quote[] = [];
  // Strip footer "Sillon — production éditoriale..."
  const cleaned = remaining.split(/\n---\s*\n/)[0];
  // Bugfix Phase 7a (2026-04-27) : préfixe \n pour matcher la PREMIÈRE
  // citation quand `cleaned` commence directement par `## Citation `.
  const blocks = ('\n' + cleaned).split(/\n## Citation /).slice(1);
  for (const block of blocks) {
    const m = block.match(
      /^(\d+)\s*\n+>\s*\*?«\s*(.+?)\s*»\*?\s*\n>\s*—\s*\*\*([^*]+)\*\*\s*·\s*(\d{1,2}:\d{2})\s*\n+\*\*Plateforme\(s\)\*\*\s*:\s*(.+?)\s*\n\*\*Pourquoi cette citation\*\*\s*:\s*([\s\S]+?)(?=\n## Citation|\n*$)/,
    );
    if (!m) {
      throw new Error(`parseQuotes: failed to parse citation block:\n${block.slice(0, 200)}`);
    }
    quotes.push({
      numero: parseInt(m[1], 10),
      text: m[2].trim(),
      auteur: m[3].trim(),
      timestamp: m[4],
      plateformes: m[5].split(',').map((s) => s.trim()).filter(Boolean),
      pourquoi: m[6].trim(),
    });
  }
  return {
    type: 'L2_quotes',
    title,
    subtitle,
    episodeRef: extractEpisodeRefFromTitle(title),
    quotes,
  };
}

// L3 — Cross-refs by lens

/**
 * Parse une ligne de tête de ref. Format observé multi-épisodes :
 *  - `→ #299 — Firmin Zocchetto (PayFit) — *Title* (Source)`
 *  - `→ GDIY #122 — Vincent Huguet (Malt)`
 *  - `→ Les sneakers : mode ou investissement ?`
 *  - `→ #49 - Nima Karimi (Silvr) - Title`
 *  - `→ #271 — Pierre-Eric Leibovici — *Le VC-as-a-Platform* (Finscale)`
 *
 * Stratégie : split sur `—` (em dash, U+2014) UNIQUEMENT pour préserver les
 * tirets simples dans les noms propres (Pierre-Eric, Jean-Pierre, etc).
 * Si pas d'em dash, fallback split sur ` - ` (avec espaces autour, jamais
 * sur `-` collé). Chaque segment est ensuite identifié par sa forme.
 */
function parseRefHead(headLine: string): {
  episodeNumber: string;
  guestName: string;
  episodeTitle: string;
  podcastSource: string;
} {
  const cleaned = headLine.replace(/^→\s*/, '').trim();

  // Split sur em dash (—) en priorité. Si absent, fallback ` - ` avec espaces.
  const segments = cleaned.includes('—')
    ? cleaned.split(/\s*—\s*/).map((s) => s.trim()).filter(Boolean)
    : cleaned.split(/\s+-\s+/).map((s) => s.trim()).filter(Boolean);

  let episodeNumber = '';
  let guestName = '';
  let episodeTitle = '';
  let podcastSource = '';

  for (const seg of segments) {
    // Segment "podcast #N" ou juste "#N" (ex: "GDIY #122", "#271")
    if (!episodeNumber) {
      const numOnlyMatch = seg.match(/^#(\d+)$/);
      const numWithSrcMatch = seg.match(/^([A-Z][\wÀ-ÖØ-öø-ÿ]*)\s+#(\d+)$/);
      if (numOnlyMatch) {
        episodeNumber = `#${numOnlyMatch[1]}`;
        continue;
      }
      if (numWithSrcMatch) {
        if (!podcastSource) podcastSource = numWithSrcMatch[1];
        episodeNumber = `#${numWithSrcMatch[2]}`;
        continue;
      }
    }
    // Segment titre italique : "*...*" éventuellement suivi de " (Source)"
    const italicMatch = seg.match(/^\*([^*]+)\*\s*(?:\(([^()]+)\))?\s*$/);
    if (italicMatch && !episodeTitle) {
      episodeTitle = italicMatch[1].trim();
      if (italicMatch[2] && !podcastSource) podcastSource = italicMatch[2].trim();
      continue;
    }
    // Segment guest : "Prénom Nom" ou "Prénom Nom (suffixe)" — pas d'italique.
    // Heuristique : si le segment contient ":" ou ressemble plus à un titre
    // (ex: "Comment investir...", "Les sneakers..."), on le route vers
    // episodeTitle plutôt que guestName.
    const looksLikeTitle = /[:?]/.test(seg) || seg.length > 60;
    if (!guestName && !/^#?\d+$/.test(seg) && !looksLikeTitle) {
      // Strip trailing "(suffixe)" si présent (ex: "Vincent Huguet (Malt)")
      const guestStripMatch = seg.match(/^(.+?)\s*\(([^()]+)\)\s*$/);
      if (guestStripMatch) {
        guestName = guestStripMatch[1].trim();
        // Le suffixe en parenthèses est généralement le nom de boîte, pas la
        // source (Jérémy 2026-04-26 : (Malt) = nom boîte invité). On ignore.
        void guestStripMatch[2];
      } else {
        guestName = seg;
      }
      continue;
    }
    // Tout segment restant non identifié = titre fallback (cas sans italique).
    if (!episodeTitle) {
      // Strip trailing "(Source)" éventuelle.
      const trailMatch = seg.match(/^(.+?)\s*\(([^()]+)\)\s*$/);
      if (trailMatch) {
        episodeTitle = trailMatch[1].trim();
        if (!podcastSource) podcastSource = trailMatch[2].trim();
      } else {
        episodeTitle = seg;
      }
    }
  }

  // Si rien n'a matché du tout, mettre la ligne entière en titre.
  if (!episodeNumber && !guestName && !episodeTitle) {
    return {
      episodeNumber: '',
      guestName: '',
      episodeTitle: cleaned,
      podcastSource: '',
    };
  }
  return { episodeNumber, guestName, episodeTitle, podcastSource };
}

export function parseCrossRefs(md: string): CrossRefsLivrable {
  const { title, rest } = stripFirstHeading(md);
  const { subtitle, remaining } = takeSubtitle(rest);

  // Filtering note ("> ⚙️ ...") — optionnelle.
  let body = remaining;
  let filteringNote: string | undefined;
  const filtMatch = body.match(/^\s*>\s*(.+?)\n\n/s);
  if (filtMatch) {
    filteringNote = filtMatch[1].replace(/\n>\s*/g, ' ').trim();
    body = body.slice(filtMatch[0].length);
  }

  // Footer skipped note potentielle — tracking si présent.
  let skippedNote: string | undefined;
  const skippedMatch = body.match(/\n\*Note\s*:\s*(.+?)\*\s*$/s);
  if (skippedMatch) {
    skippedNote = skippedMatch[1].trim();
    body = body.slice(0, skippedMatch.index);
  }

  // Sections par H2 ("## Si vous avez aimé...") — préfixe \n pour gérer le cas
  // où body commence directement par "##" (après strip de filteringNote).
  const sectionsRaw = ('\n' + body).split(/\n##\s+/).slice(1);
  const sections: CrossRefsLensSection[] = [];
  for (let idx = 0; idx < sectionsRaw.length; idx++) {
    const sec = sectionsRaw[idx];
    const headingEnd = sec.indexOf('\n');
    const lensIntro = sec.slice(0, headingEnd).trim();
    const sectionBody = sec.slice(headingEnd + 1);

    const refs: CrossRef[] = [];
    const refBlocks = ('\n' + sectionBody).split(/\n###\s+/).slice(1);
    for (const refBlock of refBlocks) {
      const headLineEnd = refBlock.indexOf('\n');
      const headLine = (headLineEnd === -1 ? refBlock : refBlock.slice(0, headLineEnd)).trim();
      const refBody = headLineEnd === -1 ? '' : refBlock.slice(headLineEnd + 1);
      const head = parseRefHead(headLine);
      const bodyStop = refBody.split(/\n---\s*\n/)[0];
      const paragraphs = bodyStop
        .split(/\n\n+/)
        .map((p) => p.trim())
        .filter(Boolean);
      refs.push({ ...head, bodyParagraphs: paragraphs });
    }
    sections.push({
      lensId: `lens-${idx + 1}`,
      lensIntro,
      refs,
    });
  }
  return {
    type: 'L3_crossRefs',
    title,
    subtitle,
    episodeRef: extractEpisodeRefFromTitle(title),
    filteringNote,
    sections,
    skippedNote,
  };
}

// L4 — Newsletter

export function parseNewsletter(md: string): NewsletterLivrable {
  const { title, rest } = stripFirstHeading(md);
  // Newsletter: deuxième H1 = newsletterTitle (corps du newsletter)
  const m2 = rest.match(/^\s*\n*#\s+(.+?)\n/);
  if (!m2) throw new Error('parseNewsletter: missing newsletter title (second # ...)');
  const newsletterTitle = m2[1].trim();
  let body = rest.slice(m2[0].length);

  // Footer
  let footer: string | undefined;
  const footMatch = body.match(/\n---\s*\n+\*([^*]+?)\*\s*$/s);
  if (footMatch) {
    footer = footMatch[1].trim();
    body = body.slice(0, footMatch.index);
  }

  // Sections séparées par "---"
  const sectionsRaw = body.split(/\n---\s*\n/);
  const sections: string[][] = sectionsRaw
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) =>
      s
        .split(/\n\n+/)
        .map((p) => p.trim())
        .filter(Boolean),
    );
  return {
    type: 'L4_newsletter',
    title,
    episodeRef: extractEpisodeRefFromTitle(title),
    newsletterTitle,
    sections,
    footer,
  };
}

// L5 — Brief annexe

export function parseBriefAnnexe(md: string): BriefAnnexeLivrable {
  const { title, rest } = stripFirstHeading(md);
  let body = rest;

  // Footer
  let footer: string | undefined;
  const footMatch = body.match(/\n---\s*\n+\*([^*]+?)\*\s*$/s);
  if (footMatch) {
    footer = footMatch[1].trim();
    body = body.slice(0, footMatch.index);
  }

  // Skipped note
  let skippedNote: string | undefined;
  const skippedMatch = body.match(/\n\*Note\s*:\s*([\s\S]+?)\*\s*$/);
  if (skippedMatch) {
    skippedNote = skippedMatch[1].trim();
    body = body.slice(0, skippedMatch.index);
  }

  // Premier paragraphe gras = "**Aller plus loin..."  → on l'utilise comme intro avant les sections.
  // Structure observée : H1 \n **Strong intro** \n intro lines... \n --- \n **Section1** \n paras... \n --- \n **Section2** ...
  // L'intro prend tout jusqu'au premier `---`.
  const parts = body.split(/\n---\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) {
    throw new Error('parseBriefAnnexe: empty body');
  }
  const intro = parts[0];
  const sectionParts = parts.slice(1);
  const sections: { heading: string; paragraphs: string[] }[] = sectionParts.map((sp) => {
    const lines = sp.split(/\n+/);
    const headingMatch = lines[0].match(/^\*\*(.+?)\*\*\s*$/);
    const heading = headingMatch ? headingMatch[1].trim() : lines[0].trim();
    const restPart = headingMatch ? lines.slice(1).join('\n') : lines.slice(1).join('\n');
    const paragraphs = restPart
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter(Boolean);
    return { heading, paragraphs };
  });

  return {
    type: 'L5_briefAnnexe',
    title,
    episodeRef: extractEpisodeRefFromTitle(title),
    intro,
    sections,
    skippedNote,
    footer,
  };
}
