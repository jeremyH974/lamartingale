/**
 * Tests pour la décision de rendu pairStats du hub (Phase A re-codée).
 * Cf. engine/cross/pair-stats-rendering.ts pour la spec.
 */
import { describe, it, expect } from 'vitest';
import { decidePairStatsRendering } from '../cross/pair-stats-rendering';

const P = (from: string, to: string, count: number) => ({ from, to, count });

describe('decidePairStatsRendering', () => {
  it('0 paire → fallback sans amorce ni display', () => {
    const r = decidePairStatsRendering([]);
    expect(r.mode).toBe('fallback');
    expect(r.display).toEqual([]);
    expect(r.starter).toEqual([]);
    expect(r.diagnostics.totalPairs).toBe(0);
    expect(r.diagnostics.significantPairs).toBe(0);
  });

  it('10 paires dont 4 significatives (>=5 refs) → fallback + amorce top 3', () => {
    const pairs = [
      P('lm', 'gdiy', 114),
      P('gdiy', 'lm', 74),
      P('lp', 'gdiy', 38),
      P('gdiy', 'lp', 12),
      P('lp', 'lm', 3),
      P('finscale', 'gdiy', 2),
      P('finscale', 'lm', 1),
      P('passionpatrimoine', 'pp', 1),
      P('combiencagagne', 'lm', 0),
      P('finscale', 'lp', 0),
    ];
    const r = decidePairStatsRendering(pairs);
    expect(r.mode).toBe('fallback');
    expect(r.display).toEqual([]);
    expect(r.starter).toHaveLength(3);
    expect(r.starter[0]).toEqual(P('lm', 'gdiy', 114));
    expect(r.starter[1]).toEqual(P('gdiy', 'lm', 74));
    expect(r.starter[2]).toEqual(P('lp', 'gdiy', 38));
    expect(r.diagnostics.significantPairs).toBe(4);
    expect(r.diagnostics.totalPairs).toBe(10);
  });

  it('10 paires dont 6 significatives → mode normal, top 10 affiché', () => {
    const pairs = [
      P('a', 'b', 50),
      P('b', 'a', 40),
      P('c', 'd', 30),
      P('d', 'c', 20),
      P('e', 'f', 10),
      P('f', 'e', 5),
      P('g', 'h', 4),
      P('h', 'g', 3),
      P('i', 'j', 2),
      P('j', 'i', 1),
    ];
    const r = decidePairStatsRendering(pairs);
    expect(r.mode).toBe('normal');
    expect(r.display).toHaveLength(10);
    expect(r.starter).toEqual([]);
    expect(r.display[0]).toEqual(P('a', 'b', 50));
    expect(r.diagnostics.significantPairs).toBe(6);
  });

  it('exactement 5 paires significatives (boundary) → mode normal', () => {
    const pairs = [
      P('a', 'b', 10),
      P('b', 'a', 9),
      P('c', 'd', 8),
      P('d', 'c', 7),
      P('e', 'f', 5),
      P('f', 'e', 4),
    ];
    const r = decidePairStatsRendering(pairs);
    expect(r.mode).toBe('normal');
    expect(r.diagnostics.significantPairs).toBe(5);
  });

  it('exactement 4 paires significatives (boundary -1) → fallback', () => {
    const pairs = [
      P('a', 'b', 10),
      P('b', 'a', 9),
      P('c', 'd', 8),
      P('d', 'c', 5),
      P('e', 'f', 4),
    ];
    const r = decidePairStatsRendering(pairs);
    expect(r.mode).toBe('fallback');
    expect(r.diagnostics.significantPairs).toBe(4);
    expect(r.starter).toHaveLength(3);
  });

  it('1 seule paire significative énorme → fallback (1 < 5 paires significatives)', () => {
    const pairs = [P('a', 'b', 9999), P('c', 'd', 1)];
    const r = decidePairStatsRendering(pairs);
    expect(r.mode).toBe('fallback');
    expect(r.starter).toHaveLength(2);
    expect(r.starter[0].count).toBe(9999);
  });

  it('input non-trié est trié par count desc avant slice', () => {
    const pairs = [P('low', 'low', 1), P('high', 'high', 100), P('mid', 'mid', 50)];
    const r = decidePairStatsRendering(pairs);
    expect(r.starter[0].from).toBe('high');
    expect(r.starter[1].from).toBe('mid');
    expect(r.starter[2].from).toBe('low');
  });

  it('options.minSignificantRefs custom respectée', () => {
    const pairs = [P('a', 'b', 3), P('b', 'a', 3), P('c', 'd', 3), P('d', 'c', 3), P('e', 'f', 3), P('f', 'e', 3)];
    const lowThr = decidePairStatsRendering(pairs, { minSignificantRefs: 2 });
    expect(lowThr.mode).toBe('normal');
    const defaultThr = decidePairStatsRendering(pairs);
    expect(defaultThr.mode).toBe('fallback');
  });

  it('options.starterN custom respectée', () => {
    const pairs = [P('a', 'b', 1), P('c', 'd', 1)];
    const r = decidePairStatsRendering(pairs, { starterN: 1 });
    expect(r.starter).toHaveLength(1);
  });
});
