/**
 * scripts/generate-pack-v2.ts — génère le pack pilote V2 (formats pro)
 * sur les 4 épisodes Stefani-Orso, à partir des .md sandbox actuels.
 *
 * Phase 7a (brief 2026-04-30). Aucun appel LLM. Lit les Markdown source dans
 * `experiments/.../pack-pilote-stefani-orso/{slug}/0X-*.md`, parse en
 * Livrable structuré, dispatch via `produceClientPack` (channel local-zip).
 *
 * Sortie : un dossier expérimental `experiments/.../pack-pilote-stefani-orso-v2/`
 * + un .zip livrable. Les fichiers individuels (xlsx, docx) sont aussi
 * écrits dans le dossier pour validation manuelle (ouverture Excel/Word).
 *
 * Usage :
 *   npx tsx scripts/generate-pack-v2.ts
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { FileLoader } from '../engine/config/loaders/fileLoader';
import { buildEpisode, produceClientPack } from '../engine/output/produceClientPack';
import {
  parseBriefAnnexe,
  parseCrossRefs,
  parseKeyMoments,
  parseNewsletter,
  parseQuotes,
} from '../engine/output/parsers/markdownParser';
import type { Livrable } from '../engine/output/types';

const SOURCE_ROOT = resolve(
  'experiments',
  'autonomy-session-2026-04-28',
  'pack-pilote-stefani-orso',
);
const OUTPUT_ROOT = resolve(
  'experiments',
  'autonomy-session-2026-04-28',
  'pack-pilote-stefani-orso-v2',
);

const EPISODES = [
  { slug: 'plais-platform-sh', displayRef: 'GDIY #266 Frédéric Plais (Platform.sh)' },
  { slug: 'boissenot-pokemon', displayRef: 'La Martingale #174 Alexandre Boissenot (Pokémon)' },
  { slug: 'nooz-optics', displayRef: 'Le Panier #128 Alex Doolaeghe (Nooz Optics)' },
  { slug: 'veyrat-stoik', displayRef: 'GDIY ép. Jules Veyrat (Stoïk)' },
];

const README = `# Pack pilote V2 — Sillon × Matthieu Stefani / Orso Media

> Phase 7a : formats pro (docx + xlsx) pour les 4 épisodes pilote.
> Généré le ${new Date().toISOString().slice(0, 10)} par \`scripts/generate-pack-v2.ts\`.

## Contenu du pack

Pour chaque épisode (4 dossiers) :
- \`01-key-moments.xlsx\` — 4-5 moments clippables avec timestamps + saliency + une colonne "Lien vidéo" prête pour Phase 7b
- \`02-quotes.xlsx\` — 5 citations verbatim social-ready (plateformes suggérées + colonne "Lien micro-clip" Phase 7b)
- \`03-cross-refs-by-lens.docx\` — cross-références par angle éditorial (édition collaborative Word)
- \`04-newsletter.docx\` — article édito ~400 mots
- \`05-brief-annexe.docx\` — brief synthèse cross-catalogue

## Cohérence avec le pack Markdown précédent

Le contenu textuel est strictement identique. Cette V2 transforme uniquement
les formats pour faciliter l'exploitation (community manager pour xlsx,
édition Word pour docx) — aucun appel LLM, aucune régénération de contenu.

## Validation visuelle suggérée

1. Ouvrir 2-3 .docx dans Word → vérifier titres, gras/italique, footers
2. Ouvrir 2-3 .xlsx dans Excel → vérifier headers stylés, freeze panes, largeurs

---

*Sillon — production éditoriale cross-corpus écosystème Orso.*
`;

async function main() {
  if (!existsSync(OUTPUT_ROOT)) mkdirSync(OUTPUT_ROOT, { recursive: true });

  const loader = new FileLoader();
  const config = await loader.loadClientConfig('stefani-orso');

  const episodes = EPISODES.map((e) => {
    const livrables: Livrable[] = [
      parseKeyMoments(readFileSync(resolve(SOURCE_ROOT, e.slug, '01-key-moments.md'), 'utf-8')),
      parseQuotes(readFileSync(resolve(SOURCE_ROOT, e.slug, '02-quotes.md'), 'utf-8')),
      parseCrossRefs(readFileSync(resolve(SOURCE_ROOT, e.slug, '03-cross-refs-by-lens.md'), 'utf-8')),
      parseNewsletter(readFileSync(resolve(SOURCE_ROOT, e.slug, '04-newsletter.md'), 'utf-8')),
      parseBriefAnnexe(readFileSync(resolve(SOURCE_ROOT, e.slug, '05-brief-annexe.md'), 'utf-8')),
    ];
    return buildEpisode(e.slug, e.displayRef, livrables);
  });

  console.log(`Parsed ${episodes.length} episodes × ${episodes[0].livrables.length} livrables.`);

  const result = await produceClientPack(config, {
    packId: 'phase7a-v2',
    episodes,
    channelConfig: {
      outputDir: OUTPUT_ROOT,
      readme: README,
    },
    formatterContextOverride: {
      brandPrimary: '004CFF', // bleu La Martingale (proche brand Stefani)
    },
  });

  // Écrire les fichiers individuels dans le dossier (en plus du .zip)
  // pour validation visuelle directe sans extraction.
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

  console.log('\nPack V2 généré :');
  console.log(`  ZIP        : ${result.publishLocation}`);
  console.log(`  Fichiers   : ${OUTPUT_ROOT}/`);
  console.log(`  Métadonnées:`, result.publishMetadata);
}

main().catch((err) => {
  console.error('Pack V2 generation failed:', err);
  process.exit(1);
});
