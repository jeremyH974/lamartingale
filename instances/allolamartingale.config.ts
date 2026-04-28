import type { PodcastConfig } from '@engine/config/podcast.config';

// Allo La Martingale — Orso Media — spin-off La Martingale
// Format call-in où les auditeurs LM posent leurs questions argent / placement.
// 61 épisodes, actif. Tenant SÉPARÉ de 'lamartingale' parce que :
//   - format différent (call-in vs interview expert)
//   - audience qui ne se chevauche pas complètement
//   - intéressant pour Stefani comme exemple de déclinaison de format
// Ajouté Phase A.5 (2026-04-28).

const config: PodcastConfig = {
  id: 'allolamartingale',
  name: 'Allo La Martingale',
  tagline: 'Vos questions, nos réponses argent',
  host: 'Matthieu Stefani',
  producer: 'Orso Media',
  description:
    "Le spin-off call-in de La Martingale : les auditeurs posent leurs questions argent, placement, fiscalité, immobilier. Format court, réponses concrètes. Décliné de l'univers La Martingale.",

  website: 'https://orsomedia.io/podcast/allo-la-martingale/',
  episodeUrlPattern: '',

  rssFeeds: {
    main: 'https://feeds.audiomeans.fr/feed/5d56dcf7-2e80-4a88-8028-96a8e059418b.xml',
  },

  platforms: {
    apple: 'https://podcasts.apple.com/fr/podcast/allo-la-martingale/id1701988252',
  },

  scraping: {
    articleSelectors: ['.entry-content', '.post-content', 'article .content'],
    chapterSelector: 'h2',
    excludeSelectors: ['.sidebar', '.footer', 'nav'],
    rateLimit: 2000,
    userAgent: 'allolamartingale-DataBot/1.0',
    hasArticles: false,
    timelineInRss: false,
    // Stefani host LM principal — repris ici. Slugs LinkedIn LM (cf lamartingale.config.ts)
    // exclus pour ne pas attribuer le LinkedIn host aux invités call-in.
    linkedinExclusions: {
      hosts: ['stefani', 'matthieu-stefani'],
      parasites: [],
    },
  },

  branding: {
    primaryColor: '#0066ff', // variante bleue plus claire que LM (#004cff) pour distinguer
    font: 'Inter',
  },

  taxonomy: {
    mode: 'auto',
    autoPillarCount: 6, // catalogue moyen
  },

  database: {
    tenantId: 'allolamartingale',
  },

  deploy: {
    vercelProject: 'allolamartingale-v2',
    vercelScope: 'jeremyh974s-projects',
  },

  hub_order: 10,

  features: {
    qualityQuizReady: false,
    pillarsReady: false,
  },
};

export const allolamartingaleConfig = config;
export default config;
