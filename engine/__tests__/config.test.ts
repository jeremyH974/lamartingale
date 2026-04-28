import { describe, it, expect, beforeEach } from 'vitest';
import { getConfig, listConfigs, registerConfig, toPublicConfig, _setConfigForTest } from '@engine/config';
import { lamartingaleConfig } from '@instances/lamartingale.config';
import type { PodcastConfig } from '@engine/config';

describe('M1 — Config Factory', () => {
  beforeEach(() => {
    _setConfigForTest(lamartingaleConfig);
  });

  it('1. loads lamartingale config by default', () => {
    const cfg = getConfig();
    expect(cfg.id).toBe('lamartingale');
    expect(cfg.name).toBe('La Martingale');
    expect(cfg.database.tenantId).toBe('lamartingale');
  });

  it('2. has required branding fields', () => {
    const cfg = getConfig();
    expect(cfg.branding.primaryColor).toBe('#004cff');
    expect(cfg.branding.font).toBe('Poppins');
  });

  it('3. exposes 10 predefined pillars', () => {
    const cfg = getConfig();
    expect(cfg.taxonomy.mode).toBe('predefined');
    expect(cfg.taxonomy.pillars).toHaveLength(10);
    const ids = cfg.taxonomy.pillars!.map(p => p.id);
    expect(ids).toContain('IMMOBILIER');
    expect(ids).toContain('BOURSE');
    expect(ids).toContain('CRYPTO');
  });

  it('4. has RSS feed URLs configured', () => {
    const cfg = getConfig();
    // Phase B6 (2026-04-28) : LM main feed migré vers UUID-style canonique
    // (feeds.audiomeans.fr/feed/<uuid>.xml). secondary `allo-la-martingale`
    // retiré (Allo LM est désormais un tenant séparé `allolamartingale` —
    // cf. Phase A.5.2).
    expect(cfg.rssFeeds.main).toMatch(/^https:\/\/feeds\.audiomeans\.fr\//);
  });

  it('5. has scraping flags (hasArticles, timelineInRss)', () => {
    const cfg = getConfig();
    expect(cfg.scraping.hasArticles).toBe(true);
    expect(cfg.scraping.timelineInRss).toBe(false);
    expect(cfg.scraping.rateLimit).toBeGreaterThan(0);
    expect(cfg.scraping.articleSelectors.length).toBeGreaterThan(0);
  });

  it('6. toPublicConfig strips database and deploy sections', () => {
    const cfg = getConfig();
    const pub = toPublicConfig(cfg);
    expect((pub as any).database).toBeUndefined();
    expect((pub as any).deploy).toBeUndefined();
    expect((pub as any).rssFeeds).toBeUndefined();
    expect((pub as any).scraping).toBeUndefined();
    // Public fields preserved
    expect(pub.id).toBe(cfg.id);
    expect(pub.name).toBe(cfg.name);
    expect(pub.branding).toEqual(cfg.branding);
  });

  it('7. registerConfig + listConfigs integrates new podcasts', () => {
    const fake: PodcastConfig = {
      ...lamartingaleConfig,
      id: 'test-podcast',
      name: 'Test',
      database: { tenantId: 'test-podcast' },
    };
    registerConfig(fake);
    expect(listConfigs()).toContain('test-podcast');
    expect(listConfigs()).toContain('lamartingale');
  });

  it('8. episodeUrlPattern contains {slug} placeholder', () => {
    const cfg = getConfig();
    expect(cfg.episodeUrlPattern).toContain('{slug}');
    const resolved = cfg.episodeUrlPattern.replace('{slug}', 'example');
    expect(resolved).not.toContain('{slug}');
    expect(resolved).toMatch(/^https?:\/\//);
  });

  it('9. features.qualityQuizReady flag is propagated to public config (LM = true)', () => {
    const cfg = getConfig();
    expect(cfg.features?.qualityQuizReady).toBe(true);
    const pub = toPublicConfig(cfg);
    expect(pub.features?.qualityQuizReady).toBe(true);
  });

  it('10. features.qualityQuizReady flag is false for non-LM tenants (masque Quiz sur GDIY etc.)', async () => {
    const { gdiyConfig } = await import('@instances/gdiy.config');
    const { lepanierConfig } = await import('@instances/lepanier.config');
    const { finscaleConfig } = await import('@instances/finscale.config');
    const { passionpatrimoineConfig } = await import('@instances/passionpatrimoine.config');
    const { combiencagagneConfig } = await import('@instances/combiencagagne.config');
    const { hubConfig } = await import('@instances/hub.config');

    for (const c of [gdiyConfig, lepanierConfig, finscaleConfig, passionpatrimoineConfig, combiencagagneConfig, hubConfig]) {
      expect(c.features?.qualityQuizReady).toBe(false);
      const pub = toPublicConfig(c);
      expect(pub.features?.qualityQuizReady).toBe(false);
    }
  });

  it('11. features.pillarsReady flag is propagated to public config (LM = true, piliers predefined)', () => {
    const cfg = getConfig();
    expect(cfg.features?.pillarsReady).toBe(true);
    const pub = toPublicConfig(cfg);
    expect(pub.features?.pillarsReady).toBe(true);
  });

  it('12. features.pillarsReady matches audit (GDIY/FS = true, LP/PP/CCG/hub = false)', async () => {
    const { gdiyConfig } = await import('@instances/gdiy.config');
    const { finscaleConfig } = await import('@instances/finscale.config');
    const { lepanierConfig } = await import('@instances/lepanier.config');
    const { passionpatrimoineConfig } = await import('@instances/passionpatrimoine.config');
    const { combiencagagneConfig } = await import('@instances/combiencagagne.config');
    const { hubConfig } = await import('@instances/hub.config');

    // Auto-cluster propre
    for (const c of [gdiyConfig, finscaleConfig]) {
      expect(c.features?.pillarsReady).toBe(true);
      expect(toPublicConfig(c).features?.pillarsReady).toBe(true);
    }
    // Bucket UNCLASSIFIED significatif ou pas de piliers propres
    for (const c of [lepanierConfig, passionpatrimoineConfig, combiencagagneConfig, hubConfig]) {
      expect(c.features?.pillarsReady).toBe(false);
      expect(toPublicConfig(c).features?.pillarsReady).toBe(false);
    }
  });
});
