import { describe, it, expect } from 'vitest';
import { getAllConfigs } from '@engine/config';

describe('Universe — configs (sans DB)', () => {
  it('6 configs actives hors hub', () => {
    const configs = getAllConfigs().filter((c) => c.id !== 'hub');
    expect(configs.length).toBeGreaterThanOrEqual(6);
    const ids = configs.map((c) => c.id).sort();
    for (const id of ['lamartingale', 'gdiy', 'lepanier', 'finscale', 'passionpatrimoine', 'combiencagagne']) {
      expect(ids).toContain(id);
    }
  });

  it('chaque config hors hub a un hub_order entier ≥ 1', () => {
    for (const c of getAllConfigs().filter((c) => c.id !== 'hub')) {
      expect(c.hub_order, `hub_order manquant pour ${c.id}`).toBeTypeOf('number');
      expect(c.hub_order!).toBeGreaterThanOrEqual(1);
    }
  });

  it('hub_order figé : LM=1, GDIY=2, LP=3, FS=4, PP=5, CCG=6', () => {
    const byId = new Map(getAllConfigs().map((c) => [c.id, c]));
    expect(byId.get('lamartingale')!.hub_order).toBe(1);
    expect(byId.get('gdiy')!.hub_order).toBe(2);
    expect(byId.get('lepanier')!.hub_order).toBe(3);
    expect(byId.get('finscale')!.hub_order).toBe(4);
    expect(byId.get('passionpatrimoine')!.hub_order).toBe(5);
    expect(byId.get('combiencagagne')!.hub_order).toBe(6);
  });

  it('tri par hub_order asc', () => {
    const sorted = getAllConfigs()
      .filter((c) => c.id !== 'hub')
      .sort((a, b) => (a.hub_order ?? Infinity) - (b.hub_order ?? Infinity))
      .map((c) => c.id);
    expect(sorted).toEqual([
      'lamartingale', 'gdiy', 'lepanier', 'finscale', 'passionpatrimoine', 'combiencagagne',
    ]);
  });

  it('chaque config hors hub a websiteHost non vide (enabler URL-matching)', async () => {
    const { websiteHostFromUrl } = await import('@engine/scraping/rss/extractors');
    for (const c of getAllConfigs().filter((c) => c.id !== 'hub')) {
      const host = websiteHostFromUrl(c.website);
      expect(host, `websiteHost absent pour ${c.id}`).toBeTruthy();
    }
  });
});
