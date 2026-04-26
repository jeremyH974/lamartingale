import type { ClientConfig } from '../engine/types/client-config';

// Client : Matthieu Stefani / Orso Media (pilote Sillon).
// Squelette déclaratif. Le contenu fin (style_examples, lens-rules détaillées)
// sera affiné lundi-mardi quand les agents existeront.

export const stefaniOrsoConfig: ClientConfig = {
  client_id: 'stefani-orso',
  display_name: 'Matthieu Stefani / Orso Media',

  tenants: [
    'lamartingale',
    'gdiy',
    'lepanier',
    'finscale',
    'passionpatrimoine',
    'combiencagagne',
  ],

  tone_profile: {
    description:
      "Direct, exigeant, anti-cliché. Privilégie la précision factuelle au " +
      "storytelling. Pas de phrases creuses type \"plongez dans...\", " +
      "\"fascinant...\", \"ne ratez pas...\".",
    forbidden_patterns: [
      'plongez dans',
      'fascinant',
      'ne ratez pas',
      'incontournable',
      'révolutionnaire',
    ],
    style_examples: [], // à remplir lundi avec extraits Stefani réels
  },

  lenses: [
    {
      id: 'ovni-vc',
      label: 'Ovni Capital VC Lens',
      description:
        "Perspective fonds VC Deeptech FR (Ovni Capital, cofondé par Stefani). " +
        "Active la due diligence VC sur invités tech founders/CTO.",
      activates_when:
        'invité.role IN [tech_founder, cto, deeptech_executive]',
    },
  ],

  sensitive_topics: [
    {
      topic: 'alvo-egery',
      description:
        "Rachat Egery par Alvo début 2026, sujet potentiellement amer côté " +
        "Stefani. Ne jamais mentionner ni inférer.",
    },
  ],

  active_packs: ['pack-1', 'pack-2'],

  notification_email: 'matthieu@orsomedia.io', // à confirmer Jérémy

  pilot: {
    is_pilot: true,
    pilot_episodes_target: 4,
    pilot_start_date: '2026-04-28',
    pilot_send_target: '2026-05-06',
  },
};
