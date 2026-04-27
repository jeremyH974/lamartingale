/**
 * Phase 6 — anti-hallucination check par épisode.
 *
 * Pour chaque épisode pilote :
 *   - Lit `_summary.json` du run (selections explicit per lens)
 *   - Pour chaque target_episode_id cité dans L3 → vérifie présence en BDD
 *   - Lit le transcript source + livrables L4/L5 → grep des chiffres
 *     (pattern: \d+[%kKMm€])
 *   - Compare chiffres livrable vs chiffres transcript : signal les outliers
 */

import dotenv from 'dotenv';
dotenv.config({ override: true });

import { promises as fs } from 'fs';
import { join } from 'path';
import { neon } from '@neondatabase/serverless';

const ROOT = join(process.cwd(), 'experiments/autonomy-session-2026-04-28');
const TRANSCRIPTS = join(ROOT, 'transcripts');

interface RunDir {
  slug: string;
  dir: string;
  transcriptFile: string;
  outSlug: string;
}

const RUNS: RunDir[] = [
  { slug: 'plais', dir: 'phase5-plais-v5', transcriptFile: 'gdiy-266.json', outSlug: 'plais-platform-sh' },
  { slug: 'boissenot', dir: 'phase6-boissenot', transcriptFile: 'lamartingale-174.json', outSlug: 'boissenot-pokemon' },
  { slug: 'nooz', dir: 'phase6-nooz', transcriptFile: 'lepanier-128.json', outSlug: 'nooz-optics' },
  { slug: 'veyrat', dir: 'phase6-veyrat', transcriptFile: 'finscale-107.json', outSlug: 'veyrat-stoik' },
];

const NUMERIC_RE = /\d+(?:[\.,]\d+)?\s*(?:%|€|euros?|millions?|milliards?|M\b|k\b|K\b|m€|M€|MEUR|kEUR|x\d+)/gi;

const sql = neon(process.env.DATABASE_URL!);

(async () => {
  const reports: any[] = [];

  for (const run of RUNS) {
    const summaryPath = join(ROOT, run.dir, '_summary.json');
    const summaryRaw = await fs.readFile(summaryPath, 'utf-8');
    const summary = JSON.parse(summaryRaw);

    // 1) Cross-ref episode existence check
    const crossRefSummary = summary.livrables?.L3_cross_refs;
    const seenEps = new Set<string>();
    if (crossRefSummary?.per_lens_validator) {
      // les ids viennent en réalité de explicitSelectionsByLens — pas dans summary.
      // Lire directement le fichier cross-refs pour extraire les target_episode_id.
    }

    // Extract from L3 markdown : the format inserts "Podcast : <id> · invité"
    const l3Path = join(ROOT, run.dir, `${run.outSlug}-cross-refs-by-lens.md`);
    const l3Md = await fs.readFile(l3Path, 'utf-8');
    // Pattern : "*Podcast : tenant · invité"
    const podcastMatches = [...l3Md.matchAll(/Podcast\s*:\s*(\w+)\s*[·\-]\s*invit/g)];
    const podcastsCited = new Set(podcastMatches.map((m) => m[1]));

    // Pour vérifier les épisodes cités précisément, on parse le titre marqué "### → <title>"
    const titleMatches = [...l3Md.matchAll(/### →\s*(.+?)\n/g)];
    const titlesCited = titleMatches.map((m) => m[1].trim());

    // BDD check : pour chaque title cité, vérifier qu'il existe en BDD
    const titlesExisting: string[] = [];
    const titlesMissing: string[] = [];
    for (const t of titlesCited) {
      const rows = (await sql`
        SELECT tenant_id, episode_number FROM episodes WHERE title = ${t} LIMIT 1
      `) as Array<{ tenant_id: string; episode_number: number }>;
      if (rows.length > 0) {
        titlesExisting.push(`${t} (${rows[0].tenant_id} #${rows[0].episode_number})`);
      } else {
        titlesMissing.push(t);
      }
    }

    // 2) Numeric hallucination check : compare numbers in L4 + L5 vs transcript
    const transcriptRaw = await fs.readFile(join(TRANSCRIPTS, run.transcriptFile), 'utf-8');
    const transcriptText = JSON.parse(transcriptRaw).full_text as string;
    const transcriptNumeric = new Set<string>();
    for (const m of transcriptText.matchAll(NUMERIC_RE)) {
      transcriptNumeric.add(m[0].toLowerCase().replace(/\s+/g, ''));
    }

    const checkLivrable = async (subPath: string) => {
      const text = await fs.readFile(join(ROOT, run.dir, subPath), 'utf-8');
      const numeric = [...text.matchAll(NUMERIC_RE)].map((m) => m[0]);
      const suspect: string[] = [];
      for (const n of numeric) {
        const norm = n.toLowerCase().replace(/\s+/g, '');
        if (transcriptNumeric.has(norm)) continue;
        // Variantes légères : retire ".0", remplace virgule, etc.
        const norm2 = norm.replace(/[\.,]0+/g, '');
        if (transcriptNumeric.has(norm2)) continue;
        // Tolère si le bare number est dans le transcript
        const bare = n.replace(/[^\d]/g, '');
        if (bare && transcriptText.includes(bare)) continue;
        suspect.push(n);
      }
      return { numeric, suspect };
    };

    const newsletterCheck = await checkLivrable(`${run.outSlug}-newsletter.md`);
    const briefCheck = await checkLivrable(`${run.outSlug}-brief-annexe.md`);

    reports.push({
      slug: run.slug,
      L3: {
        titles_cited: titlesCited.length,
        titles_existing: titlesExisting.length,
        titles_missing: titlesMissing,
        podcasts_cited: [...podcastsCited],
      },
      L4_newsletter: {
        numeric_count: newsletterCheck.numeric.length,
        suspect_numbers: newsletterCheck.suspect,
      },
      L5_brief_annexe: {
        numeric_count: briefCheck.numeric.length,
        suspect_numbers: briefCheck.suspect,
      },
    });
  }

  console.log(JSON.stringify(reports, null, 2));
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
