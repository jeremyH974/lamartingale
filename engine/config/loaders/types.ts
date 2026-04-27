// engine/config/loaders/types.ts — interface ConfigLoader (Décision 3).
//
// V1 : FileLoader unique (lit clients/*.config.ts via dynamic import).
// V2 : DbLoader / ApiLoader pourront être ajoutés sans modifier les
// consommateurs (le registry route par `source`).

import type { ClientConfig } from '../../types/client-config';

export interface ConfigLoader {
  readonly source: 'file' | 'db' | 'api';

  /** Charge la config d'un client par identifiant. */
  loadClientConfig(clientId: string): Promise<ClientConfig>;

  /** Liste les client_id découvrables par cette source. */
  listClients(): Promise<string[]>;
}
