import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY || KEY.length < 20) { console.error('ANTHROPIC_API_KEY missing'); process.exit(1); }

const client = new Anthropic({ apiKey: KEY });
const TRANSCRIPT = fs.readFileSync(path.join(__dirname, 'transcript-flat.txt'), 'utf8');
const EPISODE_TITLE = "#422 - Inoxtag - Vidéaste - Casser YouTube et rebattre les cartes de l'audiovisuel";

let totalUsage = { input: 0, output: 0 };

async function callSonnet(systemPrompt, userPrompt, label, maxTokens = 4000) {
  const t0 = Date.now();
  const tries = ['claude-sonnet-4-5'];
  for (const model of tries) {
    try {
      const res = await client.messages.create({ model, max_tokens: maxTokens, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] });
      const elapsed = (Date.now() - t0)/1000;
      totalUsage.input += res.usage.input_tokens;
      totalUsage.output += res.usage.output_tokens;
      console.log(`[${label}] model=${model} ${elapsed.toFixed(1)}s · in=${res.usage.input_tokens} out=${res.usage.output_tokens}`);
      return { text: res.content.map(c => c.type === 'text' ? c.text : '').join('').trim(), model, elapsed };
    } catch (e) {
      console.error(`[${label}] failed:`, e.status, e.message?.slice(0,200));
      throw e;
    }
  }
}

function parseJSON(text) {
  let t = text.trim();
  if (t.startsWith('```')) t = t.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim();
  return JSON.parse(t);
}

function countWords(text) {
  return text.replace(/[#\[\]\-—()"".,;:!?]/g, ' ').split(/\s+/).filter(w => w.length > 0).length;
}

const ctx = `**Épisode** : ${EPISODE_TITLE}\n**Date publication** : 2024-10-06\n\n**Transcript timestampé** :\n\n${TRANSCRIPT}`;

(async () => {
  // === Newsletter v2 ===
  console.log('\n--- LIVRABLE 3 v2 (newsletter) ---');
  const sysNL = fs.readFileSync(path.join(__dirname, 'prompts', 'PROMPT-03-newsletter-v2.md'), 'utf8');
  const rNL = await callSonnet(sysNL, ctx, 'newsletter-v2', 2000);
  let nlText = rNL.text.trim();
  if (nlText.startsWith('```')) nlText = nlText.replace(/^```(?:markdown|md)?\s*/, '').replace(/```\s*$/, '').trim();
  // Word count: extract body (between H1 and signature)
  const bodyMatch = nlText.match(/^# .+?\n\n([\s\S]+?)\n\n— /);
  const body = bodyMatch ? bodyMatch[1] : nlText;
  const words = countWords(body);
  console.log(`  body words: ${words} (target 380-420)`);
  fs.writeFileSync(path.join(__dirname, 'livrables', '03-newsletter.md'), nlText + `\n\n<!-- _meta: model=${rNL.model} elapsed=${rNL.elapsed.toFixed(1)}s words=${words} -->`);
  console.log(`  saved 03-newsletter.md (v2, ${words} words)`);

  // === Titres ===
  console.log('\n--- LIVRABLE 4 (titres) ---');
  const sysT = fs.readFileSync(path.join(__dirname, 'prompts', 'PROMPT-04-titles.md'), 'utf8');
  // Trim transcript for titles call (we don't need full 158k chars — keep first 8k chars + a "selected highlights" block)
  const transcriptShort = TRANSCRIPT.slice(0, 30000);
  const ctxTitles = `**Épisode** : ${EPISODE_TITLE}\n\n**Transcript (extrait)** :\n${transcriptShort}\n\n**Catalogue cross-corpus disponible** : voir prompt système.`;
  const rT = await callSonnet(sysT, ctxTitles, 'titles', 2000);
  let titlesObj;
  try { titlesObj = parseJSON(rT.text); }
  catch (e) { fs.writeFileSync(path.join(__dirname, 'livrables', '04-titles-RAW.txt'), rT.text); throw e; }
  fs.writeFileSync(path.join(__dirname, 'livrables', '04-titles.json'), JSON.stringify({ ...titlesObj, _meta: { model: rT.model, elapsed_seconds: rT.elapsed } }, null, 2));
  console.log(`  saved 04-titles.json (${titlesObj.titles?.length||0} titles)`);

  // === Cross-refs ===
  console.log('\n--- LIVRABLE 5 (cross-refs) ---');
  const sysCR = fs.readFileSync(path.join(__dirname, 'prompts', 'PROMPT-05-cross-refs.md'), 'utf8');
  const annAll = JSON.parse(fs.readFileSync(path.join(__dirname, '_cross-corpus-ann.json'), 'utf8'));
  const annNonGdiy = JSON.parse(fs.readFileSync(path.join(__dirname, '_cross-corpus-ann-nongdiy.json'), 'utf8'));
  const summary = `\n## Résumé transcript Inoxtag (#422 GDIY)\n\nThèmes saillants :\n- Discipline vs motivation : "petite flamme tous les jours" > "grande flamme septembre puis abandon"\n- Méthode Kaizen 4 étapes : avoir un rêve / le dire / planifier-discipliner / embarquer des autres\n- Expedition Everest : 1 an de prépa, mois sans téléphone, donne sa bouteille d'oxygène à 8000m\n- Mathieu Blanchard est son guide alpinisme et l'a accompagné à l'Everest\n- Recrutement : "pas le meilleur CV, le meilleur potentiel" — Mathis ex-ouvrier devenu bras droit, Thomas viré puis réintégré\n- Prise de risque créative : 20k€ investis dans "7 jours seuls sur île déserte" → 60k€ revenus\n- Casser codes audiovisuel : Kaizen sort cinéma + YouTube + TF1 le même weekend\n- Refus sponsors qui dénaturent : "tu coupes mes gros mots ? je retire tes placements"\n- Webedia signé à 15 ans, autonomie créative préservée\n- 120 tomes manga lus au camp de base (mois sans téléphone)\n- Inoxtag explicite à plusieurs reprises : "on s'en fout de l'Everest, à chacun son Everest"\n\n`;
  const candidates = `\n## Candidats top-30 ANN tous tenants confondus (similarité pgvector décroissante)\n\n${annAll.slice(0,30).map(r => `- [${r.tenant_id}#${r.episode_number ?? '-'}] ${r.title} (d=${(+r.distance).toFixed(3)})`).join('\n')}\n\n## Candidats top-25 ANN HORS GDIY (filtre tenant != gdiy)\n\n${annNonGdiy.slice(0,25).map(r => `- [${r.tenant_id}#${r.episode_number ?? '-'}] ${r.title} (d=${(+r.distance).toFixed(3)})`).join('\n')}\n`;
  const ctxCR = summary + candidates;
  const rCR = await callSonnet(sysCR, ctxCR, 'cross-refs', 2500);
  let crObj;
  try { crObj = parseJSON(rCR.text); }
  catch (e) { fs.writeFileSync(path.join(__dirname, 'livrables', '05-cross-refs-RAW.txt'), rCR.text); throw e; }
  fs.writeFileSync(path.join(__dirname, 'livrables', '05-cross-refs.json'), JSON.stringify({ ...crObj, _meta: { model: rCR.model, elapsed_seconds: rCR.elapsed } }, null, 2));
  console.log(`  saved 05-cross-refs.json (${crObj.cross_refs?.length||0} refs)`);

  // === Cost ===
  const costIn = totalUsage.input * 3 / 1_000_000;
  const costOut = totalUsage.output * 15 / 1_000_000;
  const total = costIn + costOut;
  fs.writeFileSync(path.join(__dirname, 'livrables', '_usage-4-5-newsletter-v2.json'), JSON.stringify({
    input_tokens: totalUsage.input,
    output_tokens: totalUsage.output,
    cost_usd: +total.toFixed(4),
  }, null, 2));
  console.log(`\n=== USAGE v2 + 4 + 5 ===`);
  console.log(`input=${totalUsage.input} output=${totalUsage.output} cost=$${total.toFixed(4)}`);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
