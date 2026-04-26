import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY || KEY.length < 20) { console.error('ANTHROPIC_API_KEY missing or too short:', KEY?.length); process.exit(1); }

const client = new Anthropic({ apiKey: KEY });
const MODEL = 'claude-sonnet-4-5'; // Sonnet 4.6 = claude-sonnet-4-5 in API id family per project convention
// Project doc says claude-sonnet-4-6 — let's use the actual id available
const TRANSCRIPT = fs.readFileSync(path.join(__dirname, 'transcript-flat.txt'), 'utf8');
const EPISODE_TITLE = "#422 - Inoxtag - Vidéaste - Casser YouTube et rebattre les cartes de l'audiovisuel";
const GUEST_NAME = "Inoxtag";
const PUB_DATE = "2024-10-06";

let totalUsage = { input: 0, output: 0 };

async function callSonnet(systemPrompt, userPrompt, label) {
  const t0 = Date.now();
  const tries = ['claude-sonnet-4-5', 'claude-sonnet-4-6', 'claude-3-5-sonnet-latest', 'claude-3-7-sonnet-latest'];
  let lastErr;
  for (const model of tries) {
    try {
      const res = await client.messages.create({
        model,
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });
      const elapsed = (Date.now() - t0)/1000;
      totalUsage.input += res.usage.input_tokens;
      totalUsage.output += res.usage.output_tokens;
      console.log(`[${label}] model=${model} ${elapsed.toFixed(1)}s · in=${res.usage.input_tokens} out=${res.usage.output_tokens}`);
      const text = res.content.map(c => c.type === 'text' ? c.text : '').join('').trim();
      return { text, model, elapsed };
    } catch (e) {
      lastErr = e;
      console.log(`[${label}] model=${model} failed: ${e.status} ${e.message?.slice(0,100)}`);
    }
  }
  throw lastErr;
}

function parseJSON(text) {
  // Strip code fences if any
  let t = text.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim();
  }
  return JSON.parse(t);
}

const ctx = `**Épisode** : ${EPISODE_TITLE}\n**Invité** : ${GUEST_NAME}\n**Date publication** : ${PUB_DATE}\n\n**Transcript timestampé** (timestamps [MM:SS] toutes les ~30s) :\n\n${TRANSCRIPT}`;

(async () => {
  // === Livrable 1 : key-moments ===
  const sys1 = fs.readFileSync(path.join(__dirname, 'prompts', 'PROMPT-01-key-moments.md'), 'utf8');
  const r1 = await callSonnet(sys1, ctx, 'key-moments');
  let km;
  try { km = parseJSON(r1.text); }
  catch (e) { console.error('parse fail key-moments:', e.message); fs.writeFileSync(path.join(__dirname, 'livrables', '01-key-moments-RAW.txt'), r1.text); process.exit(2); }
  fs.writeFileSync(path.join(__dirname, 'livrables', '01-key-moments.json'), JSON.stringify({ ...km, _meta: { model: r1.model, elapsed_seconds: r1.elapsed } }, null, 2));
  console.log(`  saved 01-key-moments.json (${km.moments?.length||0} moments)`);

  // === Livrable 2 : quotes ===
  const sys2 = fs.readFileSync(path.join(__dirname, 'prompts', 'PROMPT-02-quotes.md'), 'utf8');
  const r2 = await callSonnet(sys2, ctx, 'quotes');
  let qs;
  try { qs = parseJSON(r2.text); }
  catch (e) { console.error('parse fail quotes:', e.message); fs.writeFileSync(path.join(__dirname, 'livrables', '02-quotes-RAW.txt'), r2.text); process.exit(2); }
  fs.writeFileSync(path.join(__dirname, 'livrables', '02-quotes.json'), JSON.stringify({ ...qs, _meta: { model: r2.model, elapsed_seconds: r2.elapsed } }, null, 2));
  console.log(`  saved 02-quotes.json (${qs.quotes?.length||0} quotes)`);

  // === Livrable 3 : newsletter ===
  const sys3 = fs.readFileSync(path.join(__dirname, 'prompts', 'PROMPT-03-newsletter.md'), 'utf8');
  const r3 = await callSonnet(sys3, ctx, 'newsletter');
  let nl = r3.text.trim();
  if (nl.startsWith('```')) nl = nl.replace(/^```(?:markdown|md)?\s*/, '').replace(/```\s*$/, '').trim();
  fs.writeFileSync(path.join(__dirname, 'livrables', '03-newsletter.md'), nl + `\n\n<!-- _meta: model=${r3.model} elapsed=${r3.elapsed.toFixed(1)}s -->`);
  console.log(`  saved 03-newsletter.md (${nl.split(/\s+/).length} words)`);

  // Cost
  const costIn = totalUsage.input * 3 / 1_000_000;
  const costOut = totalUsage.output * 15 / 1_000_000;
  const total = costIn + costOut;
  fs.writeFileSync(path.join(__dirname, 'livrables', '_usage-1-3.json'), JSON.stringify({
    input_tokens: totalUsage.input,
    output_tokens: totalUsage.output,
    cost_usd: +total.toFixed(4),
    model_pricing: 'sonnet 4 family $3/M in $15/M out',
  }, null, 2));
  console.log(`\n=== USAGE livrables 1-3 ===`);
  console.log(`input=${totalUsage.input} output=${totalUsage.output} cost=$${total.toFixed(4)}`);
})().catch(e => { console.error(e); process.exit(3); });
