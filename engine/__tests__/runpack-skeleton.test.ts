import { describe, it, expect } from 'vitest';
import { runPack } from '@engine/pipelines/runPack';
import type { PackDefinition, AgentRegistry } from '@engine/pipelines/runPack';
import { renderPackToMarkdown } from '@engine/pipelines/renderer';
import { stefaniOrsoConfig } from '../../clients/stefani-orso.config';

// Tests squelette — vérifient que runPack et renderPackToMarkdown
// throw explicitement "not implemented yet" tant que les agents n'existent
// pas. Une fois implémentés (lundi-mardi), ces tests seront remplacés par
// des cas réels.

describe('runPack skeleton', () => {
  it('throws "not implemented" until agents land', async () => {
    const packDef: PackDefinition = {
      pack_id: 'pack-1',
      display_name: 'Test pack',
      steps: [],
      output_format: 'markdown',
    };
    const registry: AgentRegistry = { get: () => null };

    await expect(
      runPack(packDef, 'source-test', stefaniOrsoConfig, registry),
    ).rejects.toThrow(/not implemented/i);
  });

  it('PackDefinition output_format type accepts markdown', () => {
    const packDef: PackDefinition = {
      pack_id: 'pack-2',
      display_name: 'Markdown pack',
      steps: [
        { step_id: 's1', agent_id: 'a1', required: true },
      ],
      output_format: 'markdown',
    };
    expect(packDef.output_format).toBe('markdown');
    expect(packDef.steps[0].required).toBe(true);
  });
});

describe('renderPackToMarkdown skeleton', () => {
  it('throws "not implemented" until first PackOutput produced', () => {
    const fakeOutput = {
      pack_id: 'pack-1',
      client_id: 'stefani-orso',
      source_id: 'src-1',
      generated_at: new Date().toISOString(),
      steps_results: [],
      metadata: {
        pack_display_name: 'x',
        output_format: 'markdown' as const,
        total_duration_ms: 0,
        total_cost_estimate_cents: 0,
      },
    };
    expect(() => renderPackToMarkdown(fakeOutput)).toThrow(/not implemented/i);
  });
});
