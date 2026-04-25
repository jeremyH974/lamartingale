/**
 * guestBriefAgent — Kit invité cross-univers.
 *
 * Analyse N épisodes d'un même invité (sources déjà extraites par
 * `sourceSelector` côté wrapper) et produit un livrable structuré : positions
 * tranchées, citations marquantes, questions originales jamais posées, et
 * synthèse markdown.
 *
 * Contrat : voir `docs/AGENTS.md` (statelessness, llmFn injecté, idempotence).
 *
 * - Pas d'accès DB.
 * - Pas de lecture env.
 * - LLM injecté via `config.llmFn` (peut renvoyer string ou objet déjà parsé).
 * - Pure fonction `input → llmFn → output`.
 */

export type LLMFn = (
  prompt: string,
  options?: { maxTokens?: number; temperature?: number },
) => Promise<string | unknown>;

export interface GuestBriefInputEpisode {
  episode_id: number;
  podcast_id: string; // tenant_id
  title: string;
  date_created: string; // ISO date
  source_content: string; // résultat sourceSelector
  source_type: 'article_content' | 'chapters_takeaways' | 'rss_description';
  source_quality?: number; // 0..1, optionnel pour traçabilité
}

export interface GuestBriefInput {
  guestName: string;
  guestLinkedin?: string;
  episodes: GuestBriefInputEpisode[];
}

export interface GuestBriefConfig {
  llmFn: LLMFn;
  llmModel: 'sonnet' | 'haiku';
  maxKeyPositions?: number;
  maxQuotes?: number;
  maxOriginalQuestions?: number;
}

export interface KeyPosition {
  position: string;
  context: string;
  source_episode_id: number;
  source_podcast: string;
  confidence: number;
}

export interface Quote {
  text: string;
  source_episode_id: number;
  source_podcast: string;
  context: string;
}

export interface OriginalQuestion {
  question: string;
  rationale: string;
  depth_score: 'high' | 'medium' | 'low';
}

export interface GuestBriefOutput {
  briefMd: string;
  keyPositions: KeyPosition[];
  quotes: Quote[];
  originalQuestions: OriginalQuestion[];
  metadata: {
    sourcesUsed: number;
    sourceQualityAvg: number;
    llmModel: string;
    generationTimeMs: number;
  };
}

const DEFAULTS = {
  maxKeyPositions: 8,
  maxQuotes: 6,
  maxOriginalQuestions: 5,
};

export function buildPrompt(input: GuestBriefInput, config: GuestBriefConfig): string {
  const { guestName, guestLinkedin, episodes } = input;
  const maxKP = config.maxKeyPositions ?? DEFAULTS.maxKeyPositions;
  const maxQ = config.maxQuotes ?? DEFAULTS.maxQuotes;
  const maxOQ = config.maxOriginalQuestions ?? DEFAULTS.maxOriginalQuestions;

  const sourcesBlock = episodes
    .map(
      (ep, i) => `### Source ${i + 1} — ${ep.podcast_id} épisode ${ep.episode_id} (${ep.date_created})
Titre : ${ep.title}
Type de source : ${ep.source_type}
Contenu :
${ep.source_content}`,
    )
    .join('\n\n---\n\n');

  return `Tu es un expert en analyse éditoriale podcast français. Tu analyses les passages d'un invité dans plusieurs podcasts pour générer un kit de préparation destiné à un futur intervieweur.

## INVITÉ
Nom: ${guestName}
${guestLinkedin ? `LinkedIn: ${guestLinkedin}` : ''}

## SOURCES (${episodes.length} épisode${episodes.length > 1 ? 's' : ''})
${sourcesBlock}

## INSTRUCTIONS
1. Extrait jusqu'à ${maxKP} positions/opinions tranchées de l'invité (pas les faits neutres). Pour chacune : cite l'épisode source (source_episode_id + source_podcast), donne un contexte court, attribue une confidence 0..1.
2. Extrait jusqu'à ${maxQ} citations marquantes (verbatim si possible). Cite source_episode_id + source_podcast + contexte.
3. Identifie ${maxOQ} questions originales jamais posées dans ces interviews mais qui auraient un fort potentiel éditorial. Pour chacune : rationale + depth_score (high|medium|low).
4. Rédige briefMd : synthèse markdown 300-500 mots qui présente l'invité, ses domaines d'expertise, et 3 angles d'interview prometteurs.

## CONTRAINTES DE BASE
- Si attribution incertaine, baisse confidence.
- Pas de fabrication : si une position n'est PAS dans les sources, ne l'invente PAS.
- Réponds UNIQUEMENT en JSON strict selon le schema ci-dessous, sans markdown wrapping, sans préambule.

## CONTRAINTES QUALITATIVES (impératives)

1. CONCENTRATION THÉMATIQUE (règle stricte)
   - **Maximum 2 keyPositions sur un même grand domaine** (ex: crypto/bitcoin = 1 grand domaine, entrepreneuriat = 1 grand domaine, patrimoine/CGP = 1 grand domaine).
   - Si plus de 2 positions sont saillantes sur un même grand domaine, **consolide-les en 1-2 positions plus riches** plutôt que de multiplier les variations.
   - Si l'invité apparaît dans plusieurs podcasts thématiquement distincts, répartir les positions entre ces domaines.

2. EXPLOITATION CROSS-PODCAST
   - Si l'invité apparaît dans plusieurs podcasts, identifier explicitement les TENSIONS, CONTRADICTIONS ou ÉVOLUTIONS entre ses positions selon le contexte (ex: position pro-système dans podcast A vs critique du système dans podcast B).
   - **Au moins 1 originalQuestion DOIT exploiter cette dimension cross-podcast** (mentionner les podcasts ou la tension détectée).

3. QUOTES STRICTEMENT VERBATIM (règle stricte)
   - Une quote DOIT être au **"je" de l'invité** OU en discours direct rapporté clairement attribué (ex: "il a dit : ...").
   - **REFUSER toute description en 3e personne** ("il se réfugie...", "il pense que...") sauf si clairement attribuée à un dire de l'invité.
   - **REJETER toute quote dont la formulation paraît reformulée ou paraphrasée** (ex: la tournure "ça me fait rêver" pour quelqu'un qui dit en réalité "j'ai investi quand ça valait 200€" — c'est une reformulation, pas un verbatim).
   - Si incertain qu'une phrase est verbatim authentique, **ne l'inclus PAS dans quotes** — déplace-la en keyPosition avec confidence ajustée.

4. ORIGINALQUESTIONS — PERSONNALISATION TOTALE (règle stricte)
   - **TOUTES (100%) les originalQuestions DOIVENT référencer un élément SPÉCIFIQUE** présent dans les sources (nom d'entreprise mentionnée, événement précis, position exprimée, parcours détaillé, citation explicite).
   - **REJETER les questions dont la deuxième moitié reste générique** même si la première moitié est spécifique (ex: "Vous avez co-fondé Ledger... que diriez-vous aux entrepreneurs qui hésitent à investir dans des technos émergentes ?" — la 2e moitié est applicable à n'importe quel fondateur tech, donc REJETÉE).
   - Une bonne question relie 2 éléments spécifiques des sources OU exploite une CONTRADICTION / ÉVOLUTION / TENSION détectée entre podcasts.
   - **REJETER les questions génériques** applicables à tout invité du même domaine (ex: "comment voyez-vous l'évolution de la réglementation crypto ?" applicable à tout invité crypto).
   - **Au moins 2 questions** doivent exploiter une CONTRADICTION ou une ÉVOLUTION détectée dans les sources.

5. ÉVOLUTION TEMPORELLE
   - Si les sources s'étalent sur plusieurs années (regarde les dates), observer l'évolution des positions dans le temps.
   - Mentionner cette évolution dans briefMd OU dans au moins 1 originalQuestion (ex: "votre position sur X a évolué entre AAAA et AAAA, que diriez-vous aujourd'hui ?").

6. BRIEFMD COMME NARRATIF
   - briefMd ne doit PAS être une fiche Wikipedia descriptive.
   - briefMd doit raconter une narration : qui est cette personne, QU'EST-CE qui la rend unique vue cross-podcasts, et POURQUOI l'intervieweur a un angle inédit à exploiter.
   - 3 angles d'interview prometteurs basés sur des éléments SPÉCIFIQUES des sources, pas des angles génériques.

## SCHEMA OUTPUT
{
  "briefMd": "string (markdown)",
  "keyPositions": [
    {"position": "...", "context": "...", "source_episode_id": 0, "source_podcast": "...", "confidence": 0.85}
  ],
  "quotes": [
    {"text": "...", "source_episode_id": 0, "source_podcast": "...", "context": "..."}
  ],
  "originalQuestions": [
    {"question": "...", "rationale": "...", "depth_score": "high"}
  ]
}`;
}

function stripJsonFences(raw: string): string {
  const trimmed = raw.trim();
  // Retire ```json ... ``` ou ``` ... ``` autour du JSON (Claude le fait souvent
  // malgré l'instruction). Recherche la première { et la dernière }.
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first === -1 || last === -1 || last < first) {
    return trimmed;
  }
  return trimmed.slice(first, last + 1);
}

function parseLLMResponse(raw: string | unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(stripJsonFences(raw));
  } catch (err) {
    throw new Error(
      `guestBriefAgent: LLM response is not valid JSON. Snippet: ${raw.slice(0, 200)}`,
    );
  }
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function validateOutput(parsed: unknown): {
  briefMd: string;
  keyPositions: KeyPosition[];
  quotes: Quote[];
  originalQuestions: OriginalQuestion[];
} {
  if (!isObject(parsed)) {
    throw new Error('guestBriefAgent: output is not an object');
  }
  const { briefMd, keyPositions, quotes, originalQuestions } = parsed as Record<string, unknown>;
  if (typeof briefMd !== 'string') {
    throw new Error('guestBriefAgent: briefMd missing or not a string');
  }
  if (!Array.isArray(keyPositions)) {
    throw new Error('guestBriefAgent: keyPositions missing or not an array');
  }
  if (!Array.isArray(quotes)) {
    throw new Error('guestBriefAgent: quotes missing or not an array');
  }
  if (!Array.isArray(originalQuestions)) {
    throw new Error('guestBriefAgent: originalQuestions missing or not an array');
  }
  return {
    briefMd,
    keyPositions: keyPositions as KeyPosition[],
    quotes: quotes as Quote[],
    originalQuestions: originalQuestions as OriginalQuestion[],
  };
}

function clampToMax<T>(arr: T[], max: number): T[] {
  return arr.length > max ? arr.slice(0, max) : arr;
}

export const guestBriefAgent = {
  async run(input: GuestBriefInput, config: GuestBriefConfig): Promise<GuestBriefOutput> {
    const t0 = Date.now();

    if (!input.guestName?.trim()) {
      throw new Error('guestBriefAgent: guestName is required');
    }
    if (!Array.isArray(input.episodes) || input.episodes.length === 0) {
      throw new Error('guestBriefAgent: episodes[] cannot be empty');
    }

    const prompt = buildPrompt(input, config);
    const raw = await config.llmFn(prompt, { temperature: 0.4 });
    const parsed = parseLLMResponse(raw);
    const validated = validateOutput(parsed);

    const maxKP = config.maxKeyPositions ?? DEFAULTS.maxKeyPositions;
    const maxQ = config.maxQuotes ?? DEFAULTS.maxQuotes;
    const maxOQ = config.maxOriginalQuestions ?? DEFAULTS.maxOriginalQuestions;

    const sourceQualities = input.episodes
      .map((ep) => ep.source_quality)
      .filter((q): q is number => typeof q === 'number');
    const sourceQualityAvg = sourceQualities.length
      ? sourceQualities.reduce((a, b) => a + b, 0) / sourceQualities.length
      : 0;

    return {
      briefMd: validated.briefMd,
      keyPositions: clampToMax(validated.keyPositions, maxKP),
      quotes: clampToMax(validated.quotes, maxQ),
      originalQuestions: clampToMax(validated.originalQuestions, maxOQ),
      metadata: {
        sourcesUsed: input.episodes.length,
        sourceQualityAvg: Number(sourceQualityAvg.toFixed(2)),
        llmModel: config.llmModel,
        generationTimeMs: Date.now() - t0,
      },
    };
  },
};
