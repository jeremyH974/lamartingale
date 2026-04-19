import { createAnthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';

// Workaround : @ai-sdk/anthropic 3.0.69 pointe sur api.anthropic.com/messages
// (404), il faut forcer /v1/messages via un client explicite.
const anthropic = createAnthropic({
  baseURL: 'https://api.anthropic.com/v1',
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ============================================================================
// Provider LLM centralisé — Anthropic Claude principal, OpenAI fallback.
// Ne JAMAIS importer @ai-sdk/anthropic ou @ai-sdk/openai ailleurs pour de la
// génération texte. Les embeddings restent via le module embeddings.ts
// (openai text-embedding-3-large — pas d'équivalent Anthropic).
// ============================================================================

export type LLMProvider = 'anthropic' | 'openai';

export function getActiveProvider(): LLMProvider {
  return process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai';
}

// Modèle principal — RAG, chat, raisonnement structuré.
export function getLLM() {
  if (process.env.ANTHROPIC_API_KEY) {
    return anthropic('claude-sonnet-4-6');
  }
  return openai('gpt-4o-mini');
}

// Modèle rapide — extraction, classification, taxonomie, enrichissement batch.
export function getLLMFast() {
  if (process.env.ANTHROPIC_API_KEY) {
    return anthropic('claude-haiku-4-5-20251001');
  }
  return openai('gpt-4o-mini');
}

// Identifiant lisible du modèle actif — pour logs / réponses API.
export function getModelId(which: 'main' | 'fast' = 'main'): string {
  if (process.env.ANTHROPIC_API_KEY) {
    return which === 'main' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';
  }
  return 'gpt-4o-mini';
}
