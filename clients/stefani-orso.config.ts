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

  // Lens registry pilote Stefani-Orso — 5 lens (4 thématiques + 1 fallback).
  // Tous utilisent concept-match-v1 comme scoring strategy déterministe
  // (registered via registerPilotScoringStrategies au boot pipeline).
  // Le lensClassificationAgent V1 (Phase 3) délègue le scoring à Sonnet ;
  // concept-match-v1 sert de baseline déterministe et de backup.
  lenses: [
    {
      id: 'ovni-vc-deeptech',
      type: 'editorial',
      scoring_strategy_id: 'concept-match-v1',
      applicable_content_types: ['podcast_episode'],
      parameters: {
        concepts: [
          'scaleup tech B2B européenne',
          'deeptech infrastructure',
          'levée Series B+ 50M€-300M€',
          'fondateur tech avec ambition européenne',
          'product/market fit confirmé',
          'enjeu de scale international',
          'profil eligible Ovni Capital VC',
        ],
      },
      description:
        'Scaleup tech B2B avec ambition européenne, profil Ovni Capital.',
    },
    {
      id: 'alternative-investments',
      type: 'editorial',
      scoring_strategy_id: 'concept-match-v1',
      applicable_content_types: ['podcast_episode'],
      parameters: {
        concepts: [
          'investissement spéculatif niche',
          'collectibles (cartes, montres, art, sneakers)',
          'crypto trading expert',
          'immobilier atypique (parkings, terres, garages)',
          'rendement asymétrique',
          'marché illiquide ou émergent',
          'patrimoine non-conventionnel',
        ],
      },
      description:
        'Investissement hors-marché classique, niche, asymétrique.',
    },
    {
      id: 'dtc-acquisition-tactical',
      type: 'editorial',
      scoring_strategy_id: 'concept-match-v1',
      applicable_content_types: ['podcast_episode'],
      parameters: {
        concepts: [
          'e-commerce DTC',
          'acquisition payante (Facebook Ads, Google, Amazon)',
          'performance marketing',
          'CAC LTV unit economics',
          'scaling operationnel rapide',
          'brand-building digital natif',
          'retail tactique data-driven',
        ],
      },
      description:
        'E-commerce DTC avec stratégie acquisition payante performance.',
    },
    {
      id: 'b2b-insurance-tech',
      type: 'editorial',
      scoring_strategy_id: 'concept-match-v1',
      applicable_content_types: ['podcast_episode'],
      parameters: {
        concepts: [
          'insurtech B2B',
          'cyber-insurance',
          'assurance entreprise spécialisée',
          'tech au service de la finance',
          'product mid-market',
          'distribution via courtiers',
          'risque émergent',
        ],
      },
      description:
        'Insurtech B2B (cyber, RH, garantie spécialisée).',
    },
    {
      id: 'editorial-base',
      type: 'editorial',
      scoring_strategy_id: 'concept-match-v1',
      applicable_content_types: ['podcast_episode'],
      parameters: {
        concepts: [
          'parcours entrepreneurial',
          'leçons business',
          'discipline mentale',
          'prise de risque',
          "culture d'entreprise",
        ],
      },
      description:
        'Lens fallback générique, applicable à la plupart des épisodes Orso.',
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
