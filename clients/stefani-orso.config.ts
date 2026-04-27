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
      'plonge dans',
      'fascinant',
      'ne ratez pas',
      'incontournable',
      'révolutionnaire',
    ],
    style_examples: [], // à remplir lundi avec extraits Stefani réels
    // V2 FIX 5 (Phase 5 finding F-P5-2) : phrases du host à ne JAMAIS
    // attribuer à un invité. Mitigation pilote de l'absence de
    // diarization Whisper (cf. docs/DETTE.md).
    host_blacklist_phrases: [
      // Phrase-fétiche Stefani documentée (PERSONAS_ORSO.md ligne 70)
      'Nous sommes la moyenne des personnes que nous fréquentons',
      // Tagline GDIY iconique
      'Bravo vous avez écouté cet épisode de GDIY jusqu\'au bout',
    ],
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
        // V4 recalibration : ancrage explicite "DTC" / "consommateur" dans
        // chaque concept pour exclure le SaaS B2B générique (V3 finding F4).
        concepts: [
          'e-commerce DTC (vente directe consommateur)',
          'acquisition payante DTC : Facebook Ads, Google Ads, Amazon Ads',
          'performance marketing pour produit physique consommateur',
          'CAC LTV pour brand DTC',
          'scaling DTC : lancement produit, fulfillment, retours',
          'brand digital natif vendant en direct',
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
        // V4 recalibration : resserrer dans le domaine assurance pour exclure
        // le SaaS B2B générique servant des financiers (V3 finding F2).
        concepts: [
          'insurtech B2B (assurance + tech)',
          'cyber-insurance ou assurance cyber',
          'couverture risques entreprise',
          'distribution assurance via courtiers',
          "sinistralité, prime, polices d'assurance",
          'risque émergent assurable',
        ],
      },
      description:
        'Insurtech B2B (cyber, RH, garantie spécialisée).',
      // V4 finding F-V4-1 : Plais (Platform.sh) reçoit 10 faux positifs
      // marginaux (score 0.30-0.40) car Sonnet associe "risque" générique
      // (sécurité/données/Patriot Act) à "risque assurable". Seuil 0.5
      // élimine les marginaux tout en préservant les vrais matches Veyrat
      // (Stoïk insurtech) qui sont à score plus élevé sur sujet assurance
      // central.
      match_threshold: 0.5,
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
      // V4 recalibration : seuil par-lens à 0.6 (vs 0.3 global) pour que
      // ce fallback ne devienne pas dominant — si Sonnet retourne un match
      // 0.4-0.5 sur editorial-base, c'est probablement du bruit. On garde
      // les concepts génériques mais on exige un score plus haut (V3
      // finding F3 : 20/47 segments matchés sur Plais = over-matching).
      match_threshold: 0.6,
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
