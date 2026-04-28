import type { PodcastConfig } from '@engine/config/podcast.config';

// Demain Vous Appartient — Orso Media — Claire Perset
// Thème RSE / impact / transition. 106 épisodes, actif (dernier ep mars 2026).
// Ajouté Phase A.5 (2026-04-28).

const config: PodcastConfig = {
  id: 'demainvousappartient',
  name: 'Demain Vous Appartient',
  tagline: 'Les acteurs qui construisent demain',
  host: 'Claire Perset',
  producer: 'Orso Media',
  description:
    "Claire Perset reçoit chaque semaine les entrepreneurs, dirigeants et acteurs publics qui transforment l'économie : RSE, impact, transition écologique, modèles d'entreprise responsables.",

  website: 'https://orsomedia.io/podcast/demain-vous-appartient/',
  episodeUrlPattern: '',

  rssFeeds: {
    main: 'https://feeds.audiomeans.fr/feed/a72fa985-f043-4452-a426-c54ffdd02d2b.xml',
  },

  platforms: {
    apple: 'https://podcasts.apple.com/fr/podcast/demain-vous-appartient/id1543289693',
  },

  scraping: {
    articleSelectors: ['.entry-content', '.post-content', 'article .content'],
    chapterSelector: 'h2',
    excludeSelectors: ['.sidebar', '.footer', 'nav'],
    rateLimit: 2000,
    userAgent: 'demainvousappartient-DataBot/1.0',
    hasArticles: false,
    timelineInRss: false,
  },

  branding: {
    primaryColor: '#059669', // vert RSE / impact
    font: 'Inter',
  },

  taxonomy: {
    mode: 'auto',
    autoPillarCount: 10,
  },

  database: {
    tenantId: 'demainvousappartient',
  },

  deploy: {
    vercelProject: 'demainvousappartient-v2',
    vercelScope: 'jeremyh974s-projects',
  },

  hub_order: 9,

  features: {
    qualityQuizReady: false,
    pillarsReady: false,
  },
};

export const demainvousappartientConfig = config;
export default config;
