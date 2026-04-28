import type { PodcastConfig } from '@engine/config/podcast.config';

// Hub MS — la vitrine croisée de l'univers Matthieu Stefani.
// Ce n'est PAS un podcast : c'est un agrégateur de La Martingale + GDIY (+ futurs).
// On utilise l'interface PodcastConfig pour rester compatible avec le registry
// et les helpers existants, mais tenant_id = 'hub' est marqueur : aucun épisode
// ne lui appartient. Toutes les données proviennent de /api/cross/*.

export const hubConfig: PodcastConfig = {
  id: 'hub',
  name: 'Univers MS',
  tagline: 'Six podcasts, un écosystème. La plus grande bibliothèque francophone sur le business, la finance et l\'investissement.',
  host: 'Matthieu Stefani',
  producer: 'Orso Media × Cosa Vostra × Gokyo',
  // Description sans chiffres figés : le hero `/` lit `data.universe.totals.*`
  // calculé en temps réel depuis la DB (cf. engine/universe.ts), donc afficher
  // ici "313 eps La Martingale, 537 eps GDIY, …" introduisait un drift dès
  // qu'un nouvel épisode était ingéré (mesuré 2026-04-28 : drift cumulé ~500
  // épisodes vs DB réelle). On garde la prose qualitative.
  description:
    'L\'univers Matthieu Stefani × Orso Media réunit six podcasts : La Martingale (argent & investissement), Génération Do It Yourself (entrepreneuriat), Le Panier (e-commerce), Finscale (fintech), Passion Patrimoine (gestion de patrimoine) et Combien ça gagne (business models). La plus grande bibliothèque francophone d\'expertise sur le business, la finance et l\'investissement.',

  website: 'https://ms-hub.vercel.app',
  episodeUrlPattern: '',

  rssFeeds: { main: '' },

  platforms: {},
  socials: {
    linkedin: 'https://www.linkedin.com/in/stefani/',
  },

  scraping: {
    articleSelectors: [],
    chapterSelector: '',
    excludeSelectors: [],
    rateLimit: 0,
    userAgent: '',
    hasArticles: false,
    timelineInRss: false,
  },

  branding: {
    primaryColor: '#1a1a1a',
    secondaryColor: '#00F5A0',
    font: 'Inter',
  },

  taxonomy: {
    mode: 'predefined',
    pillars: [],
  },

  database: {
    tenantId: 'hub',
  },

  deploy: {
    vercelProject: 'ms-hub',
    vercelScope: 'jeremyh974s-projects',
    domain: 'ms-hub.vercel.app',
  },

  features: {
    qualityQuizReady: false, // hub n'a pas de quiz propre, expose juste l'info
    pillarsReady: false, // hub n'a pas de piliers propres (agrégateur cross-podcast)
  },
};
