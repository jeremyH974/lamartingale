// Rejoue uniquement angle 3 × stefani avec maxOutputTokens=2500 (le précédent run a tronqué).
import { config as loadDotenv } from 'dotenv';
loadDotenv({ override: true });
import { generateText } from 'ai';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

async function main() {
  const llm = await import('../../engine/ai/llm');

  const ROOT = join(__dirname, '..', '..');
  const personasMd = readFileSync(join(ROOT, 'docs', 'PERSONAS_ORSO.md'), 'utf8');
  const simMd = readFileSync(join(ROOT, 'docs', 'inoxtag-simulation-2026-04-27.md'), 'utf8');

  const stefaniProfile = personasMd.slice(
    personasMd.indexOf('## Persona 1 — Matthieu Stefani'),
    personasMd.indexOf('## Persona 2 — Christofer Ciminelli'),
  ).trim();

  const angle3Body = simMd.slice(
    simMd.indexOf('### Angle 3 —'),
    simMd.indexOf('## Verdict simulation'),
  ).trim();

  const persona = { name: 'Matthieu Stefani', slug: 'stefani' };
  const angle = { id: '3', title: 'Auditor-mode brief annexe', body: angle3Body };

  const system = `Tu joues le rôle de ${persona.name}, dont le profil détaillé est fourni ci-dessous. Tu dois lire attentivement la description de l'angle proposé, puis réagir en LECTURE CRITIQUE ADVERSE — pas en feedback poli.

PROFIL DE ${persona.name} :
${stefaniProfile}

CONTEXTE D'USAGE : Cet angle serait construit dans Sillon (plateforme d'intelligence cross-corpus pour podcasts éditoriaux) et présenté à ton équipe Orso Media dans le cadre d'un pilote pitché à Matthieu Stefani.

CONSIGNES DE RÉPONSE STRICTES :
1. LECTURE CRITIQUE ADVERSE — pas de sycophantie
2. 3 OBJECTIONS CONCRÈTES
3. 1 CHOSE QUI RÉSONNERAIT POSITIVEMENT
4. 1 PRÉDICTION COMPORTEMENTALE
5. 1 SCORE de 1 à 10 sur la différenciabilité vs NotebookLM/Castmagic/Lovable

CONTRAINTES STRICTES :
- Reste en personnage. Toutes les références au marché viennent du profil documenté.
- Si une donnée manque : "[je ne sais pas, mon profil documenté ne couvre pas ce point]"

FORMAT DE SORTIE : JSON strict UNIQUEMENT. Pas de markdown fence. Tu DOIS impérativement clore tous les champs et fermer le JSON. Sois concis dans les rationales.

{
  "persona": "${persona.name}",
  "angle_id": "3",
  "objections": [
    {"summary": "...", "rationale": "..."},
    {"summary": "...", "rationale": "..."},
    {"summary": "...", "rationale": "..."}
  ],
  "resonance_positive": {"summary": "...", "rationale": "..."},
  "behavioral_prediction": {
    "reading_behavior": "lit en entier | skim | archive",
    "response_behavior": "positive | negative | demande_infos | redirige",
    "forward_behavior": "forward_<nom> | pas_de_forward",
    "rationale": "..."
  },
  "differentiation_score": {"score": 1-10, "rationale": "..."},
  "in_character_signal": "phrase persona, max 280 chars"
}`;

  const user = `ANGLE PROPOSÉ — Angle ${angle.id} : ${angle.title}\n\n${angle.body}\n\n---\n\nRéponds en ${persona.name}, JSON strict uniquement.`;

  const start = Date.now();
  const { text, usage } = await generateText({
    model: llm.getLLM(),
    system,
    prompt: user,
    maxOutputTokens: 2500,
    temperature: 0.7,
  });
  const ms = Date.now() - start;

  const inputTokens = (usage as any)?.inputTokens ?? 0;
  const outputTokens = (usage as any)?.outputTokens ?? 0;
  const cost = (inputTokens / 1e6) * 3 + (outputTokens / 1e6) * 15;

  let parsed: any = null;
  let parseError: string | null = null;
  try {
    let s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    const start2 = s.indexOf('{');
    const end2 = s.lastIndexOf('}');
    parsed = JSON.parse(s.slice(start2, end2 + 1));
  } catch (e: any) {
    parseError = e.message;
  }

  console.log(`OK ${ms}ms ${inputTokens}in/${outputTokens}out cost=$${cost.toFixed(4)} score=${parsed?.differentiation_score?.score ?? '?'} parseError=${parseError ?? 'none'}`);

  writeFileSync(join(__dirname, 'outputs', '3-stefani.json'), JSON.stringify({
    meta: { angle_id: '3', persona_slug: 'stefani', persona_name: persona.name, latency_ms: ms, input_tokens: inputTokens, output_tokens: outputTokens, parse_error: parseError, rerun: true },
    parsed,
    raw_text: text,
  }, null, 2), 'utf8');
}

main().catch(e => { console.error(e); process.exit(1); });
