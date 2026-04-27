import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerScoringStrategy,
  getScoringStrategy,
  hasScoringStrategy,
  listScoringStrategies,
  clearScoringRegistry,
  type ScoringFunction,
} from '@engine/lens/scoring-registry';

describe('scoring-registry', () => {
  beforeEach(() => {
    clearScoringRegistry();
  });

  it('round-trip register + get', () => {
    const fn: ScoringFunction = () => 0.5;
    registerScoringStrategy('test-strategy', fn);
    expect(getScoringStrategy('test-strategy')).toBe(fn);
  });

  it('throws on get of unregistered strategy', () => {
    expect(() => getScoringStrategy('inexistant')).toThrow(/no strategy registered/);
  });

  it('error message lists registered strategies for diagnostics', () => {
    registerScoringStrategy('alpha', () => 0);
    registerScoringStrategy('beta', () => 0);
    try {
      getScoringStrategy('inexistant');
    } catch (err) {
      expect((err as Error).message).toMatch(/alpha/);
      expect((err as Error).message).toMatch(/beta/);
    }
  });

  it('hasScoringStrategy returns boolean correctly', () => {
    expect(hasScoringStrategy('foo')).toBe(false);
    registerScoringStrategy('foo', () => 0);
    expect(hasScoringStrategy('foo')).toBe(true);
  });

  it('listScoringStrategies returns sorted ids', () => {
    registerScoringStrategy('zeta', () => 0);
    registerScoringStrategy('alpha', () => 0);
    registerScoringStrategy('mu', () => 0);
    expect(listScoringStrategies()).toEqual(['alpha', 'mu', 'zeta']);
  });

  it('clearScoringRegistry empties the registry', () => {
    registerScoringStrategy('x', () => 0);
    expect(listScoringStrategies()).toHaveLength(1);
    clearScoringRegistry();
    expect(listScoringStrategies()).toHaveLength(0);
  });

  it('register with empty id throws', () => {
    expect(() => registerScoringStrategy('', () => 0)).toThrow(/empty/);
    expect(() => registerScoringStrategy('   ', () => 0)).toThrow(/empty/);
  });

  it('register with non-function throws', () => {
    // @ts-expect-error - testing runtime guard
    expect(() => registerScoringStrategy('bad', 'not a function')).toThrow(/must be a function/);
  });

  it('re-registering same id overwrites', () => {
    const a: ScoringFunction = () => 0.1;
    const b: ScoringFunction = () => 0.9;
    registerScoringStrategy('mut', a);
    registerScoringStrategy('mut', b);
    expect(getScoringStrategy('mut')).toBe(b);
  });
});
