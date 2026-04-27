import { describe, it, expect } from 'vitest';
import { runPack, validatePackDefinition } from '@engine/pipelines/runPack';
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
      beneficiary_type: 'creator',
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
      beneficiary_type: 'creator',
    };
    expect(packDef.output_format).toBe('markdown');
    expect(packDef.steps[0].required).toBe(true);
    expect(packDef.beneficiary_type).toBe('creator');
  });
});

describe('validatePackDefinition (Engagement 3)', () => {
  const VALID: PackDefinition = {
    pack_id: 'pack-2',
    display_name: 'Pack 2',
    steps: [],
    output_format: 'markdown',
    beneficiary_type: 'creator',
  };

  it('accepts a valid pack with beneficiary_type=creator', () => {
    expect(() => validatePackDefinition(VALID)).not.toThrow();
  });

  it('throws when beneficiary_type is missing', () => {
    const { beneficiary_type, ...invalid } = VALID;
    expect(() => validatePackDefinition(invalid)).toThrow(/beneficiary_type/);
  });

  it('throws when beneficiary_type is empty string', () => {
    expect(() =>
      validatePackDefinition({ ...VALID, beneficiary_type: '' }),
    ).toThrow(/beneficiary_type/);
  });

  it('throws when beneficiary_type is whitespace-only', () => {
    expect(() =>
      validatePackDefinition({ ...VALID, beneficiary_type: '   ' }),
    ).toThrow(/beneficiary_type/);
  });

  it('throws when beneficiary_type is non-string', () => {
    expect(() =>
      validatePackDefinition({ ...VALID, beneficiary_type: 42 as unknown as string }),
    ).toThrow(/beneficiary_type/);
  });

  it('accepts non-pilot beneficiary_type values (extensibility)', () => {
    expect(() =>
      validatePackDefinition({ ...VALID, beneficiary_type: 'audience' }),
    ).not.toThrow();
    expect(() =>
      validatePackDefinition({ ...VALID, beneficiary_type: 'sponsor' }),
    ).not.toThrow();
  });

  it('throws when pack_id is missing', () => {
    const { pack_id, ...invalid } = VALID;
    expect(() => validatePackDefinition(invalid)).toThrow(/pack_id/);
  });

  it('throws when display_name is missing', () => {
    const { display_name, ...invalid } = VALID;
    expect(() => validatePackDefinition(invalid)).toThrow(/display_name/);
  });

  it('throws when steps is not an array', () => {
    expect(() =>
      validatePackDefinition({ ...VALID, steps: 'not-array' as unknown as [] }),
    ).toThrow(/steps/);
  });

  it('throws on null/non-object input', () => {
    expect(() => validatePackDefinition(null)).toThrow();
    expect(() => validatePackDefinition('string')).toThrow();
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
