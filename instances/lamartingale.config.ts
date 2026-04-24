import type { PodcastConfig } from '@engine/config/podcast.config';

// Toutes les valeurs auparavant hardcodées dans :
//   - src/scrape-rss.ts (FEEDS)
//   - src/scrape-deep.ts (BASE, USER_AGENT, DELAY_MS, ARTICLE_SELECTORS)
//   - src/api.ts (slug fallback URL)
//   - public/v2.html (couleurs CSS, font, tagline, nom)
//   - data/taxonomy.json (10 piliers prédéfinis)

export const lamartingaleConfig: PodcastConfig = {
  id: 'lamartingale',
  name: 'La Martingale',
  tagline: 'Prenez le contrôle de votre argent',
  host: 'Matthieu Stefani',
  producer: 'Orso Media',
  description: 'Le podcast d\'éducation financière de Matthieu Stefani — investissement, patrimoine, crypto, immobilier.',

  website: 'https://lamartingale.io',
  episodeUrlPattern: 'https://lamartingale.io/tous/{slug}/',
  listingUrlPattern: 'https://lamartingale.io?current_page={page}',
  github: 'https://github.com/jeremyH974/lamartingale',

  rssFeeds: {
    main: 'https://feed.audiomeans.fr/feed/la-martingale-010afa69a4c1.xml',
    secondary: 'https://feed.audiomeans.fr/feed/allo-la-martingale-5d56dcf7.xml',
  },

  platforms: {
    spotify: 'https://open.spotify.com/show/5ZcYnKyHYjWtVJRaPcMk9v',
    apple: 'https://podcasts.apple.com/fr/podcast/la-martingale/id1496888852',
    deezer: 'https://www.deezer.com/fr/show/1190212',
    youtube: 'https://www.youtube.com/@lamartingalepodcast',
  },

  scraping: {
    articleSelectors: [
      '.entry-content',
      '.post-content',
      'article .content',
      'main .article-body',
      'article',
      'main',
    ],
    chapterSelector: 'h2',
    excludeSelectors: ['script', 'style', 'nav', '.share', '.social', 'form'],
    rateLimit: 2000,
    userAgent: 'LaMartingale-DataBot/1.0',
    hasArticles: true,
    timelineInRss: false,
  },

  branding: {
    primaryColor: '#004cff',
    secondaryColor: '#e8eeff',
    font: 'Poppins',
  },

  // Taxonomie prédéfinie — extraite de data/taxonomy.json
  // 10 piliers canoniques.
  taxonomy: {
    mode: 'predefined',
    pillars: [
      { id: 'IMMOBILIER', name: 'Immobilier', icon: 'building', color: '#2563EB' },
      { id: 'BOURSE', name: 'Bourse et marchés financiers', icon: 'trending-up', color: '#16A34A' },
      { id: 'CRYPTO', name: 'Crypto et Web3', icon: 'bitcoin', color: '#F59E0B' },
      { id: 'ALTERNATIFS', name: 'Investissements alternatifs', icon: 'gem', color: '#9333EA' },
      { id: 'PE_STARTUP', name: 'Private Equity et Startups', icon: 'rocket', color: '#DC2626' },
      { id: 'PATRIMOINE_FISCALITE', name: 'Gestion de patrimoine et fiscalité', icon: 'shield', color: '#0891B2' },
      { id: 'FINANCES_PERSO', name: 'Finances personnelles et mindset', icon: 'brain', color: '#EA580C' },
      { id: 'IMPACT_ESG', name: 'Impact, ESG et transition', icon: 'leaf', color: '#059669' },
      { id: 'CROWDFUNDING', name: 'Crowdfunding et dette privée', icon: 'users', color: '#7C3AED' },
      { id: 'ENTREPRENEURIAT', name: 'Entrepreneuriat et side business', icon: 'briefcase', color: '#BE185D' },
    ],
  },

  database: {
    tenantId: 'lamartingale',
  },

  deploy: {
    vercelProject: 'lamartingale-v2',
    vercelScope: 'jeremyh974s-projects',
  },

  hub_order: 1,
};
