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

    // Slugs LinkedIn à exclure lors de l'extraction guest.linkedin_url.
    // hosts     : exclus SAUF si guest_name matche le host (cas Stefani sur ep #297).
    // parasites : toujours exclus (CM, montage, crédits production récurrents).
    // Si absent, fallback runtime via deriveSlugsFromName(host + coHosts).
    // Voir engine/scraping/linkedin-filter.ts.
    linkedinExclusions?: {
      hosts: string[];
      parasites: string[];
    };
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

  // Ordre d'affichage dans le Hub Univers MS (1 = en tête).
  // Absent sur 'hub' (lui-même), optionnel sinon.
  hub_order?: number;

  // Feature flags — permettent de masquer / activer des features frontend
  // tenant par tenant. Défaut (absent) = false. Propagés en PublicPodcastConfig.
  //
  // - qualityQuizReady : true = quiz régénéré par Haiku (LM post-Rail 1).
  //   false = quiz template bidon à masquer côté front (pas encore régénéré).
  //   Rail 1-bis régénère GDIY et flippera GDIY à true.
  // - pillarsReady : true = piliers éditoriaux solides (LM predefined, GDIY/Finscale
  //   auto-cluster propre). false = auto-clustering produit un bucket UNCLASSIFIED
  //   significatif (>10% du catalogue). Masque la section piliers + les étiquettes
  //   sur les cards ep tant que pas calibré.
  features?: {
    qualityQuizReady?: boolean;
    pillarsReady?: boolean;
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
  hub_order?: number;
  features?: PodcastConfig['features'];
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
    hub_order: c.hub_order,
    features: c.features,
  };
}
