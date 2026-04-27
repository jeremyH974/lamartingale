// engine/output/channels/localZipChannel.ts — V1 unique implémentation OutputChannel.
//
// Produit un .zip dans `output/packs/{client}-{date}.zip` (ou
// `config.outputDir`) contenant 1 dossier par épisode + un README global.

import archiver from 'archiver';
import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { FormatterOutput, ProductionPack } from '../types';
import type { ChannelConfig, OutputChannel, PublishResult } from './types';

export class LocalZipChannel implements OutputChannel {
  readonly id = 'local-zip';
  readonly description = 'Génère un .zip local avec un dossier par épisode + README';

  async publish(
    pack: ProductionPack,
    files: Map<string, FormatterOutput[]>,
    config: ChannelConfig,
  ): Promise<PublishResult> {
    const outputDir = resolve(config.outputDir ?? 'output/packs');
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

    const datePart = pack.generatedAt.slice(0, 10); // YYYY-MM-DD
    const zipPath = join(outputDir, `${pack.clientId}-${pack.packId}-${datePart}.zip`);

    await new Promise<void>((res, rej) => {
      const stream = createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('error', rej);
      stream.on('close', () => res());
      archive.pipe(stream);

      for (const ep of pack.episodes) {
        const folder = ep.slug;
        const epFiles = files.get(ep.slug) ?? [];
        for (const f of epFiles) {
          archive.append(f.buffer, { name: `${folder}/${f.filename}` });
        }
      }
      if (config.readme) {
        archive.append(config.readme, { name: 'README.md' });
      }
      archive.finalize();
    });

    return {
      success: true,
      location: zipPath,
      metadata: {
        episodes: pack.episodes.length,
        totalFiles: [...files.values()].reduce((acc, arr) => acc + arr.length, 0),
      },
    };
  }
}
