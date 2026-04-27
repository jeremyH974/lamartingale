// engine/output/channels/driveChannel.ts — placeholder V2.
//
// Phase V2 : upload pack vers un Google Drive folder partagé Stefani-Orso.
// Throw NotImplementedError pour signaler explicitement le scope V2.
//
// Décisions déférées : auth (service account vs OAuth user-delegated),
// stratégie de versioning (overwrite vs new file horodaté), notification
// post-upload (Drive comment vs email).

import { NotImplementedError, type FormatterOutput, type ProductionPack } from '../types';
import type { ChannelConfig, OutputChannel, PublishResult } from './types';

export class DriveChannel implements OutputChannel {
  readonly id = 'drive';
  readonly description = 'Upload vers Google Drive — V2, non implémenté';

  async publish(
    _pack: ProductionPack,
    _files: Map<string, FormatterOutput[]>,
    _config: ChannelConfig,
  ): Promise<PublishResult> {
    throw new NotImplementedError(
      'DriveChannel scheduled for V2 — see engine/output/channels/driveChannel.ts header',
    );
  }
}
