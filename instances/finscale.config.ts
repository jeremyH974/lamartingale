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
    mode: 'predefined',
    pillars: [
      { id: 'INNOVATION_FINANCIERE', name: 'Innovation Financière', icon: 'innovation', color: '#FFEB3B' },
      { id: 'TECHNOLOGIE_FINANCIERE', name: 'Technologie Financière', icon: 'tech', color: '#2196F3' },
      { id: 'INVESTISSEMENT', name: 'Investissement', icon: 'investment', color: '#4CAF50' },
      { id: 'CRYPTO_ACTIFS', name: 'Crypto-actifs', icon: 'bitcoin', color: '#FFC107' },
      { id: 'STARTUPS', name: 'Startups', icon: 'rocket', color: '#FF5722' },
      { id: 'MARCHES_PRIVES', name: 'Marchés Privés', icon: 'market', color: '#E91E63' },
      { id: 'FINANCE_PERSONNELLE', name: 'Finance Personnelle', icon: 'wallet', color: '#3F51B5' },
      { id: 'GOUVERNANCE', name: 'Gouvernance', icon: 'shield', color: '#9C27B0' },
      { id: 'EDUCATION_FINANCIERE', name: 'Éducation Financière', icon: 'book', color: '#8BC34A' },
      { id: 'DURABILITE', name: 'Durabilité', icon: 'leaf', color: '#FF9800' },
    ],
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
