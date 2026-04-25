/**
 * Tests pure fn `deriveHostFilters()` (engine/db/cross-queries.ts).
 *
 * Couvre la dérivation des filtres hosts (normalized + linkedinSlugs +
 * namePatterns) utilisée par cross-queries pour filtrer les hosts dans
 * les agrégats cross-tenant. Pure — testable sans DB ni config réelle.
 */

import { describe, it, expect } from 'vitest';
import { deriveHostFilters } from '../db/cross-queries';

describe('deriveHostFilters — pure fn', () => {
  it('1. host unique : retourne normalized + 2 slugs (joined + kebab) + 1 pattern', () => {
    const r = deriveHostFilters(['Matthieu Stefani']);
    expect(r.normalized).toContain('matthieu stefani');
    expect(r.linkedinSlugs).toContain('matthieustefani');
    expect(r.linkedinSlugs).toContain('matthieu-stefani');
    expect(r.namePatterns).toEqual(['%matthieu stefani%']);
  });

  it('2. multi-host : 2 hosts → 2 normalized + slugs cumulés', () => {
    const r = deriveHostFilters(['Matthieu Stefani', 'Laurent Kretz']);
    expect(r.normalized).toContain('matthieu stefani');
    expect(r.normalized).toContain('laurent kretz');
    expect(r.linkedinSlugs).toContain('matthieustefani');
    expect(r.linkedinSlugs).toContain('laurentkretz');
    expect(r.namePatterns).toHaveLength(2);
    expect(r.namePatterns).toContain('%matthieu stefani%');
    expect(r.namePatterns).toContain('%laurent kretz%');
  });

  it('3. liste vide : retourne arrays vides (pas de crash)', () => {
    const r = deriveHostFilters([]);
    expect(r.normalized).toEqual([]);
    expect(r.linkedinSlugs).toEqual([]);
    expect(r.namePatterns).toEqual([]);
  });

  it('4. inputs invalides (null/undefined/empty/non-string) : ignorés défensivement', () => {
    // Cast en any pour simuler des entrées défaillantes (config malformée).
    const r = deriveHostFilters([
      'Matthieu Stefani',
      '' as any,
      '   ' as any,
      null as any,
      undefined as any,
      42 as any,
    ]);
    // Seul "Matthieu Stefani" doit survivre.
    expect(r.normalized).toContain('matthieu stefani');
    expect(r.normalized).toHaveLength(1);
    expect(r.namePatterns).toHaveLength(1);
  });

  it('5. accents normalisés : "Amaury de Tonquédec" → sans diacritiques', () => {
    const r = deriveHostFilters(['Amaury de Tonquédec']);
    // Lower + strip diacritiques pour normalized
    expect(r.normalized).toContain('amaury de tonquedec');
    expect(r.linkedinSlugs).toContain('amaurydetonquedec');
    expect(r.linkedinSlugs).toContain('amaury-de-tonquedec');
  });

  it('6. dedup : même host listé 2× → une seule entrée', () => {
    const r = deriveHostFilters(['Matthieu Stefani', 'Matthieu Stefani']);
    expect(r.normalized.filter(n => n === 'matthieu stefani')).toHaveLength(1);
    expect(r.linkedinSlugs.filter(s => s === 'matthieustefani')).toHaveLength(1);
  });
});
