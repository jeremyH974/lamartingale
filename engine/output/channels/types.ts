// engine/output/channels/types.ts — interface OutputChannel (Décision 2).
//
// Un channel publie un ProductionPack (potentiellement avec ses fichiers déjà
// formatés) vers une destination (zip local, Drive distant, ...).
// V1 : LocalZipChannel uniquement. V2 : DriveChannel placeholder.

import type { FormatterOutput, ProductionPack } from '../types';

export interface OutputChannel {
  readonly id: string;
  readonly description: string;

  /**
   * Publie un pack vers la destination du channel.
   * `files` contient les FormatterOutput déjà produits par les formatters,
   * groupés par épisode slug → liste de fichiers.
   */
  publish(
    pack: ProductionPack,
    files: Map<string, FormatterOutput[]>,
    config: ChannelConfig,
  ): Promise<PublishResult>;
}

export interface ChannelConfig {
  /** Répertoire racine local pour LocalZipChannel. Ex: "output/packs/". */
  outputDir?: string;
  /** ID Drive folder pour DriveChannel V2 (placeholder). */
  driveFolderId?: string;
  /** README/index optionnel à inclure dans le ZIP. */
  readme?: string;
}

export interface PublishResult {
  success: boolean;
  /** Chemin local ou URL distante du livrable publié. */
  location: string;
  metadata?: Record<string, unknown>;
}
