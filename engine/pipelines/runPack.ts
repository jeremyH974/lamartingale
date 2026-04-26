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

export interface PackDefinition {
  pack_id: string;
  display_name: string;
  steps: PackStep[];
  output_format: PackOutputFormat;
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
