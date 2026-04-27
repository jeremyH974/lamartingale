// ClientConfig — squelette déclaratif d'un client Sillon.
//
// Règle anti-overgeneralization :
// - Chaque section ci-dessous est imposée par le pilote Stefani (cas présent)
//   ET utile à un client podcast futur (cas roadmap : Bababam, Nouvelles
//   Écoutes, Binge Q3 2026 + verticales 2027).
// - Pas de champ multi-langue, streaming, webhooks, API publique : pas dans
//   ROADMAP_INTERNE.md à 12 mois.

import type { Lens } from './lens';

export interface ClientConfig {
  client_id: string;
  display_name: string;

  // Tenants podcast couverts par ce client. Cas présent : Stefani opère
  // 6 tenants. Cas futur : un client #2 podcast peut couvrir 1..N tenants.
  tenants: string[];

  tone_profile: ClientToneProfile;

  // Lentilles d'analyse activables selon contexte. Engagement 2 du brief
  // primitives 2026-04-28 : passage du shape ad-hoc {label, activates_when}
  // au shape Lens générique (id, type, scoring_strategy_id, parameters)
  // partagé entre clients podcast et futurs clients verticales.
  // Cf. engine/types/lens.ts.
  lenses: Lens[];

  // Sujets à ne jamais évoquer/inférer dans les outputs. Cas présent :
  // alvo-egery côté Stefani. Cas futur : chaque client a ses sujets sensibles.
  sensitive_topics: ClientSensitiveTopic[];

  // Packs livrables actifs pour ce client. Cas présent : pack-1, pack-2 pilote.
  // Cas futur : pack-3+ dans roadmap (Audio Overview, Sillon Daily P2).
  active_packs: string[];

  notification_email: string;

  pilot?: ClientPilot;
}

export interface ClientToneProfile {
  description: string;
  // Patterns à bannir explicitement à la rédaction.
  forbidden_patterns: string[];
  // Extraits de référence (vide au pilote, rempli post-discovery).
  style_examples: string[];
  /**
   * Phrases-fétiches du host à NE PAS attribuer à l'invité dans
   * extractQuotes. Mitigation pilote du gap diarization Whisper
   * (Phase 5 V1 finding F-P5-2). Optional.
   *
   * Une quote dont le `text` contient (case-insensitive substring)
   * une de ces chaînes sera REJETÉE même si elle passe le verbatim
   * guard, parce que l'attribution est probablement erronée.
   *
   * À enrichir au fil du pilote si nouvelles phrases-fétiches
   * découvertes. Solution complète post-pilote : intégrer Whisper
   * diarization (AssemblyAI / Deepgram / Whisper plugin) — cf.
   * docs/DETTE.md.
   */
  host_blacklist_phrases?: string[];
}

export interface ClientSensitiveTopic {
  topic: string;
  description: string;
}

export interface ClientPilot {
  is_pilot: boolean;
  pilot_episodes_target: number;
  pilot_start_date: string;  // YYYY-MM-DD
  pilot_send_target: string; // YYYY-MM-DD
}
