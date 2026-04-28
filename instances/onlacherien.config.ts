import type { PodcastConfig } from '@engine/config/podcast.config';

// On Lâche Rien ! — Orso Media — Stéphanie Delestre (juré "Qui veut être mon associé" M6)
// 89 épisodes, en hiatus depuis mars 2025 (catalogue figé). Maintenu dans le hub
// pour la profondeur historique (signal de catalogue), pas pour la fraîcheur.
// Ajouté Phase A.5 (2026-04-28).

const config: PodcastConfig = {
  id: 'onlacherien',
  name: 'On Lâche Rien !',
  tagline: 'Les femmes qui entreprennent ne lâchent rien',
  host: 'Stéphanie Delestre',
  producer: 'Orso Media',
  description:
    "Stéphanie Delestre (juré « Qui veut être mon associé » sur M6) reçoit des entrepreneuses qui ont dépassé les obstacles : levée, pivot, échec, comeback. Catalogue figé à 89 épisodes (hiatus depuis mars 2025).",

  website: 'https://orsomedia.io/podcast/on-lache-rien/',
  episodeUrlPattern: '',

  rssFeeds: {
    main: 'https://feeds.audiomeans.fr/feed/5ec3d1cb-4934-49b6-9e6b-4718d677594f.xml',
  },

  platforms: {
    apple: 'https://podcasts.apple.com/fr/podcast/on-l%C3%A2che-rien/id1574022895',
  },

  scraping: {
    articleSelectors: ['.entry-content', '.post-content', 'article .content'],
    chapterSelector: 'h2',
    excludeSelectors: ['.sidebar', '.footer', 'nav'],
    rateLimit: 2000,
    userAgent: 'onlacherien-DataBot/1.0',
    hasArticles: false,
    timelineInRss: false,
  },

  branding: {
    primaryColor: '#DB2777', // rose/magenta — entrepreneuriat féminin
    font: 'Inter',
  },

  taxonomy: {
    mode: 'auto',
    autoPillarCount: 8,
  },

  database: {
    tenantId: 'onlacherien',
  },

  deploy: {
    vercelProject: 'onlacherien-v2',
    vercelScope: 'jeremyh974s-projects',
  },

  hub_order: 11, // dernier (catalogue figé)

  features: {
    qualityQuizReady: false,
    pillarsReady: false,
  },
};

export const onlacherienConfig = config;
export default config;
