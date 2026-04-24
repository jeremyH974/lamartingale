import { describe, it, expect } from 'vitest';
import { deriveHostFilters } from '@engine/db/cross-queries';

describe('deriveHostFilters — config-driven host noise filters (P2#11)', () => {
  it('1. "Matthieu Stefani" génère slugs joined + kebab', () => {
    const f = deriveHostFilters(['Matthieu Stefani']);
    expect(f.normalized).toContain('matthieu stefani');
    expect(f.linkedinSlugs).toEqual(['matthieustefani', 'matthieu-stefani']);
    expect(f.namePatterns).toContain('%matthieu stefani%');
  });

  it('2. hosts avec accents : variante sans accent + variante brute lower', () => {
    const f = deriveHostFilters(['Amaury de Tonquédec']);
    expect(f.normalized).toContain('amaury de tonquedec');
    expect(f.normalized).toContain('amaury de tonquédec');
    expect(f.linkedinSlugs).toEqual(['amaurydetonquedec', 'amaury-de-tonquedec']);
  });

  it('3. dedup : 2 hosts identiques → 1 seule entrée', () => {
    const f = deriveHostFilters(['Matthieu Stefani', 'Matthieu Stefani']);
    expect(f.normalized.filter(h => h === 'matthieu stefani')).toHaveLength(1);
    expect(f.linkedinSlugs.filter(s => s === 'matthieustefani')).toHaveLength(1);
  });

  it('4. robuste aux entrées invalides (null, undefined, espaces, non-string)', () => {
    const f = deriveHostFilters(['', '   ', null as any, undefined as any, 42 as any, 'Jean Dupont']);
    expect(f.normalized).toEqual(['jean dupont']);
    expect(f.linkedinSlugs).toEqual(['jeandupont', 'jean-dupont']);
  });

  it('5. namePatterns = normalized wrappé %…% (prêt pour LIKE ALL/ANY)', () => {
    const f = deriveHostFilters(['Laurent Kretz', 'Clémence Lepic']);
    expect(f.namePatterns).toContain('%laurent kretz%');
    expect(f.namePatterns).toContain('%clemence lepic%');
    expect(f.namePatterns).toContain('%clémence lepic%');
  });

  it('6. univers MS complet (LM + GDIY + LP + Finscale + PP + CCG)', () => {
    const f = deriveHostFilters([
      'Matthieu Stefani',
      'Amaury de Tonquédec',
      'Laurent Kretz',
      'Solenne Niedercorn',
      'Carine Dany',
      'Clémence Lepic',
    ]);
    // 6 hosts, 2 avec accent → 8 variantes normalisées
    expect(f.normalized).toContain('matthieu stefani');
    expect(f.normalized).toContain('amaury de tonquedec');
    expect(f.normalized).toContain('clemence lepic');
    expect(f.normalized).toContain('clémence lepic');
    // LinkedIn slugs : 2 variantes (joined + kebab) par host, dédupliquées
    expect(f.linkedinSlugs).toContain('matthieustefani');
    expect(f.linkedinSlugs).toContain('matthieu-stefani');
    expect(f.linkedinSlugs).toContain('amaurydetonquedec');
    expect(f.linkedinSlugs).toContain('amaury-de-tonquedec');
  });
});
