/**
 * pack-stefani-l1-l5 — Phase Alpha S2 T2.2 complément 29/04 PM.
 *
 * Définition canonique du pack 5 livrables Sillon (L1 KeyMoments → L5 Brief
 * Annexe) pour le pilote Stefani-Orso. Reflet déclaratif de l'ordre
 * d'orchestration historique de
 * experiments/autonomy-session-2026-04-28/phase6-runner.ts (1244 lignes).
 *
 * Anti-overgeneralization (cf. CLAUDE.md règles 1-7) :
 * - aucun nom de tenant en dur (pack reste podcast-agnostic au niveau
 *   PackDefinition — c'est la `clientConfig` injectée à runPack qui amène
 *   les tenants).
 * - "extract-key-moments" / "extract-quotes" / etc. sont des agent_id
 *   génériques (pas "podcast-key-moments"), réutilisables cinéma/talent
 *   demain.
 */

import type { PackDefinition } from '../runPack';

export const packStefaniL1L5: PackDefinition = {
  pack_id: 'pack-stefani-l1-l5',
  display_name: 'Stefani-Orso 5 livrables',
  output_format: 'markdown',
  beneficiary_type: 'creator',
  steps: [
    { step_id: 'L1', agent_id: 'extract-key-moments', required: true },
    { step_id: 'L2', agent_id: 'extract-quotes', required: true },
    // L3, L4, L5 marqués `required: false` parce qu'en T2.2 ils sont stubbés
    // (deferred — cf. engine/agents/wrappers/stubAgents.ts). Quand industrialisés,
    // remettre `required: true`.
    { step_id: 'L3', agent_id: 'cross-reference-episode', required: false },
    { step_id: 'L4', agent_id: 'build-newsletter', required: false },
    { step_id: 'L5', agent_id: 'build-brief-annexe', required: false },
  ],
};
