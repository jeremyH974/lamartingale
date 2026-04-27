// engine/output/formats/markdownFormatter.ts — Markdown passthrough.
//
// Phase 7a : V1 du MarkdownFormatter. Reproduit le format Markdown actuel
// du pack pilote sandbox à partir d'un Livrable structuré. Utile pour
// régénérer un pack 100% Markdown depuis le pipeline V2 (réversibilité).

import { MIME_TYPES, type FormatterContext, type FormatterOutput, type Livrable, type LivrableType } from '../types';
import type { OutputFormatter } from './types';

const SUPPORTED: readonly LivrableType[] = [
  'L1_keyMoments',
  'L2_quotes',
  'L3_crossRefs',
  'L4_newsletter',
  'L5_briefAnnexe',
];

export class MarkdownFormatter implements OutputFormatter {
  readonly format = 'markdown' as const;
  readonly supportedLivrables = SUPPORTED;

  async formatLivrable(
    livrable: Livrable,
    _context: FormatterContext,
  ): Promise<FormatterOutput> {
    const content = renderToMarkdown(livrable);
    return {
      filename: filenameFor(livrable.type, 'md'),
      buffer: Buffer.from(content, 'utf-8'),
      mimeType: MIME_TYPES.markdown,
    };
  }
}

function filenameFor(type: LivrableType, ext: string): string {
  const map: Record<LivrableType, string> = {
    L1_keyMoments: '01-key-moments',
    L2_quotes: '02-quotes',
    L3_crossRefs: '03-cross-refs-by-lens',
    L4_newsletter: '04-newsletter',
    L5_briefAnnexe: '05-brief-annexe',
  };
  return `${map[type]}.${ext}`;
}

export function getFilenameForLivrable(type: LivrableType, format: 'md' | 'docx' | 'xlsx' | 'pdf'): string {
  return filenameFor(type, format);
}

function renderToMarkdown(livrable: Livrable): string {
  switch (livrable.type) {
    case 'L1_keyMoments':
      return renderKeyMoments(livrable);
    case 'L2_quotes':
      return renderQuotes(livrable);
    case 'L3_crossRefs':
      return renderCrossRefs(livrable);
    case 'L4_newsletter':
      return renderNewsletter(livrable);
    case 'L5_briefAnnexe':
      return renderBriefAnnexe(livrable);
  }
}

function renderKeyMoments(l: import('../types').KeyMomentsLivrable): string {
  const lines: string[] = [];
  lines.push(`# 🎙️ ${l.title}`);
  lines.push('');
  if (l.subtitle) {
    lines.push(`*${l.subtitle}*`);
    lines.push('');
  }
  for (const m of l.moments) {
    lines.push(`## ${m.numero}. ${m.titre}`);
    lines.push(`**${m.timestampStart}–${m.timestampEnd}** · saliency ${m.saliency.toFixed(2)}`);
    lines.push('');
    lines.push(`> ${m.quote}`);
    lines.push('');
    lines.push(`**Pourquoi c'est saillant** : ${m.pourquoi}`);
    lines.push('');
  }
  return lines.join('\n').trim() + '\n';
}

function renderQuotes(l: import('../types').QuotesLivrable): string {
  const lines: string[] = [];
  lines.push(`# 💬 ${l.title}`);
  lines.push('');
  if (l.subtitle) {
    lines.push(`*${l.subtitle}*`);
    lines.push('');
  }
  for (const q of l.quotes) {
    lines.push(`## Citation ${q.numero}`);
    lines.push('');
    lines.push(`> *« ${q.text} »*`);
    lines.push(`> — **${q.auteur}** · ${q.timestamp}`);
    lines.push('');
    lines.push(`**Plateforme(s)** : ${q.plateformes.join(', ')}`);
    lines.push(`**Pourquoi cette citation** : ${q.pourquoi}`);
    lines.push('');
  }
  lines.push('---');
  lines.push('');
  lines.push('*Sillon — production éditoriale cross-corpus écosystème Orso.*');
  return lines.join('\n').trim() + '\n';
}

function renderCrossRefs(l: import('../types').CrossRefsLivrable): string {
  const lines: string[] = [];
  lines.push(`# 🔗 ${l.title}`);
  lines.push('');
  if (l.filteringNote) {
    lines.push(`> ${l.filteringNote}`);
    lines.push('');
  }
  for (const section of l.sections) {
    lines.push(`## ${section.lensIntro}`);
    lines.push('');
    for (const ref of section.refs) {
      lines.push(`### → ${ref.episodeNumber} — ${ref.guestName} — *${ref.episodeTitle}* (${ref.podcastSource})`);
      lines.push('');
      for (const p of ref.bodyParagraphs) {
        lines.push(p);
        lines.push('');
      }
      lines.push('---');
      lines.push('');
    }
  }
  if (l.skippedNote) {
    lines.push(`*${l.skippedNote}*`);
  }
  return lines.join('\n').trim() + '\n';
}

function renderNewsletter(l: import('../types').NewsletterLivrable): string {
  const lines: string[] = [];
  lines.push(`# 📰 ${l.title}`);
  lines.push('');
  lines.push(`# ${l.newsletterTitle}`);
  lines.push('');
  for (let i = 0; i < l.sections.length; i++) {
    for (const p of l.sections[i]) {
      lines.push(p);
      lines.push('');
    }
    if (i < l.sections.length - 1) {
      lines.push('---');
      lines.push('');
    }
  }
  if (l.footer) {
    lines.push('---');
    lines.push('');
    lines.push(`*${l.footer}*`);
  }
  return lines.join('\n').trim() + '\n';
}

function renderBriefAnnexe(l: import('../types').BriefAnnexeLivrable): string {
  const lines: string[] = [];
  lines.push(`# 📎 ${l.title}`);
  lines.push('');
  lines.push(l.intro);
  lines.push('');
  for (const section of l.sections) {
    lines.push('---');
    lines.push('');
    lines.push(`**${section.heading}**`);
    lines.push('');
    for (const p of section.paragraphs) {
      lines.push(p);
      lines.push('');
    }
  }
  if (l.skippedNote) {
    lines.push(`*Note : ${l.skippedNote}*`);
    lines.push('');
  }
  if (l.footer) {
    lines.push('---');
    lines.push('');
    lines.push(`*${l.footer}*`);
  }
  return lines.join('\n').trim() + '\n';
}
