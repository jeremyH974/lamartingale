// engine/output/produceClientPack.ts — fonction core unifiée (Décision 4).
//
// Phase 7a : sépare clairement la logique pack-production (réutilisable depuis
// CLI, API, tests) de l'invocation. La fonction prend un ClientConfig et un
// fournisseur de Livrables (Map slug → Livrable[]), passe les livrables aux
// formatters via le dispatcher, puis publie via un channel. Tout est injecté.
// Pas d'état global, pas de lecture FS implicite — la fonction est pure
// vis-à-vis des inputs.

import type { ClientConfig } from '../types/client-config';
import { ChannelRegistry } from './channels';
import type { ChannelConfig } from './channels/types';
import { FormatDispatcher } from './formats/dispatcher';
import type {
  FormatterContext,
  FormatterOutput,
  Livrable,
  ProductionEpisode,
  ProductionPack,
} from './types';

export interface ProduceClientPackOptions {
  packId: string;
  /** Liste des épisodes à produire — 1 entrée par épisode avec ses livrables. */
  episodes: ProductionEpisode[];
  /** Override du channel (défaut: clientConfig.output_channel ou 'local-zip'). */
  channelId?: string;
  channelConfig?: ChannelConfig;
  /** Override du formatter context (brand, etc). */
  formatterContextOverride?: Partial<FormatterContext>;
  /** Date de génération forcée (défaut: now). Utile pour tests reproductibles. */
  generatedAt?: string;
  /** Dispatcher injectable (tests). */
  dispatcher?: FormatDispatcher;
  /** ChannelRegistry injectable (tests). */
  channelRegistry?: ChannelRegistry;
}

export interface ProduceClientPackResult {
  pack: ProductionPack;
  files: Map<string, FormatterOutput[]>;
  publishLocation: string;
  publishMetadata?: Record<string, unknown>;
}

export async function produceClientPack(
  clientConfig: ClientConfig,
  options: ProduceClientPackOptions,
): Promise<ProduceClientPackResult> {
  if (!clientConfig.output_formats) {
    throw new Error(
      `produceClientPack: client "${clientConfig.client_id}" has no output_formats configured. ` +
        `Add output_formats to clients/${clientConfig.client_id}.config.ts.`,
    );
  }

  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const dispatcher = options.dispatcher ?? new FormatDispatcher();
  const registry = options.channelRegistry ?? new ChannelRegistry();
  const channelId = options.channelId ?? clientConfig.output_channel ?? 'local-zip';

  const context: FormatterContext = {
    clientId: clientConfig.client_id,
    clientDisplayName: clientConfig.display_name,
    generatedAt,
    ...options.formatterContextOverride,
  };

  const pack: ProductionPack = {
    clientId: clientConfig.client_id,
    packId: options.packId,
    generatedAt,
    episodes: options.episodes,
  };

  const files = new Map<string, FormatterOutput[]>();
  for (const ep of options.episodes) {
    const epFiles: FormatterOutput[] = [];
    for (const liv of ep.livrables) {
      const out = await dispatcher.dispatch(liv, clientConfig.output_formats, context);
      epFiles.push(out);
    }
    files.set(ep.slug, epFiles);
  }

  const channel = registry.get(channelId);
  const result = await channel.publish(pack, files, options.channelConfig ?? {});

  return {
    pack,
    files,
    publishLocation: result.location,
    publishMetadata: result.metadata,
  };
}

/**
 * Helper de typing : factory pour ProductionEpisode.
 */
export function buildEpisode(
  slug: string,
  displayRef: string,
  livrables: Livrable[],
): ProductionEpisode {
  return { slug, displayRef, livrables };
}
