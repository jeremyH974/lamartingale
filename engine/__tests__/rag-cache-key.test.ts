/**
 * Tests pure fn `ragCacheKey()` (engine/ai/rag.ts).
 *
 * Couvre les invariants nécessaires pour que le cache wrapper de ragQuery()
 * (`engine/cache.ts::getCached`) ne crée pas de miss inutile sur des
 * variations triviales (case, espaces) ni de collision entre questions
 * sémantiquement différentes.
 */

import { describe, it, expect } from 'vitest';
import { ragCacheKey } from '../ai/rag';

describe('ragCacheKey — pure fn cache key derivation', () => {
  it('1. déterminisme : même question → même clé', () => {
    const k1 = ragCacheKey('Quels épisodes parlent de SCPI ?');
    const k2 = ragCacheKey('Quels épisodes parlent de SCPI ?');
    expect(k1).toBe(k2);
  });

  it('2. normalisation lowercase : "Le PER" et "le per" → même clé', () => {
    expect(ragCacheKey('Le PER')).toBe(ragCacheKey('le per'));
  });

  it('3. normalisation trim : "  PER ?  " et "PER ?" → même clé', () => {
    expect(ragCacheKey('  PER ?  ')).toBe(ragCacheKey('PER ?'));
  });

  it('4. différence : questions différentes → clés différentes', () => {
    const k1 = ragCacheKey('Quels épisodes parlent de SCPI ?');
    const k2 = ragCacheKey('Quels épisodes parlent de bourse ?');
    expect(k1).not.toBe(k2);
  });

  it('5. format clé : prefix rag:query: + sha256 hex 32 chars', () => {
    const k = ragCacheKey('test question');
    expect(k).toMatch(/^rag:query:[0-9a-f]{32}$/);
  });
});
