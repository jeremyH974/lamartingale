import type { PodcastConfig } from '@engine/config/podcast.config';

// Template pour un nouveau podcast — généré par `cli/index.ts init`.
// Les {{PLACEHOLDERS}} sont remplacés par la CLI ; à adapter manuellement
// ensuite (catégories, sélecteurs scraping, plateformes, etc.).

const config: PodcastConfig = {
  id: 'combiencagagne',
  name: 'Combien ça gagne',
  tagline: 'Le podcast qui déconstruit les business models',
  host: 'Clémence Lepic',
  producer: 'Orso Media',
  description:
    "Clémence Lepic déconstruit les modèles économiques de tous les business, boutiques, entreprises qui nous entourent au quotidien : chiffre d'affaires, charges, rentabilité — qui gagne quoi et comment ?",

  website: 'https://orsomedia.io/podcast/combien-ca-gagne/',
  episodeUrlPattern: '',

  rssFeeds: {
    main: 'https://feeds.audiomeans.fr/feed/085c8635-d7bf-493b-87b9-76e75bf83e6b.xml',
  },

  platforms: {
    apple: 'https://podcasts.apple.com/fr/podcast/combien-%C3%A7a-gagne/id1777097394',
    spotify: 'https://open.spotify.com/show/0t9N1Dd05siF9jPupuw8yc',
  },

  scraping: {
    articleSelectors: ['.entry-content', '.post-content', 'article .content'],
    chapterSelector: 'h2',
    excludeSelectors: ['.sidebar', '.footer', 'nav'],
    rateLimit: 2000,
    userAgent: 'combiencagagne-DataBot/1.0',
    hasArticles: false,
    timelineInRss: false,
  },

  branding: {
    primaryColor: '#E85A23',
    font: 'Inter',
    logoUrl: 'https://static.audiomeans.fr/img/podcast/38743ec7-6b9c-4904-90de-2b1469563792.jpg',
  },

  taxonomy: {
    mode: 'auto',
    autoPillarCount: 10,
  },

  database: {
    tenantId: 'combiencagagne',
  },

  deploy: {
    vercelProject: 'combiencagagne-v2',
    vercelScope: 'jeremyh974s-projects',
  },
};

export const combiencagagneConfig = config;
export default config;
