import type { PodcastConfig } from '@engine/config/podcast.config';

// Template pour un nouveau podcast — généré par `cli/index.ts init`.
// Les {{PLACEHOLDERS}} sont remplacés par la CLI ; à adapter manuellement
// ensuite (catégories, sélecteurs scraping, plateformes, etc.).

const config: PodcastConfig = {
  id: 'finscale',
  name: 'Finscale',
  tagline: 'Le podcast de référence sur la finance qui innove',
  host: 'Solenne Niedercorn',
  producer: 'Gokyo',
  description:
    "Solenne Niedercorn rencontre celles et ceux qui innovent, expérimentent et prennent les décisions stratégiques dans l'industrie financière en Europe et dans le monde : entrepreneurs FinTech & InsurTech, dirigeants d'institutions financières, investisseurs.",

  website: 'https://www.finscale.com',
  episodeUrlPattern: '',

  rssFeeds: {
    main: 'https://feeds.audiomeans.fr/feed/55e0559e-ee0f-44ea-9e0f-acb0a18ec478.xml',
  },

  platforms: {
    apple: 'https://podcasts.apple.com/fr/podcast/finscale/id1510937896',
    spotify: 'https://open.spotify.com/show/4W6JPoEMfHp3v7V03OBdYt',
  },

  scraping: {
    articleSelectors: ['.entry-content', '.post-content', 'article .content'],
    chapterSelector: 'h2',
    excludeSelectors: ['.sidebar', '.footer', 'nav'],
    rateLimit: 2000,
    userAgent: 'finscale-DataBot/1.0',
    hasArticles: false,
    timelineInRss: false,
  },

  branding: {
    primaryColor: '#E91E63',
    font: 'Inter',
    logoUrl: 'https://static.audiomeans.fr/img/podcast/c2608404-19a7-4cbf-bd21-31125c7cd51b.jpg',
  },

  taxonomy: {
    mode: 'auto',
    autoPillarCount: 10,
  },

  database: {
    tenantId: 'finscale',
  },

  deploy: {
    vercelProject: 'finscale-v2',
    vercelScope: 'jeremyh974s-projects',
  },
};

export const finscaleConfig = config;
export default config;
