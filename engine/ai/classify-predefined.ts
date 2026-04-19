/**
 * Reclassifie les épisodes d'un tenant dans une taxonomie PRÉDÉFINIE
 * (cfg.taxonomy.mode === 'predefined'). Utilisé quand la taxonomie vient
 * directement du site canonique du podcast (ex. GDIY : 19 catégories
 * issues de gdiy.fr — pas d'auto-clustering LLM).
 *
 * Pipeline :
 *   1. Upsert les piliers depuis la config vers `taxonomy`.
 *   2. (Optionnel) Supprime les piliers obsolètes du tenant.
 *   3. Classifie chaque épisode en batch via Claude Haiku.
 *   4. UPDATE episodes.pillar = <pillar_id>.
 *
 * Usage :
 *   PODCAST_ID=gdiy npx tsx src/ai/classify-predefined.ts
 *   PODCAST_ID=gdiy npx tsx src/ai/classify-predefined.ts --dry
 *   PODCAST_ID=gdiy npx tsx src/ai/classify-predefined.ts --prune   # supprime les piliers absents de la config
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { generateText } from 'ai';
import { getLLMFast, getModelId } from './llm';
import { getConfig } from '../config';

const sql = neon(process.env.DATABASE_URL!);
const cfg = getConfig();
const TENANT = cfg.database.tenantId;
const DRY = process.argv.includes('--dry');
const PRUNE = process.argv.includes('--prune');
const BATCH_SIZE = 50;

function parseJsonLoose(s: string): any {
  const trimmed = s.replace(/^```json\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const firstBrace = trimmed.indexOf('{');
  const firstBracket = trimmed.indexOf('[');
  const start = firstBrace === -1 ? firstBracket :
                firstBracket === -1 ? firstBrace :
                Math.min(firstBrace, firstBracket);
  if (start === -1) throw new Error('no JSON found in response');
  const end = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
  return JSON.parse(trimmed.slice(start, end + 1));
}

async function classifyBatch(
  batch: { episode_number: number; title: string; guest: string | null }[],
  pillars: { id: string; name: string }[],
) {
  const pillarList = pillars.map((p) => `- ${p.id}: ${p.name}`).join('\n');
  const items = batch
    .map((b) => `#${b.episode_number} — ${b.title}${b.guest ? ` (${b.guest})` : ''}`)
    .join('\n');

  const prompt = `Tu classifies des épisodes de podcast dans UNE catégorie parmi la liste.

Catégories disponibles :
${pillarList}

Épisodes à classifier :
${items}

Règles :
- choisis UNE seule catégorie par épisode (la plus pertinente)
- si un épisode ne colle à aucune catégorie, utilise "BUSINESS" comme défaut
- réponds UNIQUEMENT en JSON (array), chaque entrée = {"episode_number": N, "pillar": "PILLAR_ID"}`;

  const { text } = await generateText({
    model: getLLMFast(),
    prompt,
    maxOutputTokens: 4000,
    temperature: 0.1,
  });

  const parsed = parseJsonLoose(text);
  const arr = Array.isArray(parsed) ? parsed : parsed.classifications || parsed.episodes || [];
  if (!Array.isArray(arr)) throw new Error(`Invalid classification response: ${text.slice(0, 200)}`);
  return arr as { episode_number: number; pillar: string }[];
}

async function main() {
  console.log(`[CLASSIFY-PREDEFINED] tenant=${TENANT} podcast=${cfg.id} model=${getModelId('fast')}${DRY ? ' (DRY)' : ''}`);

  if (cfg.taxonomy.mode !== 'predefined') {
    console.log(`  [abort] cfg.taxonomy.mode=${cfg.taxonomy.mode} — utilise src/ai/auto-taxonomy.ts à la place`);
    return;
  }
  const pillars = cfg.taxonomy.pillars || [];
  if (pillars.length === 0) {
    console.log(`  [abort] cfg.taxonomy.pillars vide`);
    return;
  }
  console.log(`  Pillars from config: ${pillars.length}`);
  for (const p of pillars) console.log(`    - ${p.id}: ${p.name}`);

  // 1. Upsert piliers
  if (!DRY) {
    for (const p of pillars) {
      await sql`
        INSERT INTO taxonomy (tenant_id, pillar, name, color, icon)
        VALUES (${TENANT}, ${p.id}, ${p.name}, ${p.color}, ${p.icon || null})
        ON CONFLICT (tenant_id, pillar) DO UPDATE SET
          name = EXCLUDED.name, color = EXCLUDED.color, icon = EXCLUDED.icon
      `;
    }
    console.log(`  [upsert] ${pillars.length} piliers OK`);
  }

  // 2. Prune piliers obsolètes (option)
  if (PRUNE && !DRY) {
    const validIds = pillars.map((p) => p.id);
    const deleted = await sql`
      DELETE FROM taxonomy
      WHERE tenant_id = ${TENANT} AND pillar <> ALL(${validIds})
      RETURNING pillar
    ` as any[];
    if (deleted.length > 0) {
      console.log(`  [prune] supprimé ${deleted.length} piliers obsolètes: ${deleted.map((d: any) => d.pillar).join(', ')}`);
    }
  }

  // 3. Episodes
  const episodes = (await sql`
    SELECT episode_number, title, guest
    FROM episodes
    WHERE tenant_id = ${TENANT} AND episode_number IS NOT NULL
    ORDER BY episode_number DESC
  `) as { episode_number: number; title: string; guest: string | null }[];
  console.log(`  Episodes: ${episodes.length}`);
  if (episodes.length === 0) return;

  // 4. Classify batches
  const assignments = new Map<number, string>();
  const validIds = new Set(pillars.map((p) => p.id));
  for (let i = 0; i < episodes.length; i += BATCH_SIZE) {
    const batch = episodes.slice(i, i + BATCH_SIZE);
    try {
      const res = await classifyBatch(batch, pillars);
      for (const r of res) {
        if (typeof r.episode_number === 'number' && typeof r.pillar === 'string' && validIds.has(r.pillar)) {
          assignments.set(r.episode_number, r.pillar);
        }
      }
      console.log(`    batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(episodes.length / BATCH_SIZE)} — cumul=${assignments.size}`);
    } catch (e: any) {
      console.warn(`    batch ${i}: FAIL — ${e?.message}`);
    }
  }

  // 5. Update
  if (!DRY) {
    let updated = 0;
    for (const [epNum, pillarId] of assignments) {
      await sql`
        UPDATE episodes SET pillar = ${pillarId}
        WHERE tenant_id = ${TENANT} AND episode_number = ${epNum}
      `;
      updated++;
    }
    console.log(`\n[CLASSIFY-PREDEFINED] ${updated}/${episodes.length} episodes re-pilared`);
  } else {
    console.log(`\n[DRY] ${assignments.size}/${episodes.length} assignments computed (not written)`);
  }
}

main().catch((e) => { console.error('[CLASSIFY-PREDEFINED] fatal', e); process.exit(1); });
