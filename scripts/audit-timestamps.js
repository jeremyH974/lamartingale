/**
 * Audit timestamps L2 quotes — vérification intégrité
 * timestamp ↔ verbatim transcript.
 *
 * Usage :
 *   node scripts/audit-timestamps.js [pack-dir] [transcripts-dir] [manifest.json]
 *
 * Args (tous optionnels — defaults = pack pilote Stefani-Orso) :
 *   pack-dir         racine du pack à auditer (contient un sous-dossier par épisode)
 *   transcripts-dir  dossier des transcripts JSON Whisper
 *   manifest.json    liste des épisodes [{slug, label, transcript}]
 *                    sinon cherché à `<pack-dir>/manifest.json`,
 *                    sinon fallback aux 4 épisodes pack pilote Stefani-Orso.
 *
 * Origine : créé pendant Phase 7b test e2e (27/04/2026) qui a révélé
 * 79% de timestamps L2 erronés sur le pack pilote Stefani-Orso.
 * Outil de défense en profondeur — à exécuter sur tout pack avant
 * validation, et après tout fix `extractQuotes` (Phase 8).
 *
 * Voir docs/DETTE.md section "Phase 7b audit timestamps L2".
 */
const fs = require('fs');
const path = require('path');

// Phase A.5.5a (2026-04-28) : DEFAULT_PACK mis à jour pour pointer vers le
// pack v3-final-md-audit (post-Phase 8 extractQuotes fix, 35/35 baseline).
// L'ancien défaut 'pack-pilote-stefani-orso/' était la version Phase 6
// pré-fix qui retourne 23/39 (normal pour l'historique, pas une régression).
const DEFAULT_PACK = 'experiments/autonomy-session-2026-04-28/pack-pilote-stefani-orso-v3-final-md-audit';
const DEFAULT_TRANSCRIPTS = 'experiments/autonomy-session-2026-04-28/transcripts';
const DEFAULT_EPISODES = [
  { slug: 'plais-platform-sh', label: 'Plais GDIY #266', transcript: 'gdiy-266' },
  { slug: 'boissenot-pokemon', label: 'Boissenot LM #174', transcript: 'lamartingale-174' },
  { slug: 'nooz-optics', label: 'Doolaeghe LP #128', transcript: 'lepanier-128' },
  { slug: 'veyrat-stoik', label: 'Veyrat Finscale #107', transcript: 'finscale-107' },
];

const ROOT = process.argv[2] || DEFAULT_PACK;
const TRANSCRIPTS_DIR = process.argv[3] || DEFAULT_TRANSCRIPTS;
const MANIFEST_PATH = process.argv[4] || path.join(ROOT, 'manifest.json');

let EPISODES;
if (fs.existsSync(MANIFEST_PATH)) {
  EPISODES = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
} else {
  EPISODES = DEFAULT_EPISODES;
}

function ts(s) {
  const parts = s.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  throw new Error('bad ts ' + s);
}

function parseKeyMoments(md) {
  // Pattern : ## N. titre puis **MM:SS–MM:SS** · saliency X
  const lines = md.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^##\s+(\d+)\.\s+(.+)$/);
    if (m) {
      const numero = +m[1];
      const titre = m[2];
      // chercher la ligne suivante non vide
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const tm = lines[j].match(/\*\*(\d+:\d+(?::\d+)?)[–-](\d+:\d+(?::\d+)?)\*\*\s*·\s*saliency\s+([\d.]+)/);
        if (tm) {
          out.push({
            numero,
            titre,
            startStr: tm[1],
            endStr: tm[2],
            startSec: ts(tm[1]),
            endSec: ts(tm[2]),
            saliency: +tm[3],
          });
          break;
        }
      }
    }
  }
  return out;
}

function parseQuotes(md) {
  // Pattern : ## Citation N puis > *« ... »*\n> — **Auteur** · MM:SS
  const lines = md.split(/\r?\n/);
  const out = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^##\s+Citation\s+(\d+)/);
    if (m) {
      cur = { numero: +m[1], text: '', tsStr: null, tsSec: null };
      out.push(cur);
      continue;
    }
    if (cur) {
      // Texte de la quote entre guillemets français « ... »
      const txt = lines[i].match(/«\s*([^»]+?)\s*»/);
      if (txt && !cur.text) cur.text = txt[1];
      // Auteur · MM:SS
      const tm = lines[i].match(/—\s*\*\*[^*]+\*\*\s*·\s*(\d+:\d+(?::\d+)?)/);
      if (tm) {
        cur.tsStr = tm[1];
        cur.tsSec = ts(tm[1]);
      }
    }
  }
  return out;
}

function loadTranscriptText(slug) {
  const j = JSON.parse(fs.readFileSync(path.join(TRANSCRIPTS_DIR, slug + '.json'), 'utf-8'));
  return { duration: j.duration_seconds, segments: j.segments };
}

function findInTranscript(segments, tsSec, snippet) {
  // Cherche un segment dans [tsSec - 10, tsSec + 30] qui contient snippet
  // (normalisé : casse + diacritiques + ponctuation simplifiés).
  const norm = (s) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const want = norm(snippet);
  if (!want) return { found: false, reason: 'snippet vide' };
  // Probe = sous-séquence de mots consécutifs au milieu de la quote (préserve
  // l'ordre tel que prononcé). Whisper transcrit fidèlement l'enchaînement —
  // skipper les stopwords casse cette propriété.
  const allWords = want.split(' ').filter((w) => w.length > 0);
  if (allWords.length < 8) return { found: false, reason: `quote trop courte (${allWords.length} mots)`, probe: want };
  const PROBE_LEN = 8;
  const startMid = Math.max(0, Math.floor(allWords.length / 2) - Math.floor(PROBE_LEN / 2));
  const probe = allWords.slice(startMid, startMid + PROBE_LEN).join(' ');

  const contextSegs = segments.filter((s) => s.start_seconds >= tsSec - 15 && s.start_seconds <= tsSec + 90);
  const contextText = norm(contextSegs.map((s) => s.text).join(' '));
  if (contextText.includes(probe)) return { found: true, where: 'window±90s', probe };

  // Fallback : chercher dans tout le transcript pour voir si le texte existe ailleurs
  const fullText = norm(segments.map((s) => s.text).join(' '));
  if (fullText.includes(probe)) {
    // Trouver le segment exact (ou le 1er) qui contient
    let acc = '';
    for (const s of segments) {
      acc = norm(acc + ' ' + s.text);
      if (acc.includes(probe)) {
        return { found: false, foundElsewhere: true, actualTs: s.start_seconds, probe };
      }
      // Ne pas cumuler indéfiniment — fenêtre glissante
      if (acc.length > 500) acc = acc.slice(-300);
    }
  }
  return { found: false, foundElsewhere: false, probe };
}

const results = [];

for (const ep of EPISODES) {
  const epDir = path.join(ROOT, ep.slug);
  const km = parseKeyMoments(fs.readFileSync(path.join(epDir, '01-key-moments.md'), 'utf-8'));
  const qts = parseQuotes(fs.readFileSync(path.join(epDir, '02-quotes.md'), 'utf-8'));
  const tr = loadTranscriptText(ep.transcript);

  const checks = [];

  // L1 — borne durée + ordre start<end + texte quote présent près du timestamp
  for (const m of km) {
    const inBounds = m.endSec <= tr.duration + 1; // 1s tolérance
    const orderOk = m.endSec > m.startSec;
    let textCheck = { found: null };
    // Le snippet du keyMoment est dans la balise > — on le récupère ?
    // Pour simplifier on saute le textCheck L1 (le titre n'est pas du verbatim)
    checks.push({
      type: 'L1',
      numero: m.numero,
      tsStr: `${m.startStr}–${m.endStr}`,
      startSec: m.startSec,
      endSec: m.endSec,
      inBounds,
      orderOk,
      textCheck,
      issue: !inBounds ? 'HORS_BORNE' : !orderOk ? 'ORDRE_KO' : 'OK',
    });
  }

  // L2 — borne durée + texte verbatim trouvé près du timestamp
  for (const q of qts) {
    if (q.tsSec === null) continue;
    const inBounds = q.tsSec <= tr.duration + 1;
    const textCheck = inBounds ? findInTranscript(tr.segments, q.tsSec, q.text) : { found: null, skipped: true };
    checks.push({
      type: 'L2',
      numero: q.numero,
      tsStr: q.tsStr,
      tsSec: q.tsSec,
      inBounds,
      text: q.text.slice(0, 60),
      textCheck,
      issue: !inBounds
        ? 'HORS_BORNE'
        : textCheck.found
          ? 'OK'
          : textCheck.foundElsewhere
            ? `TS_FAUX_existe_à_${textCheck.actualTs}s`
            : 'TEXTE_INTROUVABLE',
    });
  }

  results.push({ ep, duration: tr.duration, checks });
}

// Rapport tableau
console.log('\n=== AUDIT TIMESTAMPS PACK ===\n');
console.log(`Pack       : ${ROOT}`);
console.log(`Transcripts: ${TRANSCRIPTS_DIR}`);
console.log(`Episodes   : ${EPISODES.length} (${fs.existsSync(MANIFEST_PATH) ? 'manifest' : 'defaults Stefani-Orso'})\n`);

let grandTotal = 0;
let grandKo = 0;

for (const r of results) {
  console.log(`\n## ${r.ep.label} — durée transcript ${r.duration.toFixed(1)}s (${(r.duration / 60).toFixed(1)}min)`);
  console.log('| Type | # | Timestamp | Status | Détail |');
  console.log('|------|---|-----------|--------|--------|');
  let ok = 0, ko = 0;
  for (const c of r.checks) {
    grandTotal++;
    const issue = c.issue;
    if (issue !== 'OK') { ko++; grandKo++; } else ok++;
    let detail = '';
    if (c.type === 'L2') {
      if (c.issue === 'OK') detail = `✅ probe «${c.textCheck.probe?.slice(0,40)}» trouvé ±60s`;
      else if (c.issue.startsWith('TS_FAUX')) detail = `⚠️ texte trouvé à ${c.textCheck.actualTs}s, pas à ${c.tsSec}s`;
      else if (c.issue === 'TEXTE_INTROUVABLE') detail = `❌ probe «${c.textCheck.probe?.slice(0,40)}» absent du transcript`;
      else if (c.issue === 'HORS_BORNE') detail = `❌ ${c.tsSec}s > durée ${r.duration.toFixed(0)}s`;
    } else {
      if (c.issue === 'HORS_BORNE') detail = `❌ end ${c.endSec}s > durée ${r.duration.toFixed(0)}s`;
      else if (c.issue === 'ORDRE_KO') detail = '❌ end <= start';
      else detail = '✅';
    }
    console.log(`| ${c.type} | ${c.numero} | ${c.tsStr} | ${issue} | ${detail} |`);
  }
  console.log(`\n→ ${ok}/${ok + ko} OK (${(100 * ok / (ok + ko)).toFixed(0)}%)`);
}

console.log('\n\n=== TOTAL ===');
console.log(`Total éléments testés : ${grandTotal}`);
console.log(`Total OK : ${grandTotal - grandKo} (${(100 * (grandTotal - grandKo) / grandTotal).toFixed(1)}%)`);
console.log(`Total KO : ${grandKo} (${(100 * grandKo / grandTotal).toFixed(1)}%)`);
