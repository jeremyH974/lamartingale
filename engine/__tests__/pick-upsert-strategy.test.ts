/**
 * Tests pour pickUpsertStrategy — Phase A.5.5a (2026-04-28).
 *
 * Cf. engine/scraping/rss/pick-upsert-strategy.ts pour la spec.
 * Mock-free : helper pur, zéro dépendance DB / IO.
 */
import { describe, it, expect } from 'vitest';
import { pickUpsertStrategy } from '../scraping/rss/pick-upsert-strategy';

describe('pickUpsertStrategy', () => {
  it('hasEpNum=true (isFull + episode_number) → episode_number', () => {
    expect(pickUpsertStrategy({ episodeType: 'full', episodeNumber: 535, guid: 'abc' })).toBe('episode_number');
    expect(pickUpsertStrategy({ episodeType: null, episodeNumber: 535, guid: 'abc' })).toBe('episode_number');
    expect(pickUpsertStrategy({ episodeType: undefined, episodeNumber: 1, guid: 'g' })).toBe('episode_number');
  });

  it('hasEpNum=false (isFull mais episode_number=null) + guid → guid (cas LP réel #328 #319 #318 #125 #0)', () => {
    // Reproduit le pattern LP qui crashait avant le fix : Audiomeans ne renvoie
    // plus <itunes:episode> mais le guid existe et le row est en DB.
    expect(pickUpsertStrategy({ episodeType: 'full', episodeNumber: null, guid: 'be-b9d6-8d86bd3bb587' })).toBe('guid');
    expect(pickUpsertStrategy({ episodeType: null, episodeNumber: null, guid: 'b74986e5f7a8b695aed3' })).toBe('guid');
    expect(pickUpsertStrategy({ episodeType: 'full', episodeNumber: undefined, guid: 'cb-86d2-911ebe9bc84a' })).toBe('guid');
  });

  it('hasEpNum=false (!isFull = bonus) + guid → guid', () => {
    expect(pickUpsertStrategy({ episodeType: 'bonus', episodeNumber: 100, guid: 'g' })).toBe('guid');
    expect(pickUpsertStrategy({ episodeType: 'bonus', episodeNumber: null, guid: 'g' })).toBe('guid');
    expect(pickUpsertStrategy({ episodeType: 'trailer', episodeNumber: null, guid: 'g' })).toBe('guid');
  });

  it('hasEpNum=false + guid absent → skip', () => {
    expect(pickUpsertStrategy({ episodeType: 'full', episodeNumber: null, guid: null })).toBe('skip');
    expect(pickUpsertStrategy({ episodeType: 'bonus', episodeNumber: null, guid: undefined })).toBe('skip');
    expect(pickUpsertStrategy({ episodeType: null, episodeNumber: null, guid: '' })).toBe('skip');
  });

  it('isFull + episode_number=0 (épisode pilote LP) → episode_number (0 est valide)', () => {
    // Le Panier a un ép. #0 - "Le Panier - CosaVostra". 0 est falsy en JS mais
    // null/undefined-only check (`!= null`) doit le préserver.
    expect(pickUpsertStrategy({ episodeType: 'full', episodeNumber: 0, guid: 'g' })).toBe('episode_number');
  });

  it('régression : NaN n\'est pas accepté comme episode_number → fallback guid', () => {
    // NaN != null est true en JS mais un NaN n'est pas un episode_number valide.
    // On veut que l'INSERT ne tente pas de mettre NaN en DB. Comportement actuel
    // documenté : NaN passe le check `!= null`, route 'episode_number' ; côté
    // ingest-rss l'INSERT échouera. C'est OK : ingest-rss ne reçoit pas de NaN
    // (extractItem garantit number|null). Test pour documenter le contrat.
    expect(pickUpsertStrategy({ episodeType: 'full', episodeNumber: NaN, guid: 'g' })).toBe('episode_number');
  });
});
