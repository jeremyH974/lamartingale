/**
 * Auto-taxonomy — génère une taxonomie de N piliers pour un tenant dont
 * config.taxonomy.mode === 'auto'. Utilise Claude Haiku (cheap, batch).
 *
 * Pipeline :
 *   1. Sample ~80 épisodes du tenant (titres + invités) pour amorcer.
 *   2. Claude Haiku propose N piliers (id, name, description, icon, color).
 *   3. Insère/upsert les piliers dans `taxonomy`.
 *   4. Classifie chaque épisode en batch dans un des piliers (Haiku).
 *   5. UPDATE episodes.pillar pour le tenant.
 *
 * Usage :
 *   PODCAST_ID=gdiy npx tsx src/ai/auto-taxonomy.ts
 *   PODCAST_ID=gdiy npx tsx src/ai/auto-taxonomy.ts --dry   # pas d'update DB
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
const N_PILLARS = cfg.taxonomy.autoPillarCount || 10;
const BATCH_SIZE = 50;

function parseJsonLoose(s: string): any {
  const trimmed = s.replace(/^```json\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  // Tolère du texte avant/après le JSON.
  const firstBrace = trimmed.indexOf('{');
  const firstBracket = trimmed.indexOf('[');
  const start = firstBrace === -1 ? firstBracket :
                firstBracket === -1 ? firstBrace :
                Math.min(firstBrace, firstBracket);
  if (start === -1) throw new Error('no JSON found in response');
  const end = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
  return JSON.parse(trimmed.slice(start, end + 1));
}

async function proposePillars(samples: { episode_number: number; title: string; guest: string | null }[]) {
  const sampleText = samples
    .map((s) => `#${s.episode_number} — ${s.title}${s.guest ? ` (invité: ${s.guest})` : ''}`)
    .join('\n');

  const prompt = `Tu es un data-scientist qui conçoit la taxonomie d'un podcast.

Voici un échantillon de ${samples.length} épisodes du podcast "${cfg.name}" :

${sampleText}

Propose exactement ${N_PILLARS} piliers thématiques qui couvrent l'ensemble du catalogue.
Chaque pilier doit être :
- distinct des autres (faible chevauchement)
- suffisamment large pour contenir au moins 20 épisodes
- exprimé en français

Réponds UNIQUEMENT en JSON valide, sans markdown :
{
  "pillars": [
    { "id": "UPPER_SNAKE", "name": "Nom court en français", "description": "Une phrase décrivant le pilier", "icon": "lucide-icon-name", "color": "#RRGGBB" }
  ]
}`;

  const { text } = await generateText({
    model: getLLMFast(),
    prompt,
    maxOutputTokens: 2000,
    temperature: 0.3,
  });

  const parsed = parseJsonLoose(text);
  if (!Array.isArray(parsed.pillars) || parsed.pillars.length === 0) {
    throw new Error(`LLM did not return pillars: ${text.slice(0, 200)}`);
  }
  return parsed.pillars as { id: string; name: string; description: string; icon: string; color: string }[];
}

async function classifyBatch(
  batch: { episode_number: number; title: string; guest: string | null }[],
  pillars: { id: string; name: string }[],
) {
  const pillarList = pillars.map((p) => `- ${p.id}: ${p.name}`).join('\n');
  const items = batch.map((b) => `#${b.episode_number} — ${b.title}${b.guest ? ` (${b.guest})` : ''}`).join('\n');

  const prompt = `Classifie chaque épisode dans UN des piliers ci-dessous.

Piliers disponibles :
${pillarList}

Épisodes à classifier :
${items}

Réponds UNIQUEMENT en JSON (array), chaque entrée = {"episode_number": N, "pillar": "PILLAR_ID"} :`;

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
  console.log(`[AUTO-TAXONOMY] tenant=${TENANT} podcast=${cfg.id} model=${getModelId('fast')}${DRY ? ' (DRY)' : ''}`);

  if (cfg.taxonomy.mode !== 'auto') {
    console.log(`  [skip] mode=${cfg.taxonomy.mode} (not 'auto')`);
    return;
  }

  // Charge épisodes du tenant
  const episodes = (await sql`
    SELECT episode_number, title, guest
    FROM episodes
    WHERE tenant_id = ${TENANT} AND episode_number IS NOT NULL
    ORDER BY episode_number DESC
  `) as { episode_number: number; title: string; guest: string | null }[];
  console.log(`  Episodes: ${episodes.length}`);
  if (episodes.length < 10) {
    console.warn('  [abort] pas assez d\'épisodes');
    return;
  }

  // 1. Sample stratifié — 80 titres (récent + ancien + milieu)
  const sampleSize = Math.min(80, episodes.length);
  const step = Math.max(1, Math.floor(episodes.length / sampleSize));
  const samples = [];
  for (let i = 0; i < episodes.length && samples.length < sampleSize; i += step) {
    samples.push(episodes[i]);
  }
  console.log(`  Sample for pillar design: ${samples.length} episodes`);

  // 2. Propose pillars
  console.log(`  [1/3] Claude Haiku: design ${N_PILLARS} pillars…`);
  const pillars = await proposePillars(samples);
  console.log(`  Proposed pillars:`);
  for (const p of pillars) console.log(`    - ${p.id}: ${p.name} ${p.color}`);

  // 3. Upsert pillars in taxonomy
  if (!DRY) {
    for (const p of pillars) {
      await sql`
        INSERT INTO taxonomy (tenant_id, pillar, name, color, icon)
        VALUES (${TENANT}, ${p.id}, ${p.name}, ${p.color}, ${p.icon})
        ON CONFLICT (tenant_id, pillar) DO UPDATE SET
          name = EXCLUDED.name, color = EXCLUDED.color, icon = EXCLUDED.icon
      `;
    }
    console.log(`  [2/3] ${pillars.length} pillars upserted`);
  }

  // 4. Classify in batches
  console.log(`  [3/3] Classify ${episodes.length} episodes (batches of ${BATCH_SIZE})…`);
  const assignments = new Map<number, string>();
  for (let i = 0; i < episodes.length; i += BATCH_SIZE) {
    const batch = episodes.slice(i, i + BATCH_SIZE);
    try {
      const res = await classifyBatch(batch, pillars);
      for (const r of res) {
        if (typeof r.episode_number === 'number' && typeof r.pillar === 'string') {
          assignments.set(r.episode_number, r.pillar);
        }
      }
      console.log(`    batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(episodes.length / BATCH_SIZE)} — cumul=${assignments.size}`);
    } catch (e: any) {
      console.warn(`    batch ${i}: FAIL — ${e?.message}`);
    }
  }

  // 5. Update episodes
  if (!DRY) {
    let updated = 0;
    const validIds = new Set(pillars.map((p) => p.id));
    for (const [epNum, pillarId] of assignments) {
      if (!validIds.has(pillarId)) continue;
      await sql`
        UPDATE episodes SET pillar = ${pillarId}
        WHERE tenant_id = ${TENANT} AND episode_number = ${epNum}
      `;
      updated++;
    }
    console.log(`\n[AUTO-TAXONOMY] ${updated}/${episodes.length} episodes re-pilared`);
  } else {
    console.log(`\n[DRY] ${assignments.size}/${episodes.length} assignments computed (not written)`);
  }
}

main().catch((e) => { console.error('[AUTO-TAXONOMY] fatal', e); process.exit(1); });
