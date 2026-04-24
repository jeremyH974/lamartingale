import { describe, it, expect } from 'vitest';
import { isToolDomain, isToolUrl, TOOL_DOMAIN_HOSTS } from '@engine/classify/tool-rules';

describe('isToolDomain — D3 classifieur commun', () => {
  it('1. reconnaît les brokers fintech (ex-scrape-deep)', () => {
    expect(isToolDomain('trade-republic.com')).toBe(true);
    expect(isToolDomain('boursorama.com')).toBe(true);
    expect(isToolDomain('degiro.com')).toBe(true);
  });

  it('2. reconnaît les SaaS / productivité (ex-rss/extractors)', () => {
    expect(isToolDomain('notion.so')).toBe(true);
    expect(isToolDomain('stripe.com')).toBe(true);
    expect(isToolDomain('airtable.com')).toBe(true);
    expect(isToolDomain('github.com')).toBe(true);
  });

  it('3. exchanges crypto reconnus', () => {
    expect(isToolDomain('binance.com')).toBe(true);
    expect(isToolDomain('coinbase.com')).toBe(true);
  });

  it('4. normalise www. + case', () => {
    expect(isToolDomain('WWW.Notion.SO')).toBe(true);
    expect(isToolDomain('www.stripe.com')).toBe(true);
  });

  it('5. refuse les non-outils', () => {
    expect(isToolDomain('bbc.co.uk')).toBe(false);
    expect(isToolDomain('lemonde.fr')).toBe(false);
    expect(isToolDomain('wikipedia.org')).toBe(false);
    expect(isToolDomain('')).toBe(false);
  });

  it('6. match substring (pas exact) → sous-domaines aussi', () => {
    // interactivebrokers.com et .fr → matchent 'interactivebrokers'
    expect(isToolDomain('interactivebrokers.com')).toBe(true);
    expect(isToolDomain('app.notion.so')).toBe(true);
  });
});

describe('isToolUrl — wrapper URL complète', () => {
  it('1. URL fintech valide → true', () => {
    expect(isToolUrl('https://www.trade-republic.com/invest')).toBe(true);
  });

  it('2. URL SaaS valide → true', () => {
    expect(isToolUrl('https://notion.so/my-page')).toBe(true);
    expect(isToolUrl('https://stripe.com/docs')).toBe(true);
  });

  it('3. URL non-outil → false', () => {
    expect(isToolUrl('https://lemonde.fr/politique')).toBe(false);
  });

  it('4. URL invalide → false (safe)', () => {
    expect(isToolUrl('pas-une-url')).toBe(false);
    expect(isToolUrl('')).toBe(false);
  });
});

describe('TOOL_DOMAIN_HOSTS — fusion fintech + SaaS', () => {
  it('1. liste non vide + contient les 2 familles', () => {
    expect(TOOL_DOMAIN_HOSTS.length).toBeGreaterThan(20);
    expect(TOOL_DOMAIN_HOSTS).toContain('boursorama.com');  // fintech
    expect(TOOL_DOMAIN_HOSTS).toContain('notion.so');       // SaaS
  });
});
