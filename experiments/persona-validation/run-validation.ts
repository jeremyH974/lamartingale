/**
 * Validation persona des 3 angles différenciants Sillon.
 *
 * 3 angles (Inoxtag simulation 2026-04-27) × 3 personas (Orso Media) = 9 appels Sonnet 4.6.
 * Outputs JSON sauvés dans outputs/{angle_id}-{persona_slug}.json.
 *
 * Usage : npx tsx experiments/persona-validation/run-validation.ts
 */

import { config as loadDotenv } from 'dotenv';
loadDotenv({ override: true });
import { generateText } from 'ai';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Import dynamique APRÈS dotenv pour que llm.ts capture ANTHROPIC_API_KEY au chargement.
let getLLM: () => any;
let getModelId: (which?: 'main' | 'fast') => string;

const ROOT = join(__dirname, '..', '..');
const PERSONAS_PATH = join(ROOT, 'docs', 'PERSONAS_ORSO.md');
const SIMULATION_PATH = join(ROOT, 'docs', 'inoxtag-simulation-2026-04-27.md');
const OUTPUTS_DIR = join(__dirname, 'outputs');

if (!existsSync(OUTPUTS_DIR)) mkdirSync(OUTPUTS_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Extraction des sections personas (depuis PERSONAS_ORSO.md)
// ---------------------------------------------------------------------------

interface Persona {
  id: string;
  slug: string;
  name: string;
  profile: string;
}

function extractPersonas(): Persona[] {
  const md = readFileSync(PERSONAS_PATH, 'utf8');
  const headers = [
    { id: 'stefani', slug: 'stefani', name: 'Matthieu Stefani', start: '## Persona 1 — Matthieu Stefani', end: '## Persona 2 — Christofer Ciminelli' },
    { id: 'christofer', slug: 'christofer', name: 'Christofer Ciminelli', start: '## Persona 2 — Christofer Ciminelli', end: '## Persona 3 — Esther Moisy-Kirschbaum' },
    { id: 'esther', slug: 'esther', name: 'Esther Moisy-Kirschbaum', start: '## Persona 3 — Esther Moisy-Kirschbaum', end: '## Synthèse cross-personas' },
  ];

  return headers.map(h => {
    const sIdx = md.indexOf(h.start);
    const eIdx = md.indexOf(h.end);
    if (sIdx === -1 || eIdx === -1) {
      throw new Error(`Section non trouvée pour ${h.name} (start=${sIdx}, end=${eIdx})`);
    }
    return { id: h.id, slug: h.slug, name: h.name, profile: md.slice(sIdx, eIdx).trim() };
  });
}

// ---------------------------------------------------------------------------
// Extraction des 3 angles (depuis inoxtag-simulation-2026-04-27.md)
// ---------------------------------------------------------------------------

interface Angle {
  id: string;
  title: string;
  body: string;
}

function extractAngles(): Angle[] {
  const md = readFileSync(SIMULATION_PATH, 'utf8');
  const markers = [
    { id: '1', title: 'Production-aware quote dedup', start: '### Angle 1 —', end: '### Angle 2 —' },
    { id: '2', title: 'Cross-pod thematic resonance score', start: '### Angle 2 —', end: '### Angle 3 —' },
    { id: '3', title: 'Cross-catalogue brief annexe : revoir cet épisode après l\'écoute', start: '### Angle 3 —', end: '## Verdict simulation' },
  ];

  return markers.map(m => {
    const sIdx = md.indexOf(m.start);
    const eIdx = md.indexOf(m.end);
    if (sIdx === -1 || eIdx === -1) {
      throw new Error(`Angle non trouvé : ${m.title} (start=${sIdx}, end=${eIdx})`);
    }
    return { id: m.id, title: m.title, body: md.slice(sIdx, eIdx).trim() };
  });
}

// ---------------------------------------------------------------------------
// Construction du prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(persona: Persona): string {
  return `Tu joues le rôle de ${persona.name}, dont le profil détaillé est fourni ci-dessous. Tu dois lire attentivement la description de l'angle proposé, puis réagir en LECTURE CRITIQUE ADVERSE — pas en feedback poli.

PROFIL DE ${persona.name} :
${persona.profile}

CONTEXTE D'USAGE : Cet angle serait construit dans Sillon (plateforme d'intelligence cross-corpus pour podcasts éditoriaux) et présenté à ton équipe Orso Media dans le cadre d'un pilote pitché à Matthieu Stefani.

CONSIGNES DE RÉPONSE STRICTES :

1. LECTURE CRITIQUE ADVERSE
- Pas de feedback poli, pas de sycophantie
- Pointe les problèmes concrets
- Si l'angle est faible, dis-le crûment comme ${persona.name} le ferait dans une conversation de couloir

2. 3 OBJECTIONS CONCRÈTES (avec exemples précis tirés de ton parcours ou du marché que tu connais documenté dans ton profil)

3. 1 CHOSE QUI RÉSONNERAIT POSITIVEMENT (avec justification ancrée dans ton profil)

4. 1 PRÉDICTION COMPORTEMENTALE :
   - Lis en entier ? Skim ? Archive sans lire ?
   - Réponds positivement, négativement, demandes plus d'infos, redirige ?
   - Forwardes à quelqu'un d'autre dans Orso ?

5. 1 SCORE de 1 à 10 :
   "À quel point cet angle me semble réellement différenciant et non-reproductible avec NotebookLM/Castmagic/Lovable sur 2h ?"

CONTRAINTES STRICTES :
- Reste en personnage tout du long. Pas de méta-commentaire neutre.
- Pas de validation polie. Si l'angle est faible, dis-le crûment.
- Toutes les références au marché/outils/concurrents doivent venir du profil documenté. Pas d'invention.
- Si une donnée manque, dis : "[je ne sais pas, mon profil documenté ne couvre pas ce point]"

FORMAT DE SORTIE : JSON strict pour parsing automatique. Tu ne dois émettre QUE le JSON, sans markdown fence, sans texte avant ou après.

{
  "persona": "${persona.name}",
  "angle_id": "<1|2|3>",
  "objections": [
    {"summary": "...", "rationale": "..."},
    {"summary": "...", "rationale": "..."},
    {"summary": "...", "rationale": "..."}
  ],
  "resonance_positive": {"summary": "...", "rationale": "..."},
  "behavioral_prediction": {
    "reading_behavior": "lit en entier | skim | archive",
    "response_behavior": "positive | negative | demande_infos | redirige",
    "forward_behavior": "forward_<nom_ou_role> | pas_de_forward",
    "rationale": "..."
  },
  "differentiation_score": {
    "score": 1-10,
    "rationale": "..."
  },
  "in_character_signal": "phrase qu'aurait pu écrire le persona en style direct, max 280 chars"
}`;
}

function buildUserPrompt(angle: Angle, persona: Persona): string {
  return `ANGLE PROPOSÉ — Angle ${angle.id} : ${angle.title}

${angle.body}

---

Réponds maintenant en ${persona.name}, format JSON strict uniquement.`;
}

// ---------------------------------------------------------------------------
// Parsing JSON robuste (Sonnet peut wrapper en markdown malgré la consigne)
// ---------------------------------------------------------------------------

function parseJsonResponse(text: string): any {
  let s = text.trim();
  // Strip markdown fence si présent
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  // Trouver les bornes du premier objet JSON
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('JSON non trouvé');
  return JSON.parse(s.slice(start, end + 1));
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

async function callPersona(angle: Angle, persona: Persona) {
  const system = buildSystemPrompt(persona);
  const user = buildUserPrompt(angle, persona);

  const start = Date.now();
  const { text, usage } = await generateText({
    model: getLLM(),
    system,
    prompt: user,
    maxOutputTokens: 1500,
    temperature: 0.7,
  });
  const ms = Date.now() - start;

  let parsed: any = null;
  let parseError: string | null = null;
  try {
    parsed = parseJsonResponse(text);
  } catch (e: any) {
    parseError = e.message;
  }

  return { text, usage, ms, parsed, parseError };
}

async function main() {
  const llm = await import('../../engine/ai/llm');
  getLLM = llm.getLLM;
  getModelId = llm.getModelId;
  console.log(`[validation] modèle actif : ${getModelId('main')}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[validation] ANTHROPIC_API_KEY manquant — abort.');
    process.exit(1);
  }

  const personas = extractPersonas();
  const angles = extractAngles();

  console.log(`[validation] ${personas.length} personas × ${angles.length} angles = ${personas.length * angles.length} appels`);
  for (const p of personas) console.log(`  - persona ${p.slug} (${p.profile.length} chars)`);
  for (const a of angles) console.log(`  - angle ${a.id} (${a.body.length} chars)`);

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const summary: any[] = [];

  for (const angle of angles) {
    for (const persona of personas) {
      const tag = `angle ${angle.id} × ${persona.slug}`;
      process.stdout.write(`[${tag}] calling Sonnet... `);
      try {
        const { text, usage, ms, parsed, parseError } = await callPersona(angle, persona);
        const inputTokens = (usage as any)?.inputTokens ?? (usage as any)?.promptTokens ?? 0;
        const outputTokens = (usage as any)?.outputTokens ?? (usage as any)?.completionTokens ?? 0;
        totalInputTokens += inputTokens;
        totalOutputTokens += outputTokens;

        const outPath = join(OUTPUTS_DIR, `${angle.id}-${persona.slug}.json`);
        writeFileSync(outPath, JSON.stringify({
          meta: { angle_id: angle.id, persona_slug: persona.slug, persona_name: persona.name, latency_ms: ms, input_tokens: inputTokens, output_tokens: outputTokens, parse_error: parseError },
          parsed,
          raw_text: text,
        }, null, 2), 'utf8');

        const score = parsed?.differentiation_score?.score ?? '?';
        console.log(`OK (${ms}ms, ${inputTokens}in/${outputTokens}out, score=${score}${parseError ? `, PARSE_ERROR=${parseError}` : ''})`);
        summary.push({ angle_id: angle.id, persona_slug: persona.slug, score, parseError });
      } catch (e: any) {
        console.log(`ERROR ${e.message}`);
        summary.push({ angle_id: angle.id, persona_slug: persona.slug, error: e.message });
      }
    }
  }

  // Coût Sonnet 4.6 : $3/M input, $15/M output
  const costInput = (totalInputTokens / 1_000_000) * 3;
  const costOutput = (totalOutputTokens / 1_000_000) * 15;
  const totalCost = costInput + costOutput;

  console.log('\n=== SUMMARY ===');
  console.table(summary);
  console.log(`Total tokens : ${totalInputTokens} in / ${totalOutputTokens} out`);
  console.log(`Coût estimé : $${totalCost.toFixed(4)} (input $${costInput.toFixed(4)} + output $${costOutput.toFixed(4)})`);

  writeFileSync(join(OUTPUTS_DIR, '_summary.json'), JSON.stringify({
    summary,
    total_input_tokens: totalInputTokens,
    total_output_tokens: totalOutputTokens,
    cost_usd: totalCost,
    timestamp: new Date().toISOString(),
  }, null, 2), 'utf8');
}

main().catch(e => {
  console.error('[validation] FATAL', e);
  process.exit(1);
});
