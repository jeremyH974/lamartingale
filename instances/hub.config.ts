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
  description:
    'L\'univers Matthieu Stefani × Orso Media réunit six podcasts : La Martingale (313 eps — argent & investissement), Génération Do It Yourself (959 eps — entrepreneuriat), Le Panier (506 eps — e-commerce), Finscale (332 eps — fintech), Passion Patrimoine (195 eps — gestion de patrimoine) et Combien ça gagne (104 eps — business models). 2400+ épisodes, 1200+ invités, 2500+ heures d\'expertise francophone.',

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
};
