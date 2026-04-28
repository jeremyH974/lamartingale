/**
 * Tests pour isValidPersonName — Phase B3 (2026-04-28).
 *
 * Corpus négatif : les 30 noms supprimés en B2 (qui ont passé la version
 * pré-B3 de la fonction et sont donc connus pour être des faux positifs
 * que la nouvelle version doit reject).
 *
 * Corpus positif : noms réels de l'écosystème Stefani avec variations
 * (accents, tirets, double prénom, mononyme à 2 tokens minimum).
 */
import { describe, it, expect } from 'vitest';
import { isValidPersonName } from '../cross/is-valid-person-name';

describe('isValidPersonName', () => {
  // ─── corpus positif (vrais guests à PRESERVER) ──────────────────────────
  it('accepte les noms réels avec accents / tirets', () => {
    const validNames = [
      'Eric Larchevêque',
      'Stéphanie Delestre',
      'Solenne Niedercorn-Desouches',
      'Iñaki Lartigue',
      'Maÿlis Staub',
      'Jean-Baptiste Kempf',
      'Anne-Cécile Mailfert',
      'Matthieu Stefani',
      'Clémence Lepic',
      'David Carzon',
    ];
    for (const n of validNames) {
      expect(isValidPersonName(n), `should accept "${n}"`).toBe(true);
    }
  });

  // ─── null/undefined/empty ───────────────────────────────────────────────
  it('reject null/undefined/empty', () => {
    expect(isValidPersonName(null)).toBe(false);
    expect(isValidPersonName(undefined)).toBe(false);
    expect(isValidPersonName('')).toBe(false);
    expect(isValidPersonName('   ')).toBe(false);
  });

  // ─── corpus négatif B2 (30 IDs supprimés) ──────────────────────────────
  // Ces 30 noms ont été identifiés comme pollution en Phase B1 et supprimés
  // en B2. La fonction B3 doit tous les reject sinon B3 ne sert à rien
  // (pollution se recréerait au prochain match-guests run).
  it('reject les 30 cas pollution supprimés en B2', () => {
    const polluted = [
      'amadou ba - booska-p - le media qui fait kiffer la moitie des francais',
      'christian jorge vestiaire collective 2/2',
      'franck annese - so press - les secrets de la presse qui cartonne',
      'paul morlet - du bep electricien a lunettes pour tous',
      'romain raffard - bergamotte - quand ton e-commerce sent bon la reussite',
      "william kriegel - l'homme qui murmurait a l'oreille des chevaux",
      'bordeaux, bourgogne ou vins nature : dans quelle bouteille investir ?',
      "alltricks : d'un garage au board de decathlon",
      'cabaia : du pop',
      "flowrette : d'un side",
      "emily's pillow",
      'duralex : nouveau souffle digital et e',
      'jolimoi : social selling',
      'le beau the : un side',
      'nide.co : co',
      'merci handy : produits cleans, licornes, arcs',
      'reprendre une entreprise 4 ans apres sa fermeture',
      "petrone : l'artisanat moderne et ethique des sous",
      'seagale : 7 personnes, 5m de ca et 200 commandes par jour, avec bertrand durand',
      'hs 1 to 1 monaco',
      'trouver de',
      'trouver le',
      'produits structures : strategie ou illusion ?',
      "scpi : revenir a l'immobilier grace a la transparence",
      "nicolas d'",
      "l'apero de",
      "s'affranchir de google",
      "romain d'",
      'sebastien ermine - « le risque',
      "valentin kretz - l'agence",
    ];
    expect(polluted.length).toBe(30);
    for (const p of polluted) {
      expect(isValidPersonName(p), `should reject "${p}"`).toBe(false);
    }
  });

  // ─── pattern par pattern (smoke tests, anti-régression) ────────────────
  it('reject les RSS markers', () => {
    expect(isValidPersonName('[REDIFF] Eric Larchevêque')).toBe(false);
    expect(isValidPersonName('[EXTRAIT] Test')).toBe(false);
    expect(isValidPersonName('#HS Episode')).toBe(false);
  });

  it('reject les single-token mononymes', () => {
    expect(isValidPersonName('Madonna')).toBe(false);
    expect(isValidPersonName('Stefani')).toBe(false);
    expect(isValidPersonName('1234')).toBe(false);
  });

  it('reject names trop longs (>50 chars)', () => {
    expect(isValidPersonName('A'.repeat(51) + ' Bcd')).toBe(false); // 55 chars > 50 → reject
    // Sous le seuil 50 : accepté
    expect(isValidPersonName('Eric Larchevêque Marc Dupont Jean Quelqu')).toBe(true); // 40 chars
    // Boundary exact 50 : accepté
    expect(isValidPersonName('A'.repeat(46) + ' Bcd')).toBe(true); // 50 chars
    // Boundary 51 : rejeté
    expect(isValidPersonName('A'.repeat(47) + ' Bcd')).toBe(false); // 51 chars
  });

  it('reject names contenant ":" / "/" / "|"', () => {
    expect(isValidPersonName('Eric : titre')).toBe(false);
    expect(isValidPersonName('Eric/Marc')).toBe(false);
    expect(isValidPersonName('Eric | Marc')).toBe(false);
  });

  it('reject multiple " - " sections', () => {
    expect(isValidPersonName('Eric - Ledger - co-fondateur')).toBe(false);
    expect(isValidPersonName('Eric Larchevêque - Ledger')).toBe(true); // 1 dash OK
  });

  it('reject verbes éditoriaux (n\'importe où dans le nom)', () => {
    expect(isValidPersonName('Comment lever des fonds')).toBe(false);
    expect(isValidPersonName('Devenir entrepreneur')).toBe(false);
    expect(isValidPersonName('Réussir sa boîte')).toBe(false);
  });

  it('reject apostrophe typo en fin (nom tronqué)', () => {
    expect(isValidPersonName("Nicolas d'")).toBe(false);
    expect(isValidPersonName("Romain d'")).toBe(false);
    // Apostrophe au milieu OK
    expect(isValidPersonName("Marc D'Esposito")).toBe(true);
  });

  it('reject caractères éditoriaux « »', () => {
    expect(isValidPersonName('Sebastien Ermine « le risque')).toBe(false);
    expect(isValidPersonName('Marc » fin')).toBe(false);
  });

  it('reject ne commençant pas par majuscule', () => {
    expect(isValidPersonName('eric larchevêque')).toBe(false); // lowercase start
    expect(isValidPersonName(' eric larchevêque')).toBe(false); // trim puis lowercase
  });
});
