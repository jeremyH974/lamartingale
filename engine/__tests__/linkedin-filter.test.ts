import { describe, it, expect } from 'vitest';
import {
  buildExclusions,
  deriveSlugsFromName,
  extractLinkedinSlug,
  isHostAsGuest,
  normalizeName,
  pickGuestLinkedin,
  type LinkedinExclusions,
} from '@engine/scraping/linkedin-filter';

// Fixtures —------------------------------------------------------------------
const STEFANI_EXCL: LinkedinExclusions = buildExclusions({
  hostName: 'Matthieu Stefani',
  configHosts: ['stefani', 'matthieustefani', 'matthieu-stefani'],
  configParasites: ['morganprudhomme'],
});
const KRETZ_EXCL: LinkedinExclusions = buildExclusions({
  hostName: 'Laurent Kretz',
  configHosts: ['laurentkretz', 'laurent-kretz'],
});

// Helpers utilitaires ---------------------------------------------------------
describe('extractLinkedinSlug', () => {
  it('parse /in/<slug>/ correctement (lower)', () => {
    expect(extractLinkedinSlug('https://www.linkedin.com/in/yoann-lopez/')).toBe('yoann-lopez');
    expect(extractLinkedinSlug('https://linkedin.com/in/Yolo/?utm=x')).toBe('yolo');
  });
  it('null si pas une /in/ URL ou null/undefined', () => {
    expect(extractLinkedinSlug('https://example.com')).toBeNull();
    expect(extractLinkedinSlug(null)).toBeNull();
    expect(extractLinkedinSlug('https://www.linkedin.com/company/foo/')).toBeNull();
  });
});

describe('isHostAsGuest', () => {
  it('match exact case + accents insensitive', () => {
    expect(isHostAsGuest('Matthieu Stefani', ['matthieu stefani'])).toBe(true);
    expect(isHostAsGuest('MATTHIEU STÉFANI', ['matthieu stefani'])).toBe(true);
  });
  it('rejette si pas de match', () => {
    expect(isHostAsGuest('Yoann Lopez', ['matthieu stefani'])).toBe(false);
  });
  it('match si guestName contient le nom du host (≥4 chars)', () => {
    // "Matthieu Stefani et Pauline" contient "matthieu stefani"
    expect(isHostAsGuest('Matthieu Stefani et Pauline', ['matthieu stefani'])).toBe(true);
  });
});

// Coeur du picker -------------------------------------------------------------
describe('pickGuestLinkedin — exclusions hosts/parasites', () => {
  it('1. exclusion host normale : invité ≠ host → host slug rejeté', () => {
    const candidates = [
      { url: 'https://linkedin.com/in/matthieustefani/', label: 'Matthieu Stefani' },
      { url: 'https://linkedin.com/in/yoann-lopez/', label: 'Yoann Lopez' },
    ];
    const r = pickGuestLinkedin(candidates, 'Yoann Lopez', STEFANI_EXCL);
    expect(r.url).toBe('https://linkedin.com/in/yoann-lopez/');
    expect(r.rejected.find(x => x.reason === 'host')?.url).toContain('matthieustefani');
  });

  it('2. exclusion parasite : morganprudhomme toujours rejeté', () => {
    const candidates = [
      { url: 'https://linkedin.com/in/morganprudhomme/', label: 'Morgan' },
      { url: 'https://linkedin.com/in/yoann-lopez/', label: 'Yoann Lopez' },
    ];
    const r = pickGuestLinkedin(candidates, 'Yoann Lopez', STEFANI_EXCL);
    expect(r.url).toBe('https://linkedin.com/in/yoann-lopez/');
    expect(r.rejected.find(x => x.reason === 'parasite')?.url).toContain('morganprudhomme');
  });

  it('3. host-as-guest : Stefani guest sur ep #297 → on garde son LinkedIn', () => {
    const candidates = [
      { url: 'https://linkedin.com/in/matthieustefani/', label: 'Matthieu Stefani' },
    ];
    const r = pickGuestLinkedin(candidates, 'Matthieu Stefani', STEFANI_EXCL);
    expect(r.url).toBe('https://linkedin.com/in/matthieustefani/');
    expect(r.rule).toBe('host-as-guest');
  });

  it('4. aucun match valide → null fallback (pas de mauvais LinkedIn)', () => {
    const candidates = [
      { url: 'https://linkedin.com/in/matthieustefani/', label: 'Matthieu Stefani' },
      { url: 'https://linkedin.com/in/morganprudhomme/', label: 'Morgan' },
    ];
    const r = pickGuestLinkedin(candidates, 'Yoann Lopez', STEFANI_EXCL);
    expect(r.url).toBeNull();
    expect(r.rule).toBe('none');
    expect(r.rejected).toHaveLength(2);
  });

  it('5. priorité label-match : invité Yoann avec label exact > slug court "yolo"', () => {
    const candidates = [
      { url: 'https://linkedin.com/in/yolo/', label: 'Yolo Capital' },
      { url: 'https://linkedin.com/in/yoann-lopez/', label: 'Yoann Lopez' },
    ];
    const r = pickGuestLinkedin(candidates, 'Yoann Lopez', STEFANI_EXCL);
    expect(r.url).toBe('https://linkedin.com/in/yoann-lopez/');
    expect(r.rule).toBe('label-match');
  });

  it('6. faux-positifs slugs courts (yolo, knilfo) → pas de slug-match abusif, label-match prioritaire', () => {
    // Slugs cryptiques type "knilfo"/"yolo" ne contiennent aucun token ≥4 chars
    // du nom — donc slug-match ne déclenche PAS. Le label-match prend le dessus.
    const candidates = [
      { url: 'https://linkedin.com/in/yolo/', label: '' },
      { url: 'https://linkedin.com/in/knilfo/', label: 'Keyvan Nilforoushan' },
    ];
    const r = pickGuestLinkedin(candidates, 'Keyvan Nilforoushan', STEFANI_EXCL);
    expect(r.url).toBe('https://linkedin.com/in/knilfo/');
    expect(r.rule).toBe('label-match');
  });

  it('6b. slugs courts sans label : aucun ne matche le nom → order-fallback (premier)', () => {
    const candidates = [
      { url: 'https://linkedin.com/in/yolo/', label: '' },
      { url: 'https://linkedin.com/in/knilfo/', label: '' },
    ];
    const r = pickGuestLinkedin(candidates, 'Yoann Lopez', STEFANI_EXCL);
    // Aucun token de "Yoann Lopez" (yoann, lopez) ne matche "yolo" ni "knilfo".
    expect(r.url).toBe('https://linkedin.com/in/yolo/');
    expect(r.rule).toBe('order-fallback');
  });

  it('7. order-fallback : aucun match label/slug → premier survivant DOM order', () => {
    const candidates = [
      { url: 'https://linkedin.com/in/random-a/', label: 'A' },
      { url: 'https://linkedin.com/in/random-b/', label: 'B' },
    ];
    const r = pickGuestLinkedin(candidates, 'Inconnu Total', STEFANI_EXCL);
    expect(r.url).toBe('https://linkedin.com/in/random-a/');
    expect(r.rule).toBe('order-fallback');
  });

  it('8. tenant LP : laurentkretz exclu mais kretz court NON listé → matche kretz si présent', () => {
    // Cas réel : Kretz host exclu via slug exact. Si invité "Kretz" lui-même → host-as-guest.
    const candidates = [
      { url: 'https://linkedin.com/in/laurent-kretz/', label: 'Laurent Kretz' },
    ];
    const r = pickGuestLinkedin(candidates, 'Laurent Kretz', KRETZ_EXCL);
    expect(r.url).toBe('https://linkedin.com/in/laurent-kretz/');
    expect(r.rule).toBe('host-as-guest');
  });
});

describe('buildExclusions', () => {
  it('combine configHosts + slugs dérivés du host + coHosts', () => {
    const e = buildExclusions({
      hostName: 'Matthieu Stefani',
      coHosts: ['Pauline Dupont'],
      configHosts: ['stefani'],
      configParasites: ['morganprudhomme'],
    });
    expect(e.hosts).toContain('stefani');
    expect(e.hosts).toContain('matthieustefani');
    expect(e.hosts).toContain('matthieu-stefani');
    expect(e.hosts).toContain('paulinedupont');
    expect(e.parasites).toEqual(['morganprudhomme']);
    expect(e.hostNames).toContain('matthieu stefani');
    expect(e.hostNames).toContain('pauline dupont');
  });

  it('dedup : configHosts + dérivés ne doublent pas', () => {
    const e = buildExclusions({
      hostName: 'Matthieu Stefani',
      configHosts: ['matthieustefani'],
    });
    expect(e.hosts.filter(s => s === 'matthieustefani')).toHaveLength(1);
  });
});

describe('deriveSlugsFromName', () => {
  it('génère joined + kebab + dotted + initial-prénom', () => {
    const slugs = deriveSlugsFromName('Matthieu Stefani');
    expect(slugs).toContain('matthieustefani');
    expect(slugs).toContain('matthieu-stefani');
    expect(slugs).toContain('matthieu.stefani');
    expect(slugs).toContain('mstefani');
  });

  it('sans accents', () => {
    const slugs = deriveSlugsFromName('Amaury de Tonquédec');
    expect(slugs[0]).toBe('amaurydetonquedec');
  });
});

describe('normalizeName', () => {
  it('lowercase + sans accents + collapse spaces', () => {
    expect(normalizeName('  Matthieu  STÉFANI  ')).toBe('matthieu stefani');
    expect(normalizeName(null)).toBe('');
  });
});
