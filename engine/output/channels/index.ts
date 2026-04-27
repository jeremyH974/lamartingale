// engine/output/channels/index.ts — registry channels.

import { DriveChannel } from './driveChannel';
import { LocalZipChannel } from './localZipChannel';
import type { OutputChannel } from './types';

export class ChannelRegistry {
  private readonly channels = new Map<string, OutputChannel>();

  constructor(channels?: OutputChannel[]) {
    const list = channels ?? defaultChannels();
    for (const c of list) this.channels.set(c.id, c);
  }

  get(id: string): OutputChannel {
    const c = this.channels.get(id);
    if (!c) {
      throw new Error(
        `ChannelRegistry.get: no channel registered with id "${id}". Registered: ${[...this.channels.keys()].join(', ')}`,
      );
    }
    return c;
  }

  list(): OutputChannel[] {
    return [...this.channels.values()];
  }
}

export function defaultChannels(): OutputChannel[] {
  return [new LocalZipChannel(), new DriveChannel()];
}

export { DriveChannel, LocalZipChannel };
