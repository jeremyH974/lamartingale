import type { ClientConfig } from '../types/client-config';

// runPack — orchestrateur générique d'un livrable Sillon.
//
// Pattern : Generic step-based pipeline orchestrator (cf.
// docs/patterns-emergents.md). Chaque étape (PackStep) référence un
// agent_id que le caller fournit via AgentRegistry. runPack ne sait
// rien des agents — il oriente seulement l'ordre, propage la sortie de
// l'étape précédente, gère timeouts/erreurs/budget, et collecte les
// résultats sous une forme homogène (StepResult[]).
//
// Anti-overgeneralization :
// - PackDefinition / PackStep / PackOutput / StepResult sont imposés
//   par le pilote Stefani (cas présent) et restent utiles à tout
//   client podcast futur ainsi qu'aux verticales 12 mois (cinéma,
//   talent management — décisions D1+D2 du 29/04 PM).
// - output_format = 'markdown' restrictif au pilote ; le type littéral
//   sera étendu quand les formats P2 (audio-overview, google-docs,
//   pdf, html-newsletter) seront construits, pas avant.
// - Pas de parallel/retry/schedule : pas dans ROADMAP_INTERNE.md.
// - Le `payload` opaque (unknown) entre étapes garde le pipeline
//   réutilisable pour des sources non-podcast (transcript ciné,
//   transcript talent) sans modif d'engine.

export type PackOutputFormat = 'markdown';
// Cas futurs (ROADMAP_INTERNE.md P2) : 'audio' (Audio Overview),
// 'google-docs', 'pdf', 'html-newsletter'. Étendre le type littéral
// au moment où chaque format est construit.

/**
 * Bénéficiaire d'un pack — qui consomme le livrable.
 *
 * Engagement 3 du brief-primitives-2026-04-28 : champ string libre pour
 * supporter la tripartition créateur / audience / sponsor sans coder les
 * 3 modes maintenant.
 *
 * - Pilote Stefani-Orso = 'creator' uniquement (cap 4 anti-overgeneralization).
 * - Espace 2 (re-circulation catalogue) = 'audience' future.
 * - Espace 3 (pitch decks sponsor) = 'sponsor' future.
 *
 * Le set fermé n'est pas verrouillé via un union TS pour permettre aux
 * clients de définir leurs propres beneficiary_type sans modif engine.
 * La validation runtime (présence + non-vide) vit dans
 * `validatePackDefinition()`.
 */
export type PackBeneficiaryType = string;

export interface PackDefinition {
  pack_id: string;
  display_name: string;
  steps: PackStep[];
  output_format: PackOutputFormat;
  /**
   * Bénéficiaire du pack. Mandatory à partir de l'Engagement 3.
   * Pilote = 'creator'.
   */
  beneficiary_type: PackBeneficiaryType;
}

/**
 * Valide qu'une PackDefinition a tous ses champs obligatoires non-vides.
 * Throw avec un message diagnostiquable.
 *
 * Discipline runtime : ne fait PAS confiance au TS — un caller JS, ou un
 * import depuis un JSON, peut violer le contrat. La validation est simple
 * (présence + type primitif) ; on ne valide pas la valeur sémantique de
 * beneficiary_type (qui est ouverte par design).
 */
export function validatePackDefinition(
  packDef: unknown,
): asserts packDef is PackDefinition {
  if (typeof packDef !== 'object' || packDef === null) {
    throw new Error('validatePackDefinition: packDef must be an object');
  }
  const p = packDef as Record<string, unknown>;
  if (typeof p.pack_id !== 'string' || !p.pack_id.trim()) {
    throw new Error('validatePackDefinition: pack_id is required (non-empty string)');
  }
  if (typeof p.display_name !== 'string' || !p.display_name.trim()) {
    throw new Error('validatePackDefinition: display_name is required');
  }
  if (!Array.isArray(p.steps)) {
    throw new Error('validatePackDefinition: steps must be an array');
  }
  for (let i = 0; i < p.steps.length; i++) {
    const s = p.steps[i] as Record<string, unknown>;
    if (typeof s?.step_id !== 'string' || !s.step_id.trim()) {
      throw new Error(`validatePackDefinition: steps[${i}].step_id required`);
    }
    if (typeof s?.agent_id !== 'string' || !s.agent_id.trim()) {
      throw new Error(`validatePackDefinition: steps[${i}].agent_id required`);
    }
    if (typeof s?.required !== 'boolean') {
      throw new Error(`validatePackDefinition: steps[${i}].required must be boolean`);
    }
  }
  if (typeof p.output_format !== 'string' || !p.output_format) {
    throw new Error('validatePackDefinition: output_format is required');
  }
  if (typeof p.beneficiary_type !== 'string' || !p.beneficiary_type.trim()) {
    throw new Error(
      'validatePackDefinition: beneficiary_type is required (non-empty string). Pilot expects "creator".',
    );
  }
}

export interface PackStep {
  step_id: string;
  agent_id: string;
  required: boolean;
  config_overrides?: Record<string, unknown>;
}

export interface StepResult {
  step_id: string;
  agent_id: string;
  status: 'success' | 'skipped' | 'failed';
  output?: unknown;
  error?: string;
  duration_ms: number;
  cost_estimate_cents?: number;
}

export interface PackOutputMetadata {
  pack_display_name: string;
  output_format: PackOutputFormat;
  total_duration_ms: number;
  total_cost_estimate_cents: number;
}

export interface PackOutput {
  pack_id: string;
  client_id: string;
  source_id: string;
  generated_at: string; // ISO-8601
  steps_results: StepResult[];
  metadata: PackOutputMetadata;
}

/**
 * Contrat d'un agent invocable par runPack.
 *
 * Le `payload` opaque permet à un agent de consommer la sortie typée
 * d'un agent en amont sans que runPack ait à connaître ces types.
 * C'est la clé de la généralisation cross-corpus : aucun champ ici
 * ne mentionne "podcast", "transcript", "épisode" ou "guest".
 */
export interface AgentInvocationContext {
  /** Identifiant de la source à traiter (ex: ID épisode, ID interview). */
  sourceId: string;
  /** Configuration client (tenants, ton, lentilles, etc.). */
  clientConfig: ClientConfig;
  /** Overrides de configuration spécifiques à ce step. */
  configOverrides?: Record<string, unknown>;
  /**
   * Résultats des steps précédents du même pack, indexés par step_id.
   * Permet à un agent aval de consommer la sortie d'un agent amont
   * (ex: L4 newsletter consomme L1 keymoments + L2 quotes + L3 crossrefs).
   */
  prior: Record<string, unknown>;
}

export interface AgentInvocationResult {
  /** Sortie opaque, transmise aux agents avals via `prior[step_id]`. */
  output: unknown;
  /** Coût LLM estimé en centièmes de centime US (= 1/10000 USD). */
  cost_estimate_cents?: number;
}

/**
 * Fonction d'agent. Async. Doit throw en cas d'échec — runPack capture
 * l'exception et la transforme en StepResult.failed.
 */
export type AgentFn = (ctx: AgentInvocationContext) => Promise<AgentInvocationResult>;

/**
 * Registry minimal. Le caller fournit son propre registry (Map en prod,
 * mock en tests). runPack n'expose aucune dépendance vers les primitives
 * concrètes (extractKeyMoments, extractQuotes, etc.) : elles sont
 * branchées par le caller.
 */
export interface AgentRegistry {
  get(agentId: string): AgentFn | undefined;
}

export interface RunPackOptions {
  /**
   * Plafond de coût LLM cumulé en cents-USD (USD × 100). Si dépassé,
   * runPack STOP les steps suivants et marque le pack failed (mais
   * conserve les StepResult des steps déjà passés). Default = pas de
   * cap (Number.POSITIVE_INFINITY).
   */
  budgetCapCents?: number;
  /**
   * Horodatage forcé pour le champ `generated_at` (tests reproductibles).
   * Default = `new Date().toISOString()`.
   */
  now?: () => string;
}

/**
 * Exécute un pack séquentiellement.
 *
 * Comportement par étape :
 * - lookup agent dans le registry → si manquant ET step required → throw
 *   PackError. Si manquant ET non-required → StepResult.skipped.
 * - invoque l'agent dans un try/catch. Exception → StepResult.failed
 *   (et runPack stoppe si la step était required).
 * - succès → StepResult.success + output transmis aux steps suivants
 *   via `prior[step_id]`.
 * - cumule cost_estimate_cents. Si budgetCapCents dépassé après une
 *   step → marque les steps restantes "skipped" (raison: budget) et
 *   retourne un PackOutput partiel.
 *
 * Idempotence : runPack lui-même est idempotent (pas de side-effect
 * persistant). Les agents peuvent ne pas l'être — c'est leur
 * responsabilité de gérer leurs effets.
 */
export async function runPack(
  packDef: PackDefinition,
  sourceId: string,
  clientConfig: ClientConfig,
  registry: AgentRegistry,
  options: RunPackOptions = {},
): Promise<PackOutput> {
  validatePackDefinition(packDef);

  const now = options.now ?? (() => new Date().toISOString());
  const budgetCap = options.budgetCapCents ?? Number.POSITIVE_INFINITY;
  const startedAt = Date.now();

  const stepsResults: StepResult[] = [];
  const prior: Record<string, unknown> = {};
  let cumulativeCostCents = 0;
  let budgetExceeded = false;

  for (const step of packDef.steps) {
    const stepStart = Date.now();

    // Si budget déjà dépassé, on skip les steps restantes sans appeler les agents.
    if (budgetExceeded) {
      stepsResults.push({
        step_id: step.step_id,
        agent_id: step.agent_id,
        status: 'skipped',
        error: 'budget_cap_reached',
        duration_ms: 0,
      });
      continue;
    }

    const agent = registry.get(step.agent_id);
    if (!agent) {
      if (step.required) {
        // Step required + agent introuvable = erreur fatale qui stoppe le pack.
        // On enregistre la failure puis on quitte la boucle.
        stepsResults.push({
          step_id: step.step_id,
          agent_id: step.agent_id,
          status: 'failed',
          error: `agent_not_found: ${step.agent_id}`,
          duration_ms: Date.now() - stepStart,
        });
        break;
      }
      stepsResults.push({
        step_id: step.step_id,
        agent_id: step.agent_id,
        status: 'skipped',
        error: 'agent_not_registered',
        duration_ms: Date.now() - stepStart,
      });
      continue;
    }

    try {
      const result = await agent({
        sourceId,
        clientConfig,
        configOverrides: step.config_overrides,
        prior,
      });
      const stepCost = result.cost_estimate_cents ?? 0;
      cumulativeCostCents += stepCost;

      stepsResults.push({
        step_id: step.step_id,
        agent_id: step.agent_id,
        status: 'success',
        output: result.output,
        duration_ms: Date.now() - stepStart,
        cost_estimate_cents: stepCost,
      });
      prior[step.step_id] = result.output;

      if (cumulativeCostCents > budgetCap) {
        budgetExceeded = true;
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      stepsResults.push({
        step_id: step.step_id,
        agent_id: step.agent_id,
        status: 'failed',
        error: message,
        duration_ms: Date.now() - stepStart,
      });
      if (step.required) {
        break;
      }
    }
  }

  return {
    pack_id: packDef.pack_id,
    client_id: clientConfig.client_id,
    source_id: sourceId,
    generated_at: now(),
    steps_results: stepsResults,
    metadata: {
      pack_display_name: packDef.display_name,
      output_format: packDef.output_format,
      total_duration_ms: Date.now() - startedAt,
      total_cost_estimate_cents: cumulativeCostCents,
    },
  };
}

/**
 * Helper : crée un AgentRegistry à partir d'une Map. Utile pour tests
 * et pour les callers qui assemblent leur registry dynamiquement.
 */
export function createMapAgentRegistry(map: Map<string, AgentFn>): AgentRegistry {
  return {
    get(agentId: string): AgentFn | undefined {
      return map.get(agentId);
    },
  };
}
