/**
 * qualityValidator — Validateur sémantique post-Sonnet (Phase 5 V4 Change 3).
 *
 * 2e appel Sonnet qui lit un livrable produit et vérifie sémantiquement
 * (vs grep texte) :
 *  1. phrases-fétiches host attribuées invité
 *  2. ton non aligné avec corpus host
 *  3. erreurs d'attribution
 *  4. contenu générique
 *  5. hors-sujet
 *
 * Sortie JSON : passed/score/issues/rewriteSuggestions.
 *
 * Cf. docs/brief-phase5-v4-refonte-2026-04-30.md (Change 3).
 */

import { z } from 'zod';
import type { LLMFn } from '@engine/primitives/types';
import { parseLLMJsonResponse } from '@engine/primitives/types';
import type { ClientStyleCorpus } from '@engine/types/client-config';

export type LivrableType = 'newsletter' | 'brief-annexe' | 'cross-refs';

export type ValidationCategory =
  | 'forbidden-phrase'
  | 'tone-mismatch'
  | 'host-attribution-error'
  | 'generic-content'
  | 'off-topic';

export type ValidationSeverity = 'critical' | 'major' | 'minor';

const ValidationIssueSchema = z.object({
  category: z.enum([
    'forbidden-phrase',
    'tone-mismatch',
    'host-attribution-error',
    'generic-content',
    'off-topic',
  ]),
  severity: z.enum(['critical', 'major', 'minor']),
  description: z.string().min(5).max(800),
  excerpt: z.string().max(400).optional(),
});

export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

const ValidationResultSchema = z.object({
  passed: z.boolean(),
  score: z.number().min(0).max(10),
  issues: z.array(ValidationIssueSchema),
  rewriteSuggestions: z.string().max(4000).optional(),
});

export type QualityValidationResult = z.infer<typeof ValidationResultSchema>;

export interface QualityValidationContext {
  guestName: string;
  hostName: string;
  styleCorpus: ClientStyleCorpus;
  /** Forbidden patterns config-level (existing tone_profile). */
  forbiddenPatterns?: string[];
}

const FALLBACK_RESULT: QualityValidationResult = {
  passed: false,
  score: 0,
  issues: [
    {
      category: 'generic-content',
      severity: 'major',
      description: 'Validateur n\'a pas pu parser la réponse LLM, score conservatif fallback.',
    },
  ],
};

export function buildValidatorPrompt(
  livrable: string,
  livrableType: LivrableType,
  context: QualityValidationContext,
): string {
  const blacklist = context.styleCorpus.host_blacklist_phrases ?? [];
  const forbidden = context.forbiddenPatterns ?? [];
  const ecosystem = context.styleCorpus.ecosystem_reference;
  const signature = context.styleCorpus.signature_expressions ?? [];

  const blacklistBlock = blacklist.length > 0
    ? blacklist.map((p) => `- "${p}"`).join('\n')
    : '(aucune)';
  const forbiddenBlock = forbidden.length > 0
    ? forbidden.map((p) => `- "${p}"`).join('\n')
    : '(aucun)';
  const signatureBlock = signature.length > 0
    ? signature.slice(0, 8).map((p) => `"${p}"`).join(', ')
    : '(aucune)';

  return `Tu es éditeur exigeant qui valide la qualité d'un livrable Sillon (livrable type : ${livrableType}). Tu juges en imaginant ${context.hostName} le lisant. Si tu te dis "${context.hostName} trouverait ça générique/poli/scolaire", c'est sous-cap.

## CRITÈRES DE VALIDATION

### 1. PHRASES INTERDITES — host_blacklist_phrases
Aucune de ces phrases-fétiches du host ne doit apparaître attribuée à l'invité ${context.guestName} :
${blacklistBlock}

### 2. TON & STYLE
Le livrable doit ressembler au ton du host (${context.hostName}) :
- Phrases courtes (parfois mots isolés type ${signatureBlock})
- Anecdote personnelle ou tension avouée si applicable
- PAS de "Dans l'épisode X, Y aborde Z" en intro descriptive
- Diagnostic systémique plutôt que résumé scolaire
- PAS de questions rhétoriques creuses en conclusion
- PAS de connecteurs scolaires ("par ailleurs", "en outre", "de plus")

### 3. ATTRIBUTION
Aucune citation ne doit être attribuée à ${context.guestName} si elle pourrait venir de ${context.hostName}.

### 4. CONTENU GÉNÉRIQUE — formulations à pénaliser
${forbiddenBlock}
+ toute paraphrase de ces formulations.

### 5. HORS-SUJET
Le contenu doit rester centré sur l'épisode et l'invité. Pas de digression sur l'écosystème en général sans lien avec l'épisode.

### 6. ÉCOSYSTÈME (newsletter / brief-annexe uniquement)
Mention naturelle de "${ecosystem.canonical_phrase}" ou alternative (${ecosystem.alternatives.slice(0, 2).join(', ')}) attendue dans le livrable, ${ecosystem.appearance_style}.

## LIVRABLE À VALIDER (type=${livrableType})

${livrable}

## ÉCHELLE DE SCORE
- 9-10 : ton ${context.hostName} reconnaissable, anti-cliché, spécifique
- 7.5-8.5 : aligné, quelques minor à corriger éventuellement
- 6-7 : passable mais générique par endroits, score sous-cap pivot
- 0-5 : générique, scolaire, ${context.hostName} ne signerait pas

## OUTPUT
JSON STRICT (pas de markdown wrapping, pas de préambule). Schema :
{
  "passed": <true si score >= 7.5 ET aucune issue 'critical'>,
  "score": <nombre 0-10>,
  "issues": [
    {
      "category": "forbidden-phrase | tone-mismatch | host-attribution-error | generic-content | off-topic",
      "severity": "critical | major | minor",
      "description": "<explication-courte>",
      "excerpt": "<extrait-fautif-optionnel>"
    }
  ],
  "rewriteSuggestions": "<si score < 7.5 : suggestions concrètes de réécriture des passages problématiques>"
}`;
}

export async function validateLivrableQuality(
  livrable: string,
  livrableType: LivrableType,
  context: QualityValidationContext,
  llmFn: LLMFn,
): Promise<QualityValidationResult> {
  if (!livrable?.trim()) {
    return {
      passed: false,
      score: 0,
      issues: [
        {
          category: 'generic-content',
          severity: 'critical',
          description: 'Livrable vide.',
        },
      ],
    };
  }

  const prompt = buildValidatorPrompt(livrable, livrableType, context);
  let raw: unknown;
  try {
    raw = await llmFn(prompt, { temperature: 0.2, maxTokens: 1500 });
  } catch (err) {
    return {
      ...FALLBACK_RESULT,
      issues: [
        {
          category: 'generic-content',
          severity: 'major',
          description: `Validator LLM call failed: ${(err as Error).message.slice(0, 200)}`,
        },
      ],
    };
  }

  let parsed: unknown;
  try {
    parsed = parseLLMJsonResponse(raw, 'qualityValidator');
  } catch (err) {
    return {
      ...FALLBACK_RESULT,
      issues: [
        {
          category: 'generic-content',
          severity: 'major',
          description: `Validator JSON parse failed: ${(err as Error).message.slice(0, 200)}`,
        },
      ],
    };
  }

  try {
    return ValidationResultSchema.parse(parsed);
  } catch (err) {
    return {
      ...FALLBACK_RESULT,
      issues: [
        {
          category: 'generic-content',
          severity: 'major',
          description: `Validator schema validation failed: ${(err as Error).message.slice(0, 200)}`,
        },
      ],
    };
  }
}

export interface RewriteOptions {
  livrable: string;
  livrableType: LivrableType;
  context: QualityValidationContext;
  validation: QualityValidationResult;
  /** Original generation prompt to combine with rewrite suggestions. */
  originalPrompt: string;
  llmFn: LLMFn;
  maxTokens?: number;
}

/**
 * Tentative de réécriture basée sur les rewriteSuggestions du validateur.
 * Utilise le prompt original + injection des suggestions ciblées.
 */
export async function rewriteLivrable(opts: RewriteOptions): Promise<string> {
  const issuesBlock = opts.validation.issues
    .map(
      (i) =>
        `- [${i.severity}/${i.category}] ${i.description}${i.excerpt ? ` — extrait : "${i.excerpt}"` : ''}`,
    )
    .join('\n');

  const rewritePrompt = `Tu dois RÉÉCRIRE le livrable suivant en corrigeant les problèmes identifiés par l'éditeur.

## PROMPT ORIGINAL DU LIVRABLE
${opts.originalPrompt}

## LIVRABLE PRODUIT (à corriger)
${opts.livrable}

## DÉFAUTS IDENTIFIÉS PAR L'ÉDITEUR (score=${opts.validation.score.toFixed(1)}/10)
${issuesBlock}

${opts.validation.rewriteSuggestions ? `## SUGGESTIONS DE RÉÉCRITURE\n${opts.validation.rewriteSuggestions}\n` : ''}

## CONSIGNE
Réécris le livrable EN ENTIER en corrigeant chaque défaut. Garde la structure (titre, longueur, sections) mais retravaille le ton et les formulations problématiques. Sortie : juste le livrable réécrit, pas de méta, pas de wrapping.`;

  const raw = await opts.llmFn(rewritePrompt, {
    temperature: 0.4,
    maxTokens: opts.maxTokens ?? 1800,
  });
  return typeof raw === 'string' ? raw : String(raw);
}

export interface ValidatedGenerationResult {
  finalText: string;
  iterations: number;
  finalValidation: QualityValidationResult;
  history: Array<{ iteration: number; score: number; passed: boolean }>;
}

export interface RunValidatedGenerationOptions {
  initialText: string;
  originalPrompt: string;
  livrableType: LivrableType;
  context: QualityValidationContext;
  llmFn: LLMFn;
  maxIterations?: number;
  passThreshold?: number;
  rewriteMaxTokens?: number;
}

/**
 * Pipeline complet : valide une génération initiale, et si sous-cap,
 * tente jusqu'à `maxIterations - 1` réécritures. Retourne la meilleure
 * version (par score). Garantit cap dur sur nombre d'appels LLM.
 *
 * Note : `initialText` est passé déjà généré (n'appelle pas le 1er Sonnet
 * de génération). C'est volontaire pour découpler la composition du
 * livrable (qui dépend du contexte épisode) de la pipeline validation.
 */
export async function runValidatedGeneration(
  opts: RunValidatedGenerationOptions,
): Promise<ValidatedGenerationResult> {
  const maxIterations = opts.maxIterations ?? 3;
  const passThreshold = opts.passThreshold ?? 7.5;

  const history: Array<{ iteration: number; score: number; passed: boolean }> = [];
  let currentText = opts.initialText;
  let bestText = opts.initialText;
  let bestValidation: QualityValidationResult | null = null;

  // Iteration 1 : validate initial. Iteration 2-N : rewrite + validate.
  // maxIterations counts validation passes, not rewrites.
  for (let iter = 1; iter <= maxIterations; iter++) {
    const validation = await validateLivrableQuality(
      currentText,
      opts.livrableType,
      opts.context,
      opts.llmFn,
    );
    history.push({
      iteration: iter,
      score: validation.score,
      passed: validation.passed,
    });

    if (!bestValidation || validation.score > bestValidation.score) {
      bestValidation = validation;
      bestText = currentText;
    }

    if (validation.passed && validation.score >= passThreshold) {
      return {
        finalText: currentText,
        iterations: iter,
        finalValidation: validation,
        history,
      };
    }

    if (iter >= maxIterations) break;

    // Tentative rewrite avant la prochaine itération de validation
    try {
      currentText = await rewriteLivrable({
        livrable: currentText,
        livrableType: opts.livrableType,
        context: opts.context,
        validation,
        originalPrompt: opts.originalPrompt,
        llmFn: opts.llmFn,
        maxTokens: opts.rewriteMaxTokens,
      });
    } catch (err) {
      // Si le rewrite plante, on garde la meilleure version vue à date
      break;
    }
  }

  return {
    finalText: bestText,
    iterations: history.length,
    finalValidation: bestValidation ?? FALLBACK_RESULT,
    history,
  };
}
