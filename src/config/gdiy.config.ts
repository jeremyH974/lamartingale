import type { PodcastConfig } from './podcast.config';

// Génération Do It Yourself — Matthieu Stefani (même host que LaMartingale,
// producteur différent, podcast entrepreneuriat et vie personnelle).
// Feed Audiomeans — 986 épisodes au moment de l'ingestion (avr 2026).
//
// Spécificités vs LaMartingale :
//  - taxonomy = 'auto'        : on laisse l'auto-clustering décider des piliers
//                               post-ingestion (pas de taxonomie prédéfinie)
//  - hasArticles = false      : aucun site canonique d'articles — RSS seul
//  - timelineInRss = true     : les descriptions RSS contiennent un bloc
//                               TIMELINE: HH:MM:SS Titre (équivalent des
//                               chapitres pour LaMartingale)
//  - rateLimit plus lent      : 4s — politeness accrue sur le domaine media/stat

export const gdiyConfig: PodcastConfig = {
  id: 'gdiy',
  name: 'Génération Do It Yourself',
  tagline: 'Les histoires de celles et ceux qui créent',
  host: 'Matthieu Stefani',
  producer: 'Cosa Vostra',
  description:
    'GDIY est le podcast de référence sur l\'entrepreneuriat en France — portraits de fondateurs, de créateurs et de dirigeants qui racontent leurs parcours, leurs doutes et leurs apprentissages.',

  website: 'https://www.gdiy.fr',
  episodeUrlPattern: 'https://www.gdiy.fr/podcast/{slug}',
  github: 'https://github.com/jeremyH974/lamartingale',

  rssFeeds: {
    main: 'https://feed.audiomeans.fr/feed/6f7fe82b-98c7-472d-b15d-5f6f36ad515e.xml',
  },

  platforms: {
    spotify: 'https://open.spotify.com/show/5vtaHfmeK4l2fULW4Wwnaf',
    apple: 'https://podcasts.apple.com/fr/podcast/g%C3%A9n%C3%A9ration-do-it-yourself/id1078405941',
    deezer: 'https://www.deezer.com/fr/show/293052',
    youtube: 'https://www.youtube.com/@gdiypodcast',
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

  branding: {
    primaryColor: '#ff6b35',
    secondaryColor: '#fff1ea',
    font: 'Inter',
  },

  taxonomy: {
    mode: 'auto',
    autoPillarCount: 10,
  },

  database: {
    tenantId: 'gdiy',
  },

  deploy: {
    vercelProject: 'gdiy-v2',
    vercelScope: 'jeremyh974s-projects',
  },
};
