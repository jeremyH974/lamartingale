// engine/config/loaders/fileLoader.ts — V1 ConfigLoader basé fichiers.
//
// Lit `clients/<clientId>.config.ts` via dynamic import. La constante exportée
// doit suivre la convention `<camelCaseClientId>Config` (ex: stefani-orso →
// stefaniOrsoConfig). V2 (DbLoader) pourra remplacer cette source sans modifier
// les consommateurs.

import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ClientConfig } from '../../types/client-config';
import type { ConfigLoader } from './types';

export interface FileLoaderOptions {
  /** Répertoire racine des configs clients. Défaut: `clients/`. */
  clientsDir?: string;
}

export class FileLoader implements ConfigLoader {
  readonly source = 'file' as const;
  private readonly clientsDir: string;

  constructor(options: FileLoaderOptions = {}) {
    this.clientsDir = resolve(options.clientsDir ?? 'clients');
  }

  async loadClientConfig(clientId: string): Promise<ClientConfig> {
    const path = resolve(this.clientsDir, `${clientId}.config.ts`);
    // Windows absolute paths require file:// URL for dynamic import in ESM mode.
    const importTarget = pathToFileURL(path).href;
    const mod = (await import(importTarget)) as Record<string, unknown>;
    const exportName = `${toCamelCase(clientId)}Config`;
    const cfg = mod[exportName] as ClientConfig | undefined;
    if (!cfg) {
      throw new Error(
        `FileLoader: ${path} does not export "${exportName}". Found exports: ${Object.keys(mod).join(', ')}`,
      );
    }
    return cfg;
  }

  async listClients(): Promise<string[]> {
    const entries = readdirSync(this.clientsDir);
    return entries
      .filter((f) => f.endsWith('.config.ts'))
      .map((f) => f.replace(/\.config\.ts$/, ''));
  }
}

function toCamelCase(id: string): string {
  return id.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}
