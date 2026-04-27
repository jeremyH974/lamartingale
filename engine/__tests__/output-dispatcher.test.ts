import { describe, expect, it } from 'vitest';
import { ChannelRegistry, DriveChannel, LocalZipChannel } from '../output/channels';
import { defaultFormatters, FormatDispatcher } from '../output/formats/dispatcher';
import { ConfigLoaderRegistry, FileLoader } from '../config/loaders';
import {
  NotImplementedError,
  type FormatterContext,
  type Livrable,
  type ProductionPack,
} from '../output/types';

const CTX: FormatterContext = {
  clientId: 'test',
  clientDisplayName: 'Test client',
  generatedAt: '2026-04-30T18:00:00.000Z',
};

const SAMPLE_KEY_MOMENTS: Livrable = {
  type: 'L1_keyMoments',
  title: 'Sample',
  episodeRef: '#1',
  moments: [
    {
      numero: 1,
      titre: 'Test',
      timestampStart: '00:01',
      timestampEnd: '00:30',
      saliency: 0.8,
      quote: 'A quote',
      pourquoi: 'Because',
    },
  ],
};

describe('FormatDispatcher — Phase 7a', () => {
  it('routes livrable to docx formatter according to config', async () => {
    const dispatcher = new FormatDispatcher();
    const livrable: Livrable = {
      type: 'L4_newsletter',
      title: 'X',
      episodeRef: '#1',
      newsletterTitle: 'Title',
      sections: [['Para 1.']],
    };
    const out = await dispatcher.dispatch(livrable, { L4_newsletter: 'docx' }, CTX);
    expect(out.filename).toBe('04-newsletter.docx');
  });

  it('routes livrable to xlsx formatter according to config', async () => {
    const dispatcher = new FormatDispatcher();
    const out = await dispatcher.dispatch(SAMPLE_KEY_MOMENTS, { L1_keyMoments: 'xlsx' }, CTX);
    expect(out.filename).toBe('01-key-moments.xlsx');
  });

  it('throws when no format is configured for a livrable type', async () => {
    const dispatcher = new FormatDispatcher();
    await expect(
      dispatcher.dispatch(SAMPLE_KEY_MOMENTS, {}, CTX),
    ).rejects.toThrow(/no format configured/);
  });

  it('throws when format does not support livrable type', async () => {
    const dispatcher = new FormatDispatcher();
    await expect(
      dispatcher.dispatch(SAMPLE_KEY_MOMENTS, { L1_keyMoments: 'docx' }, CTX),
    ).rejects.toThrow(/does not support/);
  });

  it('throws NotImplementedError for pdf format', async () => {
    const dispatcher = new FormatDispatcher();
    await expect(
      dispatcher.dispatch(SAMPLE_KEY_MOMENTS, { L1_keyMoments: 'pdf' }, CTX),
    ).rejects.toThrow(NotImplementedError);
  });

  it('exposes registered formats', () => {
    const dispatcher = new FormatDispatcher(defaultFormatters());
    const formats = dispatcher.registeredFormats().sort();
    expect(formats).toEqual(['docx', 'markdown', 'pdf', 'xlsx']);
  });
});

describe('ChannelRegistry — Phase 7a', () => {
  it('exposes local-zip and drive channels by default', () => {
    const reg = new ChannelRegistry();
    expect(reg.get('local-zip')).toBeInstanceOf(LocalZipChannel);
    expect(reg.get('drive')).toBeInstanceOf(DriveChannel);
  });

  it('throws when channel id is unknown', () => {
    const reg = new ChannelRegistry();
    expect(() => reg.get('nonexistent')).toThrow(/no channel registered/);
  });

  it('drive channel throws NotImplementedError on publish (V2 placeholder)', async () => {
    const channel = new DriveChannel();
    const pack: ProductionPack = {
      clientId: 'test',
      packId: 'p',
      generatedAt: CTX.generatedAt,
      episodes: [],
    };
    await expect(channel.publish(pack, new Map(), {})).rejects.toThrow(NotImplementedError);
  });
});

describe('ConfigLoaderRegistry — Phase 7a', () => {
  it('exposes file loader by default and lists clients dir', async () => {
    const reg = new ConfigLoaderRegistry();
    const loader = reg.get('file');
    expect(loader).toBeInstanceOf(FileLoader);
    const clients = await loader.listClients();
    expect(clients).toContain('stefani-orso');
  });

  it('throws when source is unknown', () => {
    const reg = new ConfigLoaderRegistry();
    expect(() => reg.get('db')).toThrow(/no loader for source/);
  });
});
