import type { PodcastConfig } from '@engine/config/podcast.config';

// Fleurons — Orso Media — Stefani / Lepic / Carzon
// Mensuel narratif "livre raconté" sur les sagas d'entreprises françaises.
// Lancé fév 2026, format différent des autres flux Orso (storytelling vs interview).
// Ajouté Phase A.5 (2026-04-28) à 6 eps publiés (LVMH, Total, Vivendi, Danone, etc.).

const config: PodcastConfig = {
  id: 'fleurons',
  name: 'Fleurons',
  tagline: 'Les sagas qui ont fait les fleurons français',
  host: 'David Carzon, Clémence Lepic, Matthieu Stefani',
  producer: 'Orso Media',
  description:
    "Chaque mois, David Carzon, Clémence Lepic et Matthieu Stefani racontent l'épopée d'une entreprise française qui a marqué son secteur. Format narratif type \"livre raconté\" : LVMH, Total, Vivendi, Danone — les histoires entrepreneuriales qui ont façonné le paysage économique français.",

  website: 'https://orsomedia.io/podcast/fleurons/',
  episodeUrlPattern: '',

  rssFeeds: {
    main: 'https://feeds.audiomeans.fr/feed/cca73448-1aad-4dc1-8b0b-0d491b64c768.xml',
  },

  platforms: {
    apple: 'https://podcasts.apple.com/fr/podcast/fleurons/id1798264497',
    // Spotify URL à confirmer en A.5.5 quand on aura accès au manifeste Audiomeans.
  },

  scraping: {
    articleSelectors: ['.entry-content', '.post-content', 'article .content'],
    chapterSelector: 'h2',
    excludeSelectors: ['.sidebar', '.footer', 'nav'],
    rateLimit: 2000,
    userAgent: 'fleurons-DataBot/1.0',
    hasArticles: false,
    timelineInRss: false,
  },

  branding: {
    primaryColor: '#C9A96E', // ocre/or — clin d'œil au format "livre raconté", classique
    font: 'Inter',
  },

  taxonomy: {
    mode: 'auto',
    autoPillarCount: 6, // catalogue jeune (6 eps), peu de matériel pour clustering
  },

  database: {
    tenantId: 'fleurons',
  },

  deploy: {
    vercelProject: 'fleurons-v2',
    vercelScope: 'jeremyh974s-projects',
  },

  hub_order: 7,

  features: {
    qualityQuizReady: false,
    pillarsReady: false, // catalogue trop jeune
  },
};

export const fleuronsConfig = config;
export default config;
