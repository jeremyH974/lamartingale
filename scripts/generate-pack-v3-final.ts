/**
 * scripts/generate-pack-v3-final.ts — Pack final Phase 8.4.
 *
 * Diff avec generate-pack-v2.ts :
 *  - L2 quotes : prises depuis `pack-pilote-stefani-orso-v3-l2-fix/<slug>/quotes.json`
 *    (output Phase 8.3 avec timestamps fiables, segment_index validés).
 *  - L1 / L3 / L4 / L5 : prises depuis `pack-pilote-stefani-orso/<slug>/0X-*.md`
 *    (livrables inchangés Phase 8 — pas de re-LLM).
 *
 * Output : `pack-pilote-stefani-orso-v3-final/` avec docx/xlsx/markdown via le
 * pipeline produceClientPack standard (pas de format ad-hoc, pas de warnings
 * auto-éval, pas de footer dev — garde-fou test output-formatters).
 *
 * Aucun appel LLM. Coût : $0.
 *
 * Usage : npx tsx scripts/generate-pack-v3-final.ts
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { FileLoader } from '../engine/config/loaders/fileLoader';
import { buildEpisode, produceClientPack } from '../engine/output/produceClientPack';
import { MarkdownFormatter } from '../engine/output/formats/markdownFormatter';
import {
  parseBriefAnnexe,
  parseCrossRefs,
  parseKeyMoments,
  parseNewsletter,
  parseQuotes,
} from '../engine/output/parsers/markdownParser';
import type { FormatterContext, Livrable, QuotesLivrable } from '../engine/output/types';

const SOURCE_V1 = resolve(
  'experiments',
  'autonomy-session-2026-04-28',
  'pack-pilote-stefani-orso',
);
const SOURCE_V3_L2 = resolve(
  'experiments',
  'autonomy-session-2026-04-28',
  'pack-pilote-stefani-orso-v3-l2-fix',
);
const OUTPUT_ROOT = resolve(
  'experiments',
  'autonomy-session-2026-04-28',
  'pack-pilote-stefani-orso-v3-final',
);

const EPISODES = [
  { slug: 'plais-platform-sh', displayRef: 'GDIY #266 Frédéric Plais (Platform.sh)' },
  { slug: 'boissenot-pokemon', displayRef: 'La Martingale #174 Alexandre Boissenot (Pokémon)' },
  { slug: 'nooz-optics', displayRef: 'Le Panier #128 Alex Doolaeghe (Nooz Optics)' },
  { slug: 'veyrat-stoik', displayRef: 'Finscale #107 Jules Veyrat (Stoïk)' },
];

const README = `# Pack pilote V3 — Sillon × Matthieu Stefani / Orso Media

> Phase 8 : intégrité timestamps L2 corrigée (extractQuotes refactor).
> Généré le ${new Date().toISOString().slice(0, 10)} par \`scripts/generate-pack-v3-final.ts\`.

## Contenu du pack

Pour chaque épisode (4 dossiers) :
- \`01-key-moments.xlsx\` — 4-5 moments clippables avec timestamps + saliency
- \`02-quotes.xlsx\` — citations verbatim social-ready (timestamps validés segment_index)
- \`03-cross-refs-by-lens.docx\` — cross-références par angle éditorial
- \`04-newsletter.docx\` — article édito ~400 mots
- \`05-brief-annexe.docx\` — brief synthèse cross-catalogue

---

*Sillon — production éditoriale cross-corpus écosystème Orso.*
`;

/**
 * Construit un QuotesLivrable depuis le quotes.json Phase 8.3.
 * Le json contient l'output Quote[] de extractQuotes (start_seconds,
 * end_seconds, etc.) — on le mappe vers le shape QuotesLivrable.
 */
function buildQuotesLivrableFromJson(
  jsonPath: string,
  displayRef: string,
): QuotesLivrable {
  const data = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  const fmtTime = (s: number): string => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };
  const quotes = data.quotes.map((q: any, i: number) => ({
    numero: i + 1,
    text: q.text,
    auteur: q.author,
    timestamp: fmtTime(q.start_seconds),
    plateformes: q.platform_fit,
    pourquoi: q.rationale,
  }));
  return {
    type: 'L2_quotes',
    title: `Quotes — ${displayRef}`,
    episodeRef: displayRef,
    subtitle: `${quotes.length} citations verbatim, prêtes pour réseaux sociaux`,
    quotes,
  };
}

async function main() {
  if (!existsSync(OUTPUT_ROOT)) mkdirSync(OUTPUT_ROOT, { recursive: true });

  const loader = new FileLoader();
  const config = await loader.loadClientConfig('stefani-orso');

  const episodes = EPISODES.map((e) => {
    const livrables: Livrable[] = [
      parseKeyMoments(readFileSync(resolve(SOURCE_V1, e.slug, '01-key-moments.md'), 'utf-8')),
      buildQuotesLivrableFromJson(
        resolve(SOURCE_V3_L2, e.slug, 'quotes.json'),
        e.displayRef,
      ),
      parseCrossRefs(readFileSync(resolve(SOURCE_V1, e.slug, '03-cross-refs-by-lens.md'), 'utf-8')),
      parseNewsletter(readFileSync(resolve(SOURCE_V1, e.slug, '04-newsletter.md'), 'utf-8')),
      parseBriefAnnexe(readFileSync(resolve(SOURCE_V1, e.slug, '05-brief-annexe.md'), 'utf-8')),
    ];
    const l2 = livrables[1] as QuotesLivrable;
    console.log(`  ${e.slug} : ${l2.quotes.length} quotes L2 fix Phase 8`);
    return buildEpisode(e.slug, e.displayRef, livrables);
  });

  console.log(`\nParsed ${episodes.length} episodes × ${episodes[0].livrables.length} livrables.`);

  const result = await produceClientPack(config, {
    packId: 'phase8-v3-final',
    episodes,
    channelConfig: {
      outputDir: OUTPUT_ROOT,
      readme: README,
    },
    formatterContextOverride: {
      brandPrimary: '004CFF',
    },
  });

  for (const [slug, files] of result.files) {
    const epDir = resolve(OUTPUT_ROOT, slug);
    if (!existsSync(epDir)) mkdirSync(epDir, { recursive: true });
    for (const f of files) {
      const path = resolve(epDir, f.filename);
      if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, f.buffer);
      console.log(`  ${slug}/${f.filename} (${(f.buffer.length / 1024).toFixed(1)} KB)`);
    }
  }
  writeFileSync(resolve(OUTPUT_ROOT, 'README.md'), README);

  console.log('\nPack V3 final généré :');
  console.log(`  ZIP        : ${result.publishLocation}`);
  console.log(`  Fichiers   : ${OUTPUT_ROOT}/`);

  // Mirror Markdown : pour audit-timestamps.js qui parse uniquement des .md.
  // Pack non livré au client (config L2=xlsx, L3-5=docx) — usage interne audit.
  const MD_AUDIT_ROOT = OUTPUT_ROOT + '-md-audit';
  if (!existsSync(MD_AUDIT_ROOT)) mkdirSync(MD_AUDIT_ROOT, { recursive: true });
  const mdFormatter = new MarkdownFormatter();
  const ctx: FormatterContext = {
    clientId: config.client_id,
    clientDisplayName: config.display_name,
    generatedAt: new Date().toISOString(),
  };
  for (const ep of episodes) {
    const epDir = resolve(MD_AUDIT_ROOT, ep.slug);
    if (!existsSync(epDir)) mkdirSync(epDir, { recursive: true });
    for (const liv of ep.livrables) {
      const out = await mdFormatter.formatLivrable(liv, ctx);
      writeFileSync(resolve(epDir, out.filename), out.buffer);
    }
  }
  console.log(`\n  Mirror Markdown audit : ${MD_AUDIT_ROOT}/`);
}

main().catch((err) => {
  console.error('Pack V3 final generation failed:', err);
  process.exit(1);
});
