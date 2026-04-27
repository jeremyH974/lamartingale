// engine/config/loaders/index.ts — registry ConfigLoader.

import { FileLoader } from './fileLoader';
import type { ConfigLoader } from './types';

export class ConfigLoaderRegistry {
  private readonly loaders = new Map<string, ConfigLoader>();

  constructor(loaders?: ConfigLoader[]) {
    const list = loaders ?? defaultLoaders();
    for (const l of list) this.loaders.set(l.source, l);
  }

  get(source: 'file' | 'db' | 'api'): ConfigLoader {
    const l = this.loaders.get(source);
    if (!l) {
      throw new Error(
        `ConfigLoaderRegistry.get: no loader for source "${source}". Registered: ${[...this.loaders.keys()].join(', ')}`,
      );
    }
    return l;
  }
}

export function defaultLoaders(): ConfigLoader[] {
  return [new FileLoader()];
}

export { FileLoader };
