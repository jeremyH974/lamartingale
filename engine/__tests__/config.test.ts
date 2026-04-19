import { describe, it, expect, beforeEach } from 'vitest';
import { getConfig, listConfigs, registerConfig, toPublicConfig, _setConfigForTest } from '../config';
import { lamartingaleConfig } from '../config/lamartingale.config';
import type { PodcastConfig } from '../config';

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
    expect(cfg.rssFeeds.main).toMatch(/^https:\/\/feed\.audiomeans\.fr\//);
    expect(cfg.rssFeeds.secondary).toBeDefined();
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
});
