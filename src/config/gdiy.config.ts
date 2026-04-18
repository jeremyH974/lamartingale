import type { PodcastConfig } from './podcast.config';

// Génération Do It Yourself — Matthieu Stefani / Cosa Vostra.
// Charte inspirée de gdiy.fr : minimalisme noir/blanc, logo carré noir, Inter.
// Taxonomie PRÉDÉFINIE (extraite du site gdiy.fr — pas d'auto-clustering) :
//   Business, French Tech, Intelligence artificielle & data, Levée de fonds,
//   Investissement, Licornes, Cryptos & NFT, Économie/écologie/environnement,
//   Sport, Art, Journalistes & influenceurs, Santé, Sciences sociales,
//   Réussir malgré un échec, Mobilité, Gastronomie, Mode, SAAS, Early Stage.

export const gdiyConfig: PodcastConfig = {
  id: 'gdiy',
  name: 'Génération Do It Yourself',
  tagline: 'Les histoires de celles et ceux qui se sont construits par eux-mêmes',
  host: 'Matthieu Stefani',
  producer: 'Cosa Vostra',
  description:
    'Le podcast qui part à la rencontre de celles et ceux qui se sont construits par eux-mêmes. Portraits de fondateurs, créateurs et dirigeants qui racontent leurs parcours, leurs doutes et leurs apprentissages.',

  website: 'https://www.gdiy.fr',
  episodeUrlPattern: 'https://www.gdiy.fr/podcast/{slug}',
  github: 'https://github.com/jeremyH974/lamartingale',

  rssFeeds: {
    main: 'https://feed.audiomeans.fr/feed/6f7fe82b-98c7-472d-b15d-5f6f36ad515e.xml',
  },

  platforms: {
    apple: 'https://podcasts.apple.com/fr/podcast/génération-do-it-yourself/id1209142994',
    spotify: 'https://open.spotify.com/show/6jCObFeQTf0VARXdMv9iE4',
    deezer: 'https://www.deezer.com/fr/show/53644',
    youtubeMusic: 'https://music.youtube.com/playlist?list=PLWT7hkKacBMKEQlMyOMt6qSzKHTGguP9I',
    amazonMusic: 'https://music.amazon.fr/podcasts/29c130f8-57f3-4645-bc5a-e1f9b4bbf131',
    youtube: 'https://www.youtube.com/c/MatthieuStefani',
  },

  socials: {
    instagram: 'https://www.instagram.com/gdiypodcast/',
    linkedin: 'https://www.linkedin.com/in/stefani/',
    tiktok: 'https://www.tiktok.com/@mattintouch',
    youtube: 'https://www.youtube.com/c/MatthieuStefani',
  },

  scraping: {
    articleSelectors: [],
    chapterSelector: '',
    excludeSelectors: [],
    rateLimit: 4000,
    userAgent: 'GDIY-DataBot/1.0 (contact: jeremyhenry974@gmail.com)',
    hasArticles: false,
    timelineInRss: true,
  },

  // Charte gdiy.fr : noir (fond principal) + vert néon signature en accent
  // (boutons, highlights, stats values). #00F5A0 est la couleur "Mint" du
  // site officiel — le pendant du bleu #004cff de LaMartingale.
  branding: {
    primaryColor: '#000000',
    secondaryColor: '#00F5A0',
    font: 'Inter',
    logoUrl: 'https://www.gdiy.fr/wp-content/uploads/2025/03/Symbol_Full_Black@2x.png',
  },

  // Taxonomie prédéfinie — issue directement des catégories du site gdiy.fr.
  // 19 piliers (pas d'auto-clustering LLM).
  taxonomy: {
    mode: 'predefined',
    pillars: [
      { id: 'BUSINESS', name: 'Business', icon: 'briefcase', color: '#000000' },
      { id: 'FRENCH_TECH', name: 'French Tech', icon: 'flag', color: '#111111' },
      { id: 'AI_DATA', name: 'Intelligence artificielle & data', icon: 'cpu', color: '#1a1a1a' },
      { id: 'LEVEE_FONDS', name: 'Levée de fonds', icon: 'coins', color: '#222222' },
      { id: 'INVESTISSEMENT', name: 'Investissement', icon: 'trending-up', color: '#2a2a2a' },
      { id: 'LICORNES', name: 'Licornes', icon: 'sparkles', color: '#333333' },
      { id: 'CRYPTO_NFT', name: 'Cryptos & NFT', icon: 'bitcoin', color: '#3a3a3a' },
      { id: 'ECO_ENV', name: 'Économie, écologie, environnement', icon: 'leaf', color: '#444444' },
      { id: 'SPORT', name: 'Sport', icon: 'dumbbell', color: '#4a4a4a' },
      { id: 'ART', name: 'Art', icon: 'palette', color: '#555555' },
      { id: 'MEDIA_INFLUENCEURS', name: 'Journalistes & influenceurs', icon: 'mic', color: '#5a5a5a' },
      { id: 'SANTE', name: 'Santé', icon: 'heart-pulse', color: '#666666' },
      { id: 'SCIENCES_SOCIALES', name: 'Sciences sociales', icon: 'book-open', color: '#6a6a6a' },
      { id: 'RESILIENCE', name: 'Réussir malgré un échec', icon: 'shield', color: '#777777' },
      { id: 'MOBILITE', name: 'Mobilité', icon: 'car', color: '#7a7a7a' },
      { id: 'GASTRONOMIE', name: 'Gastronomie', icon: 'utensils', color: '#888888' },
      { id: 'MODE', name: 'Mode', icon: 'shirt', color: '#8a8a8a' },
      { id: 'SAAS', name: 'SAAS', icon: 'cloud', color: '#999999' },
      { id: 'EARLY_STAGE', name: 'Early Stage', icon: 'rocket', color: '#a0a0a0' },
    ],
  },

  database: {
    tenantId: 'gdiy',
  },

  deploy: {
    vercelProject: 'gdiy-v2',
    vercelScope: 'jeremyh974s-projects',
  },
};
