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
    mode: 'predefined',
    pillars: [
      { id: 'TECH_DIGITAL', name: 'Tech & digital', icon: 'laptop', color: '#2563EB' },
      { id: 'SANTE', name: 'Santé & médical', icon: 'stethoscope', color: '#DC2626' },
      { id: 'ARTISANAT', name: 'Artisanat & métiers manuels', icon: 'hammer', color: '#EA580C' },
      { id: 'FINANCE_BUSINESS', name: 'Finance & business', icon: 'banknote', color: '#16A34A' },
      { id: 'JURIDIQUE', name: 'Juridique & public', icon: 'scale', color: '#9333EA' },
      { id: 'CREATIF', name: 'Créatif & média', icon: 'palette', color: '#BE185D' },
      { id: 'SERVICES', name: 'Services & commerce', icon: 'store', color: '#0891B2' },
      { id: 'EDUCATION', name: 'Éducation & recherche', icon: 'graduation-cap', color: '#059669' },
      { id: 'SPORT_LOISIR', name: 'Sport & loisirs', icon: 'dumbbell', color: '#F59E0B' },
      { id: 'INDUSTRIE_AGRI', name: 'Industrie & agriculture', icon: 'factory', color: '#7C3AED' },
    ],
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
