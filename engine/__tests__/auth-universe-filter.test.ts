import { describe, it, expect } from 'vitest';
import { filterUniverseByTenants } from '../api';

// Fixture minimale reproduisant la shape de /api/universe.
function fixture() {
  return {
    universe: {
      id: 'ms',
      name: 'Univers MS',
      tagline: 'test',
      producers: ['Orso'],
      totals: { podcasts: 3, episodes: 300, hours: 400, guests: 150, crossGuests: 2, crossEpisodeRefs: 5 },
    },
    podcasts: [
      { id: 'lamartingale', stats: { episodes: 100, hours: 120, guests: 60, articles: 90, lastEpisodeDate: null } },
      { id: 'gdiy',         stats: { episodes: 150, hours: 200, guests: 70, articles: 140, lastEpisodeDate: null } },
      { id: 'lepanier',     stats: { episodes: 50,  hours: 80,  guests: 20, articles: 0,   lastEpisodeDate: null } },
    ],
    cross: {
      guests: [
        { canonical: 'Alice', podcasts: ['lamartingale', 'gdiy'], count: 2, appearances: [
          { podcast: 'lamartingale', podcast_name: 'LM', episodeNumber: 1, title: 't1' },
          { podcast: 'gdiy', podcast_name: 'GDIY', episodeNumber: 2, title: 't2' },
        ]},
        { canonical: 'Bob', podcasts: ['lepanier', 'gdiy'], count: 2, appearances: [
          { podcast: 'lepanier', podcast_name: 'LP', episodeNumber: 3, title: 't3' },
          { podcast: 'gdiy', podcast_name: 'GDIY', episodeNumber: 4, title: 't4' },
        ]},
      ],
      episodeRefs: [
        { from: { podcast: 'lamartingale', episodeId: 1, episodeNumber: 1, title: 't1' }, to: { podcast: 'gdiy', url: 'https://gdiy.fr/x' } },
        { from: { podcast: 'gdiy', episodeId: 2, episodeNumber: 2, title: 't2' }, to: { podcast: 'lepanier', url: 'https://lepanier.io/y' } },
      ],
      pairStats: [
        { from: 'lamartingale', to: 'gdiy', count: 3 },
        { from: 'gdiy', to: 'lepanier', count: 2 },
      ],
    },
  };
}

describe('filterUniverseByTenants — scoping /api/universe', () => {
  it('keeps all tenants when allowed=all', () => {
    const full = fixture();
    const filtered = filterUniverseByTenants(full, new Set(['lamartingale', 'gdiy', 'lepanier']));
    expect(filtered.podcasts.length).toBe(3);
    expect(filtered.cross.pairStats.length).toBe(2);
    expect(filtered.cross.episodeRefs.length).toBe(2);
    expect(filtered.cross.guests.length).toBe(2);
    expect(filtered.universe.totals.crossEpisodeRefs).toBe(5);
  });

  it('filters to 1 tenant (lamartingale only)', () => {
    const full = fixture();
    const filtered = filterUniverseByTenants(full, new Set(['lamartingale']));
    expect(filtered.podcasts.length).toBe(1);
    expect(filtered.podcasts[0].id).toBe('lamartingale');
    // pairStats only where BOTH from and to are in the set (seul tenant = 0 pairs)
    expect(filtered.cross.pairStats.length).toBe(0);
    expect(filtered.cross.episodeRefs.length).toBe(0);
    // Guests : Alice apparaît sur LM + GDIY → conservée mais seulement appearance LM
    const alice = filtered.cross.guests.find((g: any) => g.canonical === 'Alice');
    expect(alice).toBeDefined();
    expect(alice.appearances.length).toBe(1);
    expect(alice.appearances[0].podcast).toBe('lamartingale');
    // Bob n'a pas LM → drop
    expect(filtered.cross.guests.find((g: any) => g.canonical === 'Bob')).toBeUndefined();
  });

  it('filters to 2 tenants (lamartingale + gdiy)', () => {
    const full = fixture();
    const filtered = filterUniverseByTenants(full, new Set(['lamartingale', 'gdiy']));
    expect(filtered.podcasts.length).toBe(2);
    expect(filtered.cross.pairStats.length).toBe(1); // seulement LM→GDIY
    expect(filtered.cross.pairStats[0]).toEqual({ from: 'lamartingale', to: 'gdiy', count: 3 });
    expect(filtered.cross.episodeRefs.length).toBe(1);
    expect(filtered.universe.totals.crossEpisodeRefs).toBe(3);
  });

  it('returns empty podcasts when 0 allowed', () => {
    const full = fixture();
    const filtered = filterUniverseByTenants(full, new Set());
    expect(filtered.podcasts.length).toBe(0);
    expect(filtered.cross.pairStats.length).toBe(0);
    expect(filtered.cross.episodeRefs.length).toBe(0);
    expect(filtered.cross.guests.length).toBe(0);
    expect(filtered.universe.totals.episodes).toBe(0);
  });

  it('recomputes totals after filter', () => {
    const full = fixture();
    const filtered = filterUniverseByTenants(full, new Set(['gdiy']));
    expect(filtered.universe.totals.podcasts).toBe(1);
    expect(filtered.universe.totals.episodes).toBe(150);
    expect(filtered.universe.totals.hours).toBe(200);
  });
});
