import { describe, it, expect } from 'vitest';
import {
  isEpisodeRefCandidate,
  classifyEpisodeRef,
  isRootPath,
  isUtilityPath,
} from '@engine/classify/episode-ref-rules';

describe('isRootPath', () => {
  it('"/" et "" sont racine', () => {
    expect(isRootPath('')).toBe(true);
    expect(isRootPath('/')).toBe(true);
  });
  it('toute autre path est non-racine', () => {
    expect(isRootPath('/a')).toBe(false);
    expect(isRootPath('/episode/123')).toBe(false);
    expect(isRootPath('//')).toBe(false);
  });
});

describe('isUtilityPath', () => {
  const utilityPaths = [
    '/contact',
    '/contacts',
    '/contact/',
    '/about',
    '/a-propos',
    '/qui-sommes-nous',
    '/qui-suis-je',
    '/legal',
    '/mentions-legales',
    '/cgu',
    '/cgv',
    '/terms',
    '/privacy',
    '/politique-de-confidentialite',
    '/politique-cookies',
    '/confidentialite',
    '/newsletter',
    '/subscribe',
    '/abonnement',
    '/press',
    '/presse',
    '/media-kit',
    '/careers',
    '/jobs',
    '/recrutement',
    '/404',
    '/search',
    '/tag/fintech',
    '/tags',
    '/category/crypto',
    '/categories',
    '/author/matthieu-stefani',
    '/authors',
  ];
  for (const p of utilityPaths) {
    it(`"${p}" est utilitaire`, () => expect(isUtilityPath(p)).toBe(true));
  }
  const nonUtility = [
    '/episode/123',
    '/podcast/anton-osika-vo',
    '/tous/crise-scpi',
    '/contactless', // pas /contact strict
    '/tagalog', // pas /tag/*
    '/categoryst', // pas /category/*
  ];
  for (const p of nonUtility) {
    it(`"${p}" n'est PAS utilitaire`, () => expect(isUtilityPath(p)).toBe(false));
  }
});

describe('isEpisodeRefCandidate — 3 faux positifs identifiés dry-run v1', () => {
  it('lamartingale.io racine → PAS episode_ref (R2)', () => {
    expect(isEpisodeRefCandidate('https://lamartingale.io/', 'lamartingale.io')).toBe(false);
    expect(isEpisodeRefCandidate('https://lamartingale.io', 'lamartingale.io')).toBe(false);
    expect(isEpisodeRefCandidate('https://www.lamartingale.io/', 'lamartingale.io')).toBe(false);
  });
  it('lepanier.io racine → PAS episode_ref (R2)', () => {
    expect(isEpisodeRefCandidate('http://lepanier.io', 'lepanier.io')).toBe(false);
    expect(isEpisodeRefCandidate('https://lepanier.io/', 'lepanier.io')).toBe(false);
  });
  it('orsomedia.io/contact → PAS episode_ref (R3)', () => {
    expect(isEpisodeRefCandidate('https://orsomedia.io/contact', 'orsomedia.io')).toBe(false);
    expect(isEpisodeRefCandidate('https://orsomedia.io/contact/', 'orsomedia.io')).toBe(false);
  });
});

describe('isEpisodeRefCandidate — vrais positifs par tenant (≥2 par tenant)', () => {
  const positives: { tenant: string; host: string; urls: string[] }[] = [
    {
      tenant: 'lamartingale',
      host: 'lamartingale.io',
      urls: [
        'https://lamartingale.io/episode/123',
        'https://lamartingale.io/podcast/abc-slug',
        'https://lamartingale.io/tous/faire-le-tri-dans-les-fonds-durables',
      ],
    },
    {
      tenant: 'gdiy',
      host: 'gdiy.fr',
      urls: [
        'https://www.gdiy.fr/podcast/anton-osika-vo/',
        'https://www.gdiy.fr/podcast/ivan-zhao-vo/',
        'https://gdiy.fr/podcast/sebastien-kopp-2/',
      ],
    },
    {
      tenant: 'lepanier',
      host: 'lepanier.io',
      urls: [
        'https://lepanier.io/episode/42',
        'https://lepanier.io/tous/un-slug',
      ],
    },
    {
      tenant: 'finscale',
      host: 'finscale.com',
      urls: [
        'https://finscale.com/episode/3',
        'https://www.finscale.com/podcast/foo',
      ],
    },
    {
      tenant: 'passionpatrimoine',
      host: 'passionpatrimoine.com',
      urls: [
        'https://passionpatrimoine.com/episode/12',
        'https://passionpatrimoine.com/podcast/ep-abc',
      ],
    },
    {
      tenant: 'combiencagagne',
      host: 'orsomedia.io',
      urls: [
        'https://orsomedia.io/podcast/combien-ca-gagne/ep-3',
        'https://orsomedia.io/podcast/combien-ca-gagne/interview-x',
      ],
    },
  ];
  for (const { tenant, host, urls } of positives) {
    describe(tenant, () => {
      for (const u of urls) {
        it(`${u} → episode_ref`, () => expect(isEpisodeRefCandidate(u, host)).toBe(true));
      }
    });
  }
});

describe('isEpisodeRefCandidate — rejets host / inputs invalides', () => {
  it('URL sur un autre host → false', () => {
    expect(isEpisodeRefCandidate('https://gdiy.fr/podcast/foo', 'lamartingale.io')).toBe(false);
    expect(isEpisodeRefCandidate('https://lamartingale.io/episode/1', 'gdiy.fr')).toBe(false);
  });
  it('websiteHost undefined/null/empty → false', () => {
    expect(isEpisodeRefCandidate('https://lamartingale.io/episode/1', undefined)).toBe(false);
    expect(isEpisodeRefCandidate('https://lamartingale.io/episode/1', null)).toBe(false);
    expect(isEpisodeRefCandidate('https://lamartingale.io/episode/1', '')).toBe(false);
  });
  it('URL invalide → false', () => {
    expect(isEpisodeRefCandidate('not-a-url', 'lamartingale.io')).toBe(false);
    expect(isEpisodeRefCandidate('', 'lamartingale.io')).toBe(false);
  });
});

describe('classifyEpisodeRef — diagnostic reasons (instrumentation)', () => {
  it('match', () => {
    expect(classifyEpisodeRef('https://lamartingale.io/episode/1', 'lamartingale.io')).toBe('match');
  });
  it('host mismatch', () => {
    expect(classifyEpisodeRef('https://gdiy.fr/podcast/a', 'lamartingale.io')).toBe('host');
  });
  it('root (R2)', () => {
    expect(classifyEpisodeRef('https://lamartingale.io/', 'lamartingale.io')).toBe('root');
    expect(classifyEpisodeRef('http://lepanier.io', 'lepanier.io')).toBe('root');
  });
  it('utility (R3)', () => {
    expect(classifyEpisodeRef('https://orsomedia.io/contact', 'orsomedia.io')).toBe('utility');
    expect(classifyEpisodeRef('https://lamartingale.io/tag/fintech', 'lamartingale.io')).toBe('utility');
  });
  it('URL invalide ou websiteHost absent → host', () => {
    expect(classifyEpisodeRef('not-a-url', 'lamartingale.io')).toBe('host');
    expect(classifyEpisodeRef('https://lamartingale.io/episode/1', undefined)).toBe('host');
  });
});
