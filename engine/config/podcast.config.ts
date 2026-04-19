// Podcast Factory — interface config-driven
// Toute valeur spécifique à un podcast vit dans un fichier de config,
// pas dans le code source. Le loader (src/config/index.ts) résout
// la config active selon la variable d'env PODCAST_ID.

export interface TaxonomyPillar {
  id: string;
  name: string;
  icon?: string;
  color: string;
  // episode_count est dérivé — on ne le stocke pas dans la config
}

export interface PodcastConfig {
  // Identité
  id: string;                      // 'lamartingale' | 'gdiy' | ...
  name: string;                    // 'La Martingale'
  tagline: string;                 // 'Prenez le contrôle de votre argent'
  host: string;                    // 'Matthieu Stefani'
  coHosts?: string[];
  producer: string;                // 'Orso Media'
  description: string;

  // URLs
  website: string;                 // 'https://lamartingale.io'
  episodeUrlPattern: string;       // 'https://lamartingale.io/tous/{slug}/'
  listingUrlPattern?: string;
  github?: string;

  // RSS feeds
  rssFeeds: {
    main: string;
    secondary?: string;
  };

  // Plateformes streaming
  platforms: {
    spotify?: string;
    apple?: string;
    deezer?: string;
    youtube?: string;
    youtubeMusic?: string;
    amazonMusic?: string;
  };

  // Réseaux sociaux (optionnel)
  socials?: {
    instagram?: string;
    tiktok?: string;
    linkedin?: string;
    twitter?: string;
    youtube?: string;
  };

  // Scraping
  scraping: {
    articleSelectors: string[];
    chapterSelector: string;       // 'h2'
    excludeSelectors: string[];
    rateLimit: number;             // ms entre requêtes
    userAgent: string;
    hasArticles: boolean;          // true → lance deep-scrape ; false → RSS only
    timelineInRss: boolean;        // true → parse TIMELINE dans description RSS (GDIY)
    requiresArticleUrl?: boolean;  // true → deep-scrape ignore episodes sans article_url (GDIY)
  };

  // Branding
  branding: {
    primaryColor: string;          // '#004cff'
    secondaryColor?: string;
    font: string;                  // 'Poppins'
    logoUrl?: string;
  };

  // Taxonomie
  taxonomy: {
    mode: 'predefined' | 'auto';
    pillars?: TaxonomyPillar[];    // si predefined
    autoPillarCount?: number;      // si auto
  };

  // Database — multi-tenant
  database: {
    tenantId: string;              // 'lamartingale' | 'gdiy' | ...
    schemaPrefix?: string;
  };

  // Deploy
  deploy: {
    vercelProject: string;         // 'lamartingale-v2'
    vercelScope: string;           // 'jeremyh974s-projects'
    domain?: string;
  };
}

// Sous-ensemble public exposé au frontend via /api/config.
// Pas de secrets, pas de config interne.
export interface PublicPodcastConfig {
  id: string;
  name: string;
  tagline: string;
  host: string;
  coHosts?: string[];
  producer: string;
  description: string;
  website: string;
  platforms: PodcastConfig['platforms'];
  socials?: PodcastConfig['socials'];
  branding: PodcastConfig['branding'];
  taxonomy: { mode: 'predefined' | 'auto'; pillars?: TaxonomyPillar[] };
}

export function toPublicConfig(c: PodcastConfig): PublicPodcastConfig {
  return {
    id: c.id,
    name: c.name,
    tagline: c.tagline,
    host: c.host,
    coHosts: c.coHosts,
    producer: c.producer,
    description: c.description,
    website: c.website,
    platforms: c.platforms,
    socials: c.socials,
    branding: c.branding,
    taxonomy: {
      mode: c.taxonomy.mode,
      pillars: c.taxonomy.pillars,
    },
  };
}
