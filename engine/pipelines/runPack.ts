import type { ClientConfig } from '../types/client-config';

// runPack — orchestrateur générique d'un livrable Sillon.
//
// Squelette typé. L'implémentation effective des étapes (transcribe,
// agents) atterrira lundi-mardi quand les agents existeront. Cette
// session pose seulement la signature et les types de bord.
//
// Règle anti-overgeneralization :
// - PackDefinition / PackStep / PackOutput / StepResult sont imposés
//   par le pilote Stefani (cas présent) et restent utiles à tout
//   client podcast futur (Bababam Q3 2026, Sillon Daily P2).
// - output_format = 'markdown' restrictif au pilote ; le type littéral
//   sera étendu quand les formats P2 (audio-overview, google-docs,
//   pdf, html-newsletter) seront construits, pas avant.
// - Pas de parallel/retry/schedule : pas dans ROADMAP_INTERNE.md.

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

// AgentRegistry — interface minimale. La structure concrète sera définie
// lundi quand le premier agent atterrira. Ici on type juste la dépendance
// que runPack a besoin d'avoir, pour permettre au reste du code (renderer,
// tests) d'avancer.
export interface AgentRegistry {
  get(agentId: string): unknown;
}

export async function runPack(
  packDef: PackDefinition,
  sourceId: string,
  clientConfig: ClientConfig,
  registry: AgentRegistry,
): Promise<PackOutput> {
  // Volontairement non-implémenté : les agents arrivent lundi.
  // La signature est figée pour permettre au renderer + tests squelette
  // de référencer les types sans dépendre d'une implémentation.
  void packDef;
  void sourceId;
  void clientConfig;
  void registry;
  throw new Error('runPack: not implemented yet — agents needed first');
}
