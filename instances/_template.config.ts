import type { PodcastConfig } from '@engine/config/podcast.config';

// Template pour un nouveau podcast — généré par `cli/index.ts init`.
// Les {{PLACEHOLDERS}} sont remplacés par la CLI ; à adapter manuellement
// ensuite (catégories, sélecteurs scraping, plateformes, etc.).

const config: PodcastConfig = {
  id: '{{ID}}',
  name: '{{NAME}}',
  tagline: '',
  host: '{{HOST}}',
  producer: '',
  description: '',

  website: '',
  episodeUrlPattern: '',

  rssFeeds: {
    main: '{{RSS_URL}}',
  },

  platforms: {
    spotify: '',
    apple: '',
    deezer: '',
  },

  scraping: {
    articleSelectors: ['.entry-content', '.post-content', 'article .content'],
    chapterSelector: 'h2',
    excludeSelectors: ['.sidebar', '.footer', 'nav'],
    rateLimit: 2000,
    userAgent: '{{ID}}-DataBot/1.0',
    hasArticles: false,
    timelineInRss: false,
  },

  branding: {
    primaryColor: '{{COLOR}}',
    font: '{{FONT}}',
  },

  taxonomy: {
    mode: 'auto',
    autoPillarCount: 10,
  },

  database: {
    tenantId: '{{ID}}',
  },

  deploy: {
    vercelProject: '{{ID}}-v2',
    vercelScope: 'jeremyh974s-projects',
  },

  features: {
    // qualityQuizReady: false par défaut — flippe à true après régen quiz qualité Haiku
    qualityQuizReady: false,
  },
};

export default config;
