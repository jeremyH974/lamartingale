import type { PodcastConfig } from '@engine/config/podcast.config';

// IFTTD — If This Then Dev — Orso Media — Bruno Soulez
// 706 épisodes, très actif (dernier ep avril 2026). Le plus gros catalogue
// du groupe Orso après GDIY. Format interview tech / dev.
// Slug court 'iftd' choisi pour cohérence URL et compat tenant_id court.
// Ajouté Phase A.5 (2026-04-28).

const config: PodcastConfig = {
  id: 'iftd',
  name: 'IFTTD — If This Then Dev',
  tagline: 'Le podcast qui questionne le développement logiciel',
  host: 'Bruno Soulez',
  producer: 'Orso Media',
  description:
    "Bruno Soulez interroge chaque semaine un.e expert.e du développement logiciel : architectures, langages, méthodes, métiers. 700+ épisodes pour explorer toutes les facettes de l'écosystème tech.",

  website: 'https://orsomedia.io/podcast/iftd/',
  episodeUrlPattern: '',

  rssFeeds: {
    main: 'https://feeds.audiomeans.fr/feed/03d88297-85c1-475f-a491-a6c7a443ffca.xml',
  },

  platforms: {
    apple: 'https://podcasts.apple.com/fr/podcast/if-this-then-dev/id1247970653',
  },

  scraping: {
    articleSelectors: ['.entry-content', '.post-content', 'article .content'],
    chapterSelector: 'h2',
    excludeSelectors: ['.sidebar', '.footer', 'nav'],
    rateLimit: 2000,
    userAgent: 'iftd-DataBot/1.0',
    hasArticles: false,
    timelineInRss: false,
  },

  branding: {
    primaryColor: '#6B46C1', // violet tech
    font: 'Inter',
  },

  taxonomy: {
    mode: 'auto',
    autoPillarCount: 12, // gros catalogue → plus de piliers possibles
  },

  database: {
    tenantId: 'iftd',
  },

  deploy: {
    vercelProject: 'iftd-v2',
    vercelScope: 'jeremyh974s-projects',
  },

  hub_order: 8,

  features: {
    qualityQuizReady: false,
    pillarsReady: false,
  },
};

export const iftdConfig = config;
export default config;
