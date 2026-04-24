import type { PodcastConfig } from '@engine/config/podcast.config';

// Template pour un nouveau podcast — généré par `cli/index.ts init`.
// Les {{PLACEHOLDERS}} sont remplacés par la CLI ; à adapter manuellement
// ensuite (catégories, sélecteurs scraping, plateformes, etc.).

const config: PodcastConfig = {
  id: 'passionpatrimoine',
  name: 'Passion Patrimoine',
  tagline: 'Le podcast qui donne la parole aux CGP',
  host: 'Carine Dany',
  producer: 'Orso Media',
  description:
    "Carine Dany reçoit les artisans de la gestion de patrimoine : CGP, experts, dirigeants qui racontent leur quotidien, leur vision du métier et l'actualité économique et financière.",

  website: 'https://passionpatrimoine.com',
  episodeUrlPattern: '',

  rssFeeds: {
    main: 'https://feeds.audiomeans.fr/feed/88200bee-f7c5-4573-9d12-e29368f16aa8.xml',
  },

  platforms: {
    apple: 'https://podcasts.apple.com/fr/podcast/passion-patrimoine/id1650655065',
    spotify: 'https://open.spotify.com/show/0yPV3XqFI1dvC774zGBCJ0',
  },

  scraping: {
    articleSelectors: ['.entry-content', '.post-content', 'article .content'],
    chapterSelector: 'h2',
    excludeSelectors: ['.sidebar', '.footer', 'nav'],
    rateLimit: 2000,
    userAgent: 'passionpatrimoine-DataBot/1.0',
    hasArticles: false,
    timelineInRss: false,
  },

  branding: {
    primaryColor: '#7A2D98',
    font: 'Inter',
    logoUrl: 'https://static.audiomeans.fr/img/podcast/37875255-45e3-491a-9d28-479018191b3d.jpg',
  },

  taxonomy: {
    mode: 'predefined',
    pillars: [
      { id: 'IMMOBILIER', name: 'Immobilier', icon: 'building', color: '#2563EB' },
      { id: 'BOURSE', name: 'Bourse & marchés', icon: 'trending-up', color: '#16A34A' },
      { id: 'FISCALITE', name: 'Fiscalité', icon: 'receipt', color: '#0891B2' },
      { id: 'ASSURANCE_VIE', name: 'Assurance-vie & épargne', icon: 'piggy-bank', color: '#9333EA' },
      { id: 'TRANSMISSION', name: 'Transmission & succession', icon: 'users', color: '#BE185D' },
      { id: 'RETRAITE', name: 'Retraite & prévoyance', icon: 'shield', color: '#EA580C' },
      { id: 'CRYPTO', name: 'Crypto & actifs numériques', icon: 'bitcoin', color: '#F59E0B' },
      { id: 'ENTREPRISE', name: 'Entreprise & dirigeants', icon: 'briefcase', color: '#DC2626' },
      { id: 'ALTERNATIFS', name: 'Investissements alternatifs', icon: 'gem', color: '#7C3AED' },
      { id: 'MINDSET_FINANCE', name: 'Mindset & éducation financière', icon: 'brain', color: '#059669' },
    ],
  },

  database: {
    tenantId: 'passionpatrimoine',
  },

  deploy: {
    vercelProject: 'passionpatrimoine-v2',
    vercelScope: 'jeremyh974s-projects',
  },

  hub_order: 5,

  features: {
    qualityQuizReady: false, // template bidon — régen qualité à planifier
    pillarsReady: false, // bucket UNCLASSIFIED ~38% (60 eps) — auto-cluster à recalibrer
  },
};

export const passionpatrimoineConfig = config;
export default config;
