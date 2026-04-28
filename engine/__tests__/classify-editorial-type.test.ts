/**
 * Tests pour classifyEditorialType — Phase A.5.4 (2026-04-28).
 * Cf. engine/util/classify-editorial-type.ts pour la spec.
 *
 * Note : la fonction classifie le TYPE ÉDITORIAL via title (orthogonal à
 * episode_type iTunes RSS). Voir doc dans le module pour la table de
 * correspondance.
 */
import { describe, it, expect } from 'vitest';
import { classifyEditorialType } from '../util/classify-editorial-type';

describe('classifyEditorialType', () => {
  // ─── nominal cases ──────────────────────────────────────────────────────
  it('full par défaut sur titre standard', () => {
    expect(classifyEditorialType('#535 - Marwan Mery - Négociateur')).toBe('full');
    expect(classifyEditorialType('Comment payer moins d\'impôts en 2026 ?')).toBe('full');
    expect(classifyEditorialType('#147 - Agent immo : survivre à l\'IA')).toBe('full');
  });

  it('extract sur [EXTRAIT] (français Finscale, GDIY)', () => {
    expect(classifyEditorialType('[EXTRAIT] Clément Buyse (Slate VC) - Lever un fonds')).toBe('extract');
    expect(classifyEditorialType('[Extrait] Fanny Picard (Alter Equity)')).toBe('extract');
    expect(classifyEditorialType('  [extrait]  Anne Lucas')).toBe('extract');
  });

  it('extract sur [EXCERPT] (anglais Finscale)', () => {
    expect(classifyEditorialType('[EXCERPT] Anne Lucas (Alta) - The talent unicorn')).toBe('extract');
    expect(classifyEditorialType('[excerpt] Robin Wauters - EU Inc')).toBe('extract');
  });

  it('teaser sur [teaser]', () => {
    expect(classifyEditorialType('[teaser] Solenne Niedercorn revient sur 2024')).toBe('teaser');
    expect(classifyEditorialType('[TEASER] Saison 5')).toBe('teaser');
  });

  it('rediff sur [REDIFF], [REDIFFUSION], [REPLAY]', () => {
    expect(classifyEditorialType('[REDIFF] L\'épisode mythique de 2022')).toBe('rediff');
    expect(classifyEditorialType('[Rediffusion] Eric Larchevêque')).toBe('rediff');
    expect(classifyEditorialType('[REPLAY] Best of été')).toBe('rediff');
    expect(classifyEditorialType('[replay] Best of')).toBe('rediff');
  });

  it('bonus sur [BONUS]', () => {
    expect(classifyEditorialType('[BONUS] Coulisses du tournage')).toBe('bonus');
    expect(classifyEditorialType('[bonus] Q&A Stefani')).toBe('bonus');
  });

  it('hs sur "#HS …" et variantes (Le Panier, PP)', () => {
    expect(classifyEditorialType('#HS 1 to 1 Monaco - Cabaïa')).toBe('hs');
    expect(classifyEditorialType('#HS-12 Conférence DNVB')).toBe('hs');
    expect(classifyEditorialType('  #HS Lancement collection')).toBe('hs');
  });

  it('hs sur "Hors-série" / "Hors série" textuel', () => {
    expect(classifyEditorialType('Hors-série : DLD Munich 2026')).toBe('hs');
    expect(classifyEditorialType('Hors série spécial été')).toBe('hs');
    expect(classifyEditorialType('hors-serie sans accent')).toBe('hs');
  });

  // ─── edge cases ─────────────────────────────────────────────────────────
  it('null / undefined / vide → unknown', () => {
    expect(classifyEditorialType(null)).toBe('unknown');
    expect(classifyEditorialType(undefined)).toBe('unknown');
    expect(classifyEditorialType('')).toBe('unknown');
    expect(classifyEditorialType('   ')).toBe('unknown');
  });

  it('casse mixte respectée par /i', () => {
    expect(classifyEditorialType('[ExTrAiT] Mix de casse')).toBe('extract');
    expect(classifyEditorialType('[BoNuS] Mix de casse')).toBe('bonus');
  });

  it('multi-markers : priorité du premier match (extract > teaser > rediff > bonus > hs)', () => {
    // Cas théorique improbable : un titre avec [EXTRAIT] ET [REDIFF].
    // Convention : extract gagne (priorité d'ordre dans PATTERNS).
    expect(classifyEditorialType('[EXTRAIT] [REDIFF] Episode bizarre')).toBe('extract');
    // [BONUS] avant #HS dans ordre PATTERNS → bonus gagne
    expect(classifyEditorialType('[BONUS] #HS Coulisses HS')).toBe('bonus');
  });

  it('"#HS" doit matcher seulement comme préfixe ou avec word boundary, pas dans n\'importe quel mot', () => {
    // Le pattern n'est pas censé matcher "Match" ou "Achs" au milieu d'un mot
    expect(classifyEditorialType('#535 - Match Hors et achats')).toBe('full');
    expect(classifyEditorialType('#100 - Décrypter HSBC vs BNP')).toBe('full');
  });

  it('mot "extraits" sans crochets reste full (pas de faux positif)', () => {
    expect(classifyEditorialType('Comment lire les extraits financiers')).toBe('full');
    expect(classifyEditorialType('Bonus track inclus dans cet épisode')).toBe('full');
  });

  it('épisodes #HS Le Panier réels reproduits', () => {
    expect(classifyEditorialType('#HS 1 to 1 Monaco - Cabaïa, Meta et le plafond de verre : comment débloquer la croissance quand on a tout optimisé')).toBe('hs');
    expect(classifyEditorialType('#HS 1 to 1 Monaco - Individualisation : vous avez la donnée. Ce qui manque, c\'est comment s\'en servir, avec Reelevant')).toBe('hs');
  });

  it('épisodes Finscale réels (extract anglais et français mélangés)', () => {
    expect(classifyEditorialType('[EXTRAIT]  Clément Buyse (Slate VC) - Lever un fonds de 250M pour le climat (après un exit aux US)')).toBe('extract');
    expect(classifyEditorialType('[EXCERPT] Thomas Restout (B2C2) - The invisible hand behind a crypto trade')).toBe('extract');
  });
});
