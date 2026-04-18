import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getActiveProvider, getModelId } from '../ai/llm';

describe('QW-LLM — Provider routing', () => {
  const originalAnthropic = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    if (originalAnthropic) process.env.ANTHROPIC_API_KEY = originalAnthropic;
    else delete process.env.ANTHROPIC_API_KEY;
  });

  it('1. routes to anthropic when ANTHROPIC_API_KEY is set', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    expect(getActiveProvider()).toBe('anthropic');
    expect(getModelId('main')).toBe('claude-sonnet-4-6');
    expect(getModelId('fast')).toBe('claude-haiku-4-5-20251001');
  });

  it('2. falls back to openai when ANTHROPIC_API_KEY is absent', () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(getActiveProvider()).toBe('openai');
    expect(getModelId('main')).toBe('gpt-4o-mini');
    expect(getModelId('fast')).toBe('gpt-4o-mini');
  });

  it('3. getModelId defaults to main when called without arg', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    expect(getModelId()).toBe('claude-sonnet-4-6');
  });
});
