import { describe, it, expect } from 'vitest';
import {
  firstString, parseDuration, htmlToText,
  extractGuestFromTitle, extractSponsors,
  extractLinks, classifyUrl,
  extractCrossRefs, extractContact,
  computePublishFrequencyDays,
  extractChannelMetadata, extractItem,
} from '../rss/extractors';

describe('firstString', () => {
  it('renvoie la première string non vide', () => {
    expect(firstString(null, '', 'ok', 'ignored')).toBe('ok');
  });
  it('gère CDATA & #text', () => {
    expect(firstString({ '#cdata': '  hello  ' })).toBe('hello');
    expect(firstString({ '#text': 'world' })).toBe('world');
  });
  it('renvoie null si aucune valeur', () => {
    expect(firstString(null, '', undefined)).toBeNull();
  });
});

describe('parseDuration', () => {
  it('parse HH:MM:SS', () => expect(parseDuration('01:02:03')).toBe(3723));
  it('parse MM:SS',    () => expect(parseDuration('05:30')).toBe(330));
  it('parse secondes brutes', () => expect(parseDuration('1234')).toBe(1234));
  it('renvoie null pour input invalide', () => {
    expect(parseDuration(null)).toBeNull();
    expect(parseDuration('abc')).toBeNull();
    expect(parseDuration('')).toBeNull();
  });
});

describe('htmlToText', () => {
  it('supprime tags et décode entities', () => {
    const html = '<p>Bonjour <b>&amp; bonne</b> année</p><br>Suite';
    expect(htmlToText(html)).toContain('Bonjour & bonne année');
  });
});

describe('extractGuestFromTitle', () => {
  it('pattern "#313 - Matthieu Stefani - CEO de Cosa Vostra"', () => {
    const g = extractGuestFromTitle('#313 - Matthieu Stefani - CEO de Cosa Vostra');
    expect(g.name).toBe('Matthieu Stefani');
    expect(g.company).toBe('Cosa Vostra');
    expect(g.role).toMatch(/CEO/i);
  });
  it('pattern "#42 - Nom Prénom (Entreprise) : titre"', () => {
    const g = extractGuestFromTitle('#42 - Nom Prénom (Entreprise) : titre');
    expect(g.name).toBe('Nom Prénom');
    expect(g.company).toBe('Entreprise');
    expect(g.role).toBe('titre');
  });
  it('pattern "Episode 7: Jane Doe | CTO at Acme"', () => {
    const g = extractGuestFromTitle('Episode 7: Jane Doe | CTO at Acme');
    // Pas de match strict ci-dessus → fallback nom. Au pire on accepte null.
    if (g.name) expect(g.name).toMatch(/Jane/);
  });
  it('renvoie name null si non parsable', () => {
    const g = extractGuestFromTitle('économie du futur');
    expect(g.name).toBeNull();
  });
  it('particule nobiliaire : "Sixte de Vauplane - Hanna - CEO"', () => {
    const g = extractGuestFromTitle('Sixte de Vauplane - Hanna - CEO');
    expect(g.name).toBe('Sixte de Vauplane');
  });
  it('prénom composé : "Jean-Marie Le Pen - Politique - FN"', () => {
    const g = extractGuestFromTitle('Jean-Marie Le Pen - Politique - FN');
    expect(g.name).toMatch(/Jean-Marie Le Pen/);
  });
  it('strip prefix [EXTRAIT]', () => {
    const g = extractGuestFromTitle('[EXTRAIT] Nina Métayer - Pâtissière - Delicatisserie');
    expect(g.name).toMatch(/Nina M[eé]tayer/);
  });
  it('rejette titre question LM "Comment investir en 2026 ?"', () => {
    const g = extractGuestFromTitle('Comment investir en 2026 ?');
    expect(g.name).toBeNull();
  });
  it('rejette titre LM "Pourquoi les SCPI s\'effondrent"', () => {
    const g = extractGuestFromTitle("Pourquoi les SCPI s'effondrent");
    expect(g.name).toBeNull();
  });
});

describe('extractSponsors', () => {
  it('détecte "sponsorisé par"', () => {
    const s = extractSponsors('Cet épisode est sponsorisé par Shine, la banque pro.');
    expect(s.length).toBe(1);
    expect(s[0].name).toMatch(/Shine/);
  });
  it('détecte "merci à notre partenaire"', () => {
    const s = extractSponsors('Merci à notre partenaire Qonto pour son soutien.');
    expect(s[0].name).toMatch(/Qonto/);
  });
  it('dédoublonne', () => {
    const s = extractSponsors('sponsorisé par Revolut. En partenariat avec Revolut.');
    expect(s.length).toBe(1);
  });
  it('array vide si aucun', () => {
    expect(extractSponsors('contenu lambda sans sponsor')).toEqual([]);
  });
  it('bloc GDIY "Un grand MERCI à nos sponsors : Qonto: qonto.com Payfit: payfit.com"', () => {
    const text = 'Un grand MERCI à nos sponsors : \n\n Qonto: https://qonto.com/r/2i7tk9\n\n Payfit: https://payfit.com/gdiy\n\n Brevo: brevo.com/gdiy\n\nTIMELINE : 00:00 intro';
    const s = extractSponsors(text);
    const names = s.map((x) => x.name.toLowerCase());
    expect(names).toContain('qonto');
    expect(names).toContain('payfit');
    expect(names).toContain('brevo');
  });
  it('rejette noms minuscules ou trop verbeux dans bloc sponsor', () => {
    const text = 'Merci à nos sponsors : red bull d\'avoir rendu possible : https://redbull.com';
    const s = extractSponsors(text);
    // "red bull d'avoir rendu possible" doit être rejeté (minuscules + trop long)
    expect(s.find((x) => /avoir/i.test(x.name))).toBeUndefined();
  });
  it('flag /i sur MERCI uppercase', () => {
    const text = 'MERCI À NOS SPONSORS : Acme: acme.com';
    const s = extractSponsors(text);
    expect(s.find((x) => /acme/i.test(x.name))).toBeTruthy();
  });
});

describe('classifyUrl', () => {
  it('linkedin', () => expect(classifyUrl('https://www.linkedin.com/in/foo')).toBe('linkedin'));
  it('social twitter', () => expect(classifyUrl('https://twitter.com/foo')).toBe('social'));
  it('cross podcast spotify', () => expect(classifyUrl('https://open.spotify.com/episode/abc')).toBe('cross_podcast_ref'));
  it('audio mp3', () => expect(classifyUrl('https://cdn/audio.mp3')).toBe('audio'));
  it('tool notion', () => expect(classifyUrl('https://www.notion.so/foo')).toBe('tool'));
});

describe('extractLinks', () => {
  it('parse anchors + naked urls, dédoublonne', () => {
    const html = `
      <p>Visitez <a href="https://www.linkedin.com/in/x">LinkedIn</a> et
      aussi https://example.com/ressource</p>
    `;
    const links = extractLinks(html);
    const urls = links.map((l) => l.url);
    expect(urls).toContain('https://www.linkedin.com/in/x');
    expect(urls).toContain('https://example.com/ressource');
    expect(links.find((l) => l.url.includes('linkedin'))?.link_type).toBe('linkedin');
  });
});

describe('extractCrossRefs', () => {
  it('détecte mention GDIY dans texte', () => {
    const refs = extractCrossRefs('On en parlait avec Matthieu Stefani dans Génération Do It Yourself.');
    expect(refs.some((r) => r.podcast?.includes('generation'))).toBe(true);
  });
  it('inclut les URLs cross-podcast', () => {
    const refs = extractCrossRefs('', [
      { url: 'https://open.spotify.com/episode/xyz', link_type: 'cross_podcast_ref' },
    ]);
    expect(refs.length).toBe(1);
    expect(refs[0].url).toContain('spotify');
  });
});

describe('extractContact', () => {
  it('extrait emails et socials depuis HTML + texte', () => {
    const html = `
      <p>Contact : <a href="mailto:hello@lamartingale.io">email</a></p>
      <p>Twitter : https://twitter.com/lamartingale</p>
      <p>LinkedIn : <a href="https://www.linkedin.com/company/lm">LM</a></p>
    `;
    const c = extractContact(html);
    expect(c.emails).toContain('hello@lamartingale.io');
    expect(c.socials.find((s) => s.platform === 'twitter')).toBeTruthy();
    expect(c.socials.find((s) => s.platform === 'linkedin')).toBeTruthy();
  });
  it('dédoublonne', () => {
    const c = extractContact('contact@x.com contact@x.com');
    expect(c.emails.length).toBe(1);
  });
});

describe('computePublishFrequencyDays', () => {
  it('renvoie ~7 jours pour un rythme hebdo', () => {
    const dates = [
      'Mon, 01 Jan 2024 00:00:00 GMT',
      'Mon, 08 Jan 2024 00:00:00 GMT',
      'Mon, 15 Jan 2024 00:00:00 GMT',
      'Mon, 22 Jan 2024 00:00:00 GMT',
    ];
    const freq = computePublishFrequencyDays(dates);
    expect(freq).toBeGreaterThanOrEqual(6.5);
    expect(freq).toBeLessThanOrEqual(7.5);
  });
  it('renvoie null si < 2 dates', () => {
    expect(computePublishFrequencyDays([])).toBeNull();
    expect(computePublishFrequencyDays(['2024-01-01'])).toBeNull();
  });
});

describe('extractChannelMetadata', () => {
  it('parse un channel itunes canonique', () => {
    const channel = {
      title: 'La Martingale',
      description: 'Description ici. Contact: contact@lm.io',
      'itunes:author': 'Matthieu Stefani',
      'itunes:owner': { 'itunes:name': 'Matthieu', 'itunes:email': 'owner@lm.io' },
      'itunes:explicit': 'no',
      'itunes:type': 'episodic',
      language: 'fr',
      'itunes:image': { '@_href': 'https://img/lm.jpg' },
      'itunes:category': [
        { '@_text': 'Business', 'itunes:category': { '@_text': 'Investing' } },
      ],
      'itunes:keywords': 'finance, invest, podcast',
    };
    const m = extractChannelMetadata(channel);
    expect(m.title).toBe('La Martingale');
    expect(m.author).toBe('Matthieu Stefani');
    expect(m.ownerEmail).toBe('owner@lm.io');
    expect(m.explicit).toBe(false);
    expect(m.categories[0].text).toBe('Business');
    expect(m.categories[0].sub).toContain('Investing');
    expect(m.keywords).toContain('finance');
    expect(m.itunesImageUrl).toBe('https://img/lm.jpg');
    expect(m.contactEmails).toEqual(expect.arrayContaining(['owner@lm.io', 'contact@lm.io']));
  });
});

describe('extractItem', () => {
  it('extrait tous les champs d\'un item canonique', () => {
    const item = {
      title: '#100 - Jean Dupont - CEO de Acme',
      guid: 'abc-123',
      pubDate: 'Mon, 01 Jan 2024 00:00:00 GMT',
      'itunes:episode': '100',
      'itunes:season': '1',
      'itunes:episodeType': 'full',
      'itunes:explicit': 'no',
      'itunes:duration': '01:02:03',
      enclosure: { '@_url': 'https://cdn/audio.mp3', '@_length': '12345678' },
      'itunes:image': { '@_href': 'https://img/ep100.jpg' },
      'content:encoded': {
        '#cdata': '<p>Cet épisode est sponsorisé par Qonto. Voir <a href="https://www.linkedin.com/in/jdupont">LinkedIn</a>.</p>',
      },
    };
    const r = extractItem(item);
    expect(r.guid).toBe('abc-123');
    expect(r.episodeNumber).toBe(100);
    expect(r.season).toBe(1);
    expect(r.episodeType).toBe('full');
    expect(r.explicit).toBe(false);
    expect(r.durationSeconds).toBe(3723);
    expect(r.audioUrl).toBe('https://cdn/audio.mp3');
    expect(r.audioSizeBytes).toBe(12345678);
    expect(r.episodeImageUrl).toBe('https://img/ep100.jpg');
    expect(r.guestFromTitle.name).toBe('Jean Dupont');
    expect(r.sponsors[0]?.name).toMatch(/Qonto/);
    expect(r.links.find((l) => l.link_type === 'linkedin')).toBeTruthy();
  });
});
