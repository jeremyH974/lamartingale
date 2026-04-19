import { describe, it, expect } from 'vitest';
import { parseRssDescription } from '@engine/scraping/rss/parse-description';

describe('parseRssDescription — La Martingale', () => {
  it('extrait "Le sujet :"', () => {
    const desc = `Le sujet : La déclaration d'impôts 2026 arrive avec son lot de nouveautés.

L'invité du jour : Nahima Zobri est avocate fiscaliste chez Dougs.`;
    const r = parseRssDescription(desc);
    expect(r.topic).toContain("La déclaration d'impôts 2026");
  });

  it('extrait "L\'invité du jour :" (masculin)', () => {
    const desc = `L'invité du jour : Jean Dupont est CEO de Acme.

Découvrez : - item`;
    const r = parseRssDescription(desc);
    expect(r.guestIntro).toContain('Jean Dupont');
  });

  it('extrait "L\'invitée du jour :" (féminin)', () => {
    const desc = `L'invitée du jour : Marie Curie, physicienne.`;
    const r = parseRssDescription(desc);
    expect(r.guestIntro).toContain('Marie Curie');
  });

  it('extrait "Découvrez :" en liste à puces', () => {
    const desc = `Découvrez :
- Les erreurs qui coûtent cher
- Les niches fiscales
- Les revenus fonciers 2026`;
    const r = parseRssDescription(desc);
    expect(r.discover).toHaveLength(3);
    expect(r.discover[0]).toContain('erreurs');
  });

  it('extrait "Au programme :" (variante)', () => {
    const desc = `Au programme :
- Intro
- Développement
- Conclusion`;
    const r = parseRssDescription(desc);
    expect(r.discover).toHaveLength(3);
  });

  it('extrait les références avec URLs', () => {
    const desc = `Ils citent les références suivantes :
- impots.gouv.fr : https://www.impots.gouv.fr/
- Dougs : https://www.dougs.fr/`;
    const r = parseRssDescription(desc);
    expect(r.references).toHaveLength(2);
    expect(r.references[0].url).toContain('impots.gouv.fr');
    expect(r.references[0].label).toContain('impots');
  });

  it('extrait les anciens épisodes mentionnés', () => {
    const desc = `Ainsi que d'anciens épisodes de La Martingale :
#277 - ChatGPT vs CGP
#249 - Produits structurés`;
    const r = parseRssDescription(desc);
    expect(r.crossEpisodes).toHaveLength(2);
    expect(r.crossEpisodes[0].number).toBe(277);
    expect(r.crossEpisodes[0].title).toContain('ChatGPT');
  });

  it('extrait le code promo "Bonne nouvelle ! Code MARTINGALE..."', () => {
    const desc = `Bonne nouvelle ! Code MARTINGALE, 3 mois offerts chez Dougs → https://www.dougs.fr/`;
    const r = parseRssDescription(desc);
    expect(r.promo).not.toBeNull();
    expect(r.promo!.code).toBe('MARTINGALE');
    expect(r.promo!.partner).toBe('Dougs');
    expect(r.promo!.url).toContain('dougs.fr');
  });

  it('extrait "Avantages :" (variante)', () => {
    const desc = `Avantages : Code MARTINGALE chez Dougs.`;
    const r = parseRssDescription(desc);
    expect(r.promo).not.toBeNull();
    expect(r.promo!.code).toBe('MARTINGALE');
  });

  it('extrait les chapitres avec timestamps', () => {
    const desc = `Chapitres :
00:00:00 : Intro
00:08:47 : La magie de Tupperware
00:16:34 : Les revenus fonciers`;
    const r = parseRssDescription(desc);
    expect(r.chapters.length).toBeGreaterThanOrEqual(3);
    const tupperware = r.chapters.find((c) => c.title.includes('Tupperware'));
    expect(tupperware?.timestamp_seconds).toBe(527);
  });

  it("extrait l'URL YouTube", () => {
    const desc = `Découvrez l'épisode : https://youtube.com/watch?v=abc123`;
    const r = parseRssDescription(desc);
    expect(r.youtubeUrl).toContain('youtube.com');
  });

  it('extrait la cross-promo "La Martingale présente Vivement la reprise"', () => {
    const desc = `La Martingale présente Vivement la reprise`;
    const r = parseRssDescription(desc);
    expect(r.crossPromo).toContain('Vivement la reprise');
  });

  it('description vide → tous null/[]', () => {
    const r = parseRssDescription('');
    expect(r.topic).toBeNull();
    expect(r.discover).toEqual([]);
    expect(r.promo).toBeNull();
  });

  it('description sans bloc reconnu → null/[]', () => {
    const r = parseRssDescription('Juste un texte libre sans structure.');
    expect(r.topic).toBeNull();
    expect(r.discover).toEqual([]);
  });

  it('ne confond pas un autre bloc qui suit "Le sujet :"', () => {
    const desc = `Le sujet : La fiscalité.

Découvrez :
- Item 1`;
    const r = parseRssDescription(desc);
    expect(r.topic).toBe('La fiscalité.');
    expect(r.discover).toHaveLength(1);
  });
});

describe('parseRssDescription — GDIY', () => {
  it('extrait TIMELINE: comme chapitres', () => {
    const desc = `TIMELINE:
- 00:00:00 : Intro
- 00:12:30 : Parcours
- 01:05:22 : Conclusion`;
    const r = parseRssDescription(desc);
    expect(r.chapters.length).toBeGreaterThanOrEqual(3);
    const conclusion = r.chapters.find((c) => c.title.includes('Conclusion'));
    expect(conclusion?.timestamp_seconds).toBe(3922);
  });

  it('extrait "Les anciens épisodes de GDIY mentionnés :"', () => {
    const desc = `Les anciens épisodes de GDIY mentionnés :
#419 - Raphaël Gaillard
#300 - Autre invité`;
    const r = parseRssDescription(desc);
    expect(r.crossEpisodes.length).toBeGreaterThanOrEqual(2);
    expect(r.crossEpisodes[0].number).toBe(419);
  });
});

describe('parseRssDescription — robustesse', () => {
  it('gère le HTML dans la description', () => {
    const desc = `<p>Le sujet : <strong>La fiscalité</strong> en 2026.</p>`;
    const r = parseRssDescription(desc);
    expect(r.topic).toContain('fiscalité');
  });

  it('gère les entités HTML', () => {
    const desc = `<p>Le sujet : L&#39;&eacute;pargne en 2026.</p>`;
    const r = parseRssDescription(desc);
    expect(r.topic).toBeTruthy();
  });

  it('null/undefined → empty parsed', () => {
    expect(parseRssDescription(null).topic).toBeNull();
    expect(parseRssDescription(undefined).discover).toEqual([]);
  });
});
