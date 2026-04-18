import type { PodcastConfig } from './podcast.config';
import { lamartingaleConfig } from './lamartingale.config';

// Registry des configs disponibles. Ajouter un nouveau podcast =
// importer sa config ici + enregistrer l'entrée.
const REGISTRY: Record<string, PodcastConfig> = {
  lamartingale: lamartingaleConfig,
};

// Ajout paresseux pour les podcasts suivants (évite les imports circulaires
// ou les fichiers manquants en dev). Enregistrer via registerConfig().
export function registerConfig(c: PodcastConfig): void {
  REGISTRY[c.id] = c;
}

export function listConfigs(): string[] {
  return Object.keys(REGISTRY);
}

function resolveConfig(): PodcastConfig {
  const id = (process.env.PODCAST_ID || 'lamartingale').trim().toLowerCase();
  const cfg = REGISTRY[id];
  if (!cfg) {
    const known = Object.keys(REGISTRY).join(', ') || '(none)';
    throw new Error(
      `[config] Unknown PODCAST_ID="${id}". Known: ${known}. ` +
      `Register via src/config/index.ts → REGISTRY.`,
    );
  }
  return cfg;
}

let _config: PodcastConfig | null = null;

// Lazy getter — permet à un script d'appeler registerConfig() avant
// que le cache soit figé.
export function getConfig(): PodcastConfig {
  if (!_config) _config = resolveConfig();
  return _config;
}

// Pour les tests : forcer une config sans repasser par l'env.
export function _setConfigForTest(c: PodcastConfig): void {
  _config = c;
}

export type { PodcastConfig, TaxonomyPillar, PublicPodcastConfig } from './podcast.config';
export { toPublicConfig } from './podcast.config';
