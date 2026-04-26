// ClientConfig — squelette déclaratif d'un client Sillon.
//
// Règle anti-overgeneralization :
// - Chaque section ci-dessous est imposée par le pilote Stefani (cas présent)
//   ET utile à un client podcast futur (cas roadmap : Bababam, Nouvelles
//   Écoutes, Binge Q3 2026 + verticales 2027).
// - Pas de champ multi-langue, streaming, webhooks, API publique : pas dans
//   ROADMAP_INTERNE.md à 12 mois.

export interface ClientConfig {
  client_id: string;
  display_name: string;

  // Tenants podcast couverts par ce client. Cas présent : Stefani opère
  // 6 tenants. Cas futur : un client #2 podcast peut couvrir 1..N tenants.
  tenants: string[];

  tone_profile: ClientToneProfile;

  // Lentilles d'analyse activables selon contexte (rôle invité etc.).
  // Cas présent : ovni-vc pour Stefani. Cas futur : chaque client podcast
  // aura ses lens propres.
  lenses: ClientLens[];

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
}

export interface ClientLens {
  id: string;
  label: string;
  description: string;
  // Règle d'activation textuelle (lue par l'agent pack lundi-mardi).
  activates_when: string;
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
