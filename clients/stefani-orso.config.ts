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
      // V3 — auto-éval Phase 5 V2 a flaggé ces formules scolaires :
      'ouvrent des pistes intéressantes',
      'des perspectives variées',
      'ce qui est essentiel dans',
      'résonance avec', // formule scolaire trop fréquente
      'préparation d\'interviews et de due diligence',
      // Connecteurs scolaires lourds que Stefani évite
      'par ailleurs',
      'en outre',
      'de plus,',
    ],
    style_examples: [], // à remplir post-pilote avec extraits Stefani réels
    // V2 FIX 5 (Phase 5 finding F-P5-2) : phrases du host à ne JAMAIS
    // attribuer à un invité. Mitigation pilote de l'absence de
    // diarization Whisper (cf. docs/DETTE.md).
    host_blacklist_phrases: [
      // Phrase-fétiche Stefani documentée (PERSONAS_ORSO.md ligne 70)
      'Nous sommes la moyenne des personnes que nous fréquentons',
      // Tagline GDIY iconique
      'Bravo vous avez écouté cet épisode de GDIY jusqu\'au bout',
    ],
    // V3 (décision Jérémy 2026-04-28) : calibration tone Stefani concrète.
    prefer_vocabulary: [
      'préparation interview',     // pas "due diligence"
      'investisseur',              // pas le sigle "VC"
      'production éditoriale',     // pas "valeur côté auditeur"
      'créateur',                  // contexte hôte podcast
      'opérateur',                 // pour parler des fondateurs
      'catalogue',                 // référence cross-corpus
    ],
    style_constraints: {
      sentence_length: 'courte à moyenne (max 25 mots)',
      tone: 'opinions tranchées, pas de neutralité diplomatique',
      transitions:
        'directes, pas de connecteurs scolaires (par ailleurs, en outre, de plus)',
      ending:
        'pas de phrase de conclusion molle. Si phrase finale, doit poser une question ou affirmer une thèse.',
    },
    persona_guidance:
      "Matthieu Stefani, créateur GDIY. Ton ferme, références concrètes, " +
      "anecdotes business, pas de jargon. Ses lecteurs sont entrepreneurs " +
      "et investisseurs senior — pas besoin d'expliquer les bases.",

    // V4 (refonte Phase 5 V4 — brief 2026-04-30) : corpus de style pour
    // few-shot injection L3/L4/L5. 6 newsletters Stefani réelles stockées
    // dans data/style-corpus/stefani/. Chargées à la demande par
    // engine/agents/loadStyleCorpus.ts (pas inlines ici pour ne pas
    // bloater la config).
    style_corpus: {
      newsletters: [
        {
          id: 'usages-ia-2026-04',
          title: "Les meilleurs usages de l'IA",
          date: '2026-04-21',
          url: 'https://matt.kessel.media/posts/pst_6cacd87ea485417d913df6d2712b2d2f/les-meilleurs-usages-de-lia',
          pattern_tags: [
            'anecdote-personnelle',
            'questions-ouvertes',
            'diagnostic-systemique',
            'sujet-tech',
          ],
          excerpts: [
            "Aujourd'hui j'ai envie de vous partager une anecdote...",
            'Génie.',
            "Cette anecdote m'a fait réaliser quelque chose qui me travaille depuis...",
            "Un sommelier-comptable-courtier permanent, accessible à 3h du matin si besoin.",
          ],
          reco_format_example:
            "Tout le monde a grandi avec Maya l'Abeille. Mais personne ne sait ce qui se passe vraiment derrière. Sixte de Vauplane a racheté ces franchises. Construit sa propre IA pour les produire. Et atteint 22 milliards de vues par an en faisant l'exact inverse de ce qu'Hollywood fait depuis toujours.\n\nSa thèse : refuser l'IA aujourd'hui, c'est refuser l'arrivée du son en 1927.\n\nUn épisode qui va changer votre regard sur l'animation, l'IA, et ce que \"créer\" veut encore dire.",
        },
        {
          id: 'acheter-juste-2025-11',
          title: 'Acheter juste, ou acheter possible ?',
          date: '2025-11-03',
          pattern_tags: [
            'opening-court',
            'tension-personnelle',
            'pistes-numerotees',
            'conclusion-transcendante',
            'analyse-systemique',
          ],
          excerpts: [
            "En 2025, il \"faut\" passer à l'électrique.",
            "Sur le papier, j'y vais. 100%.",
            'Dans la vraie vie, je cale.',
            "Le consommateur devient l'ultime régulateur, sommé de résoudre seul ce que l'industrie et la politique ont laissé filer.",
            "L'injonction morale, sans infrastructure cohérente, devient un impôt psychologique.",
          ],
        },
        {
          id: 'souhaits-2026-01',
          title: 'Ce que je vous souhaite en 2026',
          date: '2026-01-11',
          pattern_tags: [
            'titre-provocateur',
            'mot-isole',
            'liste-numerotee-actionnable',
            'discipline-mentale',
          ],
          excerpts: [
            'Rien.',
            'Ou plutôt si.',
            'Les choses ne tombent pas du ciel. Elles se provoquent.',
            "Vouloir ne suffit pas. Vouloir, c'est un mirage.",
            "Faire d'abord ce qui est pénible a un effet immédiat : la charge mentale s'effondre.",
          ],
        },
        {
          id: 'taxe-zucman-2025-09',
          title: "L'idée n'est plus de savoir si mais quand",
          date: '2025-09-22',
          pattern_tags: [
            'constat-brutal',
            'prise-de-position',
            'questions-cadrantes',
            'analyse-politique',
          ],
          excerpts: [
            'Terminé le débat sur cette taxe.',
            "Le débat n'est plus.",
            "Cette taxe va donc arriver, et c'est probablement une bonne chose.",
          ],
        },
        {
          id: 'moyenne-efforts-2025-09',
          title: 'Sommes-nous la moyenne de nos efforts ?',
          date: '2025-09-15',
          pattern_tags: [
            'phrase-fetiche-exergue',
            'dialogue-rapporte',
            'conclusion-engagee',
            'tension-morale',
          ],
          excerpts: [
            'Essaye donc de courir un marathon sans entraînement.',
            "Mais une chose reste non négociable : l'effort, le travail, l'engagement.",
            'Pour que la moyenne générale remonte enfin.',
          ],
        },
        {
          id: 'tout-vendre-2025-04',
          title: 'Faut-il tout vendre maintenant ?',
          date: '2025-04-21',
          pattern_tags: [
            'titre-question',
            'analyse-strategique',
            'conclusion-rassurante-lucide',
            'long-terme',
          ],
          excerpts: [
            'Et pourtant si vous ne gardez pas la tête froide en ce moment, que vous changez de direction telle une girouette avec le sens du vent, vous allez rapidement vous perdre.',
            'Alors la stratégie est claire : pensez long terme et respectez votre mission.',
            'Tout va bien se passer.',
          ],
        },
      ],
      // V4 — extension de host_blacklist_phrases : phrases-fétiches Stefani
      // qui ne doivent JAMAIS être attribuées à l'invité ni recopiées dans
      // newsletter/brief annexe (sauf si Stefani lui-même les écrit).
      host_blacklist_phrases: [
        'Nous sommes la moyenne des personnes que nous fréquentons',
        'Nous sommes la moyenne des personnes',
        'On est la moyenne des personnes',
        'Casquette Verte',
        'Bisous,',
        'Matt/',
      ],
      signature_expressions: [
        'Boom.',
        'Sale.',
        'Génie.',
        'Fou.',
        'Le feu',
        "à l'arrache",
        'tout bien réfléchi',
        'Au fond',
        'DCA',
        'single source of truth',
      ],
      ecosystem_reference: {
        canonical_phrase: 'écosystème Orso',
        alternatives: [
          'la team GDIY et Orso Media',
          "l'équipe d'Orso",
          'nos amis du catalogue Orso',
          'catalogue Orso Media',
        ],
        must_appear_in: ['newsletter', 'brief-annexe'],
        appearance_style: 'naturelle, pas forcée',
      },
    },
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
