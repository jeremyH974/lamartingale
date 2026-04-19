import type { PodcastConfig } from '@engine/config/podcast.config';

// Template pour un nouveau podcast — généré par `cli/index.ts init`.
// Les {{PLACEHOLDERS}} sont remplacés par la CLI ; à adapter manuellement
// ensuite (catégories, sélecteurs scraping, plateformes, etc.).

const config: PodcastConfig = {
  id: 'lepanier',
  name: 'Le Panier',
  tagline: "Le 1er podcast e-commerce français",
  host: 'Laurent Kretz',
  producer: 'Orso Media',
  description:
    "Le podcast qui part à la rencontre des entrepreneurs et des experts de l'e-commerce pour décrypter leurs stratégies : conversion, SEO, Amazon, logistique, UX design, marque.",

  website: 'https://lepanier.io',
  episodeUrlPattern: '',

  rssFeeds: {
    main: 'https://feeds.audiomeans.fr/feed/79fd1032-3732-49a2-8cc5-0d91b31e9b89.xml',
  },

  platforms: {
    spotify: 'https://open.spotify.com/show/2OxZMh2szBG1Sle5lqr4sb',
    apple: 'https://podcasts.apple.com/fr/podcast/le-panier/id1459987474',
  },

  scraping: {
    articleSelectors: ['.entry-content', '.post-content', 'article .content'],
    chapterSelector: 'h2',
    excludeSelectors: ['.sidebar', '.footer', 'nav'],
    rateLimit: 2000,
    userAgent: 'lepanier-DataBot/1.0',
    hasArticles: false,
    timelineInRss: false,
  },

  branding: {
    primaryColor: '#1E9EFF',
    font: 'Inter',
    logoUrl: 'https://static.audiomeans.fr/img/podcast/aba54c61-edc1-40e2-82e2-972353ee98ef.png',
  },

  taxonomy: {
    mode: 'auto',
    autoPillarCount: 10,
  },

  database: {
    tenantId: 'lepanier',
  },

  deploy: {
    vercelProject: 'lepanier-v2',
    vercelScope: 'jeremyh974s-projects',
  },
};

export const lepanierConfig = config;
export default config;
