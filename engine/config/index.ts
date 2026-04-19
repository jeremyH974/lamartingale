import type { PodcastConfig } from './podcast.config';
import { lamartingaleConfig } from '@instances/lamartingale.config';
import { gdiyConfig } from '@instances/gdiy.config';
import { hubConfig } from '@instances/hub.config';

// Registry des configs disponibles. Ajouter un nouveau podcast =
// importer sa config ici + enregistrer l'entrée.
const REGISTRY: Record<string, PodcastConfig> = {
  lamartingale: lamartingaleConfig,
  gdiy: gdiyConfig,
  hub: hubConfig,
};

// Ajout paresseux pour les podcasts suivants (évite les imports circulaires
// ou les fichiers manquants en dev). Enregistrer via registerConfig().
export function registerConfig(c: PodcastConfig): void {
  REGISTRY[c.id] = c;
}

export function listConfigs(): string[] {
  return Object.keys(REGISTRY);
}

function tryDynamicLoad(id: string): PodcastConfig | null {
  // Charge instances/{id}.config.ts au runtime — permet d'ajouter un
  // podcast sans modifier ce fichier (workflow CLI init).
  try {
    const path = require('path') as typeof import('path');
    const modulePath = path.resolve(__dirname, '..', '..', 'instances', `${id}.config`);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(modulePath);
    const cfg: PodcastConfig = mod.default ?? mod[`${id}Config`] ?? mod.config;
    if (cfg && cfg.id === id) {
      REGISTRY[id] = cfg;
      return cfg;
    }
    return null;
  } catch {
    return null;
  }
}

function resolveConfig(): PodcastConfig {
  const id = (process.env.PODCAST_ID || 'lamartingale').trim().toLowerCase();
  let cfg = REGISTRY[id] ?? tryDynamicLoad(id);
  if (!cfg) {
    const known = Object.keys(REGISTRY).join(', ') || '(none)';
    throw new Error(
      `[config] Unknown PODCAST_ID="${id}". Known: ${known}. ` +
      `Ajoute instances/${id}.config.ts ou enregistre via registerConfig().`,
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
