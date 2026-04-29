import { describe, it, expect, vi } from 'vitest';
import {
  runPack,
  createMapAgentRegistry,
  validatePackDefinition,
  type AgentFn,
  type PackDefinition,
} from '../pipelines/runPack';
import type { ClientConfig } from '../types/client-config';

// Test fixtures — ClientConfig minimal valide pour runPack.
// On ne touche pas la définition de ClientConfig, on construit juste
// un objet conforme aux champs qu'utilise runPack (en pratique : aucun,
// runPack ne lit pas les champs ClientConfig — il les transmet aux agents).
function mkClient(id = 'client-test'): ClientConfig {
  return {
    client_id: id,
    display_name: id,
    tenants: [],
    tone_profile: { description: '', forbidden_patterns: [], style_examples: [] },
    lenses: [],
    sensitive_topics: [],
    active_packs: [],
    notification_email: 'test@example.com',
  };
}

function mkPack(steps: PackDefinition['steps']): PackDefinition {
  return {
    pack_id: 'pack-test',
    display_name: 'Test Pack',
    steps,
    output_format: 'markdown',
    beneficiary_type: 'creator',
  };
}

const fixedNow = () => '2026-04-29T13:00:00.000Z';

describe('runPack — orchestration', () => {
  it('runs all steps successfully when all agents present', async () => {
    const a: AgentFn = vi.fn(async () => ({ output: 'A out', cost_estimate_cents: 10 }));
    const b: AgentFn = vi.fn(async () => ({ output: 'B out', cost_estimate_cents: 5 }));
    const registry = createMapAgentRegistry(new Map([
      ['agent-a', a],
      ['agent-b', b],
    ]));
    const pack = mkPack([
      { step_id: 's1', agent_id: 'agent-a', required: true },
      { step_id: 's2', agent_id: 'agent-b', required: true },
    ]);

    const out = await runPack(pack, 'src-1', mkClient(), registry, { now: fixedNow });

    expect(out.steps_results).toHaveLength(2);
    expect(out.steps_results[0]!.status).toBe('success');
    expect(out.steps_results[0]!.output).toBe('A out');
    expect(out.steps_results[1]!.status).toBe('success');
    expect(out.metadata.total_cost_estimate_cents).toBe(15);
    expect(out.client_id).toBe('client-test');
    expect(out.source_id).toBe('src-1');
    expect(out.generated_at).toBe('2026-04-29T13:00:00.000Z');
  });

  it('passes prior outputs to downstream agents under their step_id', async () => {
    const a: AgentFn = async () => ({ output: { moments: ['m1', 'm2'] } });
    const b: AgentFn = vi.fn(async (ctx) => {
      // Agent b consomme la sortie de l'étape s1 sous prior['s1']
      const fromA = ctx.prior['s1'] as { moments: string[] };
      return { output: { count: fromA.moments.length } };
    });
    const registry = createMapAgentRegistry(new Map([
      ['agent-a', a],
      ['agent-b', b],
    ]));
    const pack = mkPack([
      { step_id: 's1', agent_id: 'agent-a', required: true },
      { step_id: 's2', agent_id: 'agent-b', required: true },
    ]);

    const out = await runPack(pack, 'src-1', mkClient(), registry, { now: fixedNow });
    expect(out.steps_results[1]!.output).toEqual({ count: 2 });
    expect(b).toHaveBeenCalledOnce();
  });

  it('skips a non-required step when its agent is not in the registry', async () => {
    const a: AgentFn = async () => ({ output: 'ok' });
    const registry = createMapAgentRegistry(new Map([['agent-a', a]]));
    const pack = mkPack([
      { step_id: 's1', agent_id: 'agent-a', required: true },
      { step_id: 's2', agent_id: 'agent-missing', required: false },
    ]);

    const out = await runPack(pack, 'src-1', mkClient(), registry, { now: fixedNow });
    expect(out.steps_results).toHaveLength(2);
    expect(out.steps_results[0]!.status).toBe('success');
    expect(out.steps_results[1]!.status).toBe('skipped');
    expect(out.steps_results[1]!.error).toBe('agent_not_registered');
  });

  it('stops the pack and marks failed when a required agent is not in the registry', async () => {
    const c: AgentFn = vi.fn(async () => ({ output: 'never' }));
    const registry = createMapAgentRegistry(new Map([['agent-c', c]]));
    const pack = mkPack([
      { step_id: 's1', agent_id: 'agent-missing', required: true },
      { step_id: 's2', agent_id: 'agent-c', required: true },
    ]);

    const out = await runPack(pack, 'src-1', mkClient(), registry, { now: fixedNow });
    // Une seule entrée : la step required+missing → failed, puis break.
    expect(out.steps_results).toHaveLength(1);
    expect(out.steps_results[0]!.status).toBe('failed');
    expect(out.steps_results[0]!.error).toMatch(/agent_not_found/);
    expect(c).not.toHaveBeenCalled();
  });

  it('captures agent exceptions as failed StepResult and stops if required', async () => {
    const a: AgentFn = async () => { throw new Error('boom'); };
    const b: AgentFn = vi.fn(async () => ({ output: 'never' }));
    const registry = createMapAgentRegistry(new Map([
      ['agent-a', a],
      ['agent-b', b],
    ]));
    const pack = mkPack([
      { step_id: 's1', agent_id: 'agent-a', required: true },
      { step_id: 's2', agent_id: 'agent-b', required: true },
    ]);

    const out = await runPack(pack, 'src-1', mkClient(), registry, { now: fixedNow });
    expect(out.steps_results).toHaveLength(1);
    expect(out.steps_results[0]!.status).toBe('failed');
    expect(out.steps_results[0]!.error).toBe('boom');
    expect(b).not.toHaveBeenCalled();
  });

  it('continues after a non-required failure', async () => {
    const a: AgentFn = async () => { throw new Error('soft fail'); };
    const b: AgentFn = vi.fn(async () => ({ output: 'B ran' }));
    const registry = createMapAgentRegistry(new Map([
      ['agent-a', a],
      ['agent-b', b],
    ]));
    const pack = mkPack([
      { step_id: 's1', agent_id: 'agent-a', required: false },
      { step_id: 's2', agent_id: 'agent-b', required: true },
    ]);

    const out = await runPack(pack, 'src-1', mkClient(), registry, { now: fixedNow });
    expect(out.steps_results).toHaveLength(2);
    expect(out.steps_results[0]!.status).toBe('failed');
    expect(out.steps_results[1]!.status).toBe('success');
  });

  it('respects budgetCapCents — skips remaining steps once cumulative cost exceeds cap', async () => {
    const a: AgentFn = async () => ({ output: 'a', cost_estimate_cents: 60 });
    const b: AgentFn = async () => ({ output: 'b', cost_estimate_cents: 60 });
    const c: AgentFn = vi.fn(async () => ({ output: 'c' }));
    const registry = createMapAgentRegistry(new Map([
      ['agent-a', a],
      ['agent-b', b],
      ['agent-c', c],
    ]));
    const pack = mkPack([
      { step_id: 's1', agent_id: 'agent-a', required: true },
      { step_id: 's2', agent_id: 'agent-b', required: true },
      { step_id: 's3', agent_id: 'agent-c', required: true },
    ]);

    const out = await runPack(pack, 'src-1', mkClient(), registry, {
      now: fixedNow,
      budgetCapCents: 100, // a=60 + b=60 = 120 > 100 → skip c
    });

    expect(out.steps_results[0]!.status).toBe('success'); // s1 = 60c
    expect(out.steps_results[1]!.status).toBe('success'); // s2 = 120c (cap dépassé après)
    expect(out.steps_results[2]!.status).toBe('skipped'); // s3 = budget_cap_reached
    expect(out.steps_results[2]!.error).toBe('budget_cap_reached');
    expect(c).not.toHaveBeenCalled();
    expect(out.metadata.total_cost_estimate_cents).toBe(120);
  });

  it('passes config_overrides to agents', async () => {
    const captured: unknown[] = [];
    const a: AgentFn = async (ctx) => {
      captured.push(ctx.configOverrides);
      return { output: null };
    };
    const registry = createMapAgentRegistry(new Map([['agent-a', a]]));
    const pack = mkPack([
      { step_id: 's1', agent_id: 'agent-a', required: true, config_overrides: { temperature: 0.2 } },
    ]);

    await runPack(pack, 'src-1', mkClient(), registry, { now: fixedNow });
    expect(captured[0]).toEqual({ temperature: 0.2 });
  });

  it('records duration_ms and total_duration_ms', async () => {
    const a: AgentFn = async () => {
      await new Promise((r) => setTimeout(r, 10));
      return { output: null };
    };
    const registry = createMapAgentRegistry(new Map([['agent-a', a]]));
    const pack = mkPack([
      { step_id: 's1', agent_id: 'agent-a', required: true },
    ]);
    const out = await runPack(pack, 'src-1', mkClient(), registry, { now: fixedNow });
    expect(out.steps_results[0]!.duration_ms).toBeGreaterThanOrEqual(10);
    expect(out.metadata.total_duration_ms).toBeGreaterThanOrEqual(10);
  });
});

describe('validatePackDefinition — runtime checks', () => {
  const valid: PackDefinition = {
    pack_id: 'p1',
    display_name: 'P1',
    steps: [{ step_id: 's1', agent_id: 'a1', required: true }],
    output_format: 'markdown',
    beneficiary_type: 'creator',
  };

  it('passes a valid pack', () => {
    expect(() => validatePackDefinition(valid)).not.toThrow();
  });

  it('throws when packDef is null', () => {
    expect(() => validatePackDefinition(null)).toThrow(/must be an object/);
  });

  it('throws when pack_id missing', () => {
    expect(() => validatePackDefinition({ ...valid, pack_id: '' })).toThrow(/pack_id/);
  });

  it('throws when display_name missing', () => {
    expect(() => validatePackDefinition({ ...valid, display_name: '   ' })).toThrow(/display_name/);
  });

  it('throws when steps is not an array', () => {
    expect(() => validatePackDefinition({ ...valid, steps: 'not array' })).toThrow(/steps/);
  });

  it('throws when a step is missing step_id', () => {
    expect(() => validatePackDefinition({
      ...valid,
      steps: [{ step_id: '', agent_id: 'a1', required: true }],
    })).toThrow(/step_id/);
  });

  it('throws when a step is missing agent_id', () => {
    expect(() => validatePackDefinition({
      ...valid,
      steps: [{ step_id: 's1', agent_id: '', required: true }],
    })).toThrow(/agent_id/);
  });

  it('throws when a step is missing required flag', () => {
    expect(() => validatePackDefinition({
      ...valid,
      steps: [{ step_id: 's1', agent_id: 'a1' } as any],
    })).toThrow(/required/);
  });

  it('throws when output_format missing', () => {
    expect(() => validatePackDefinition({ ...valid, output_format: '' })).toThrow(/output_format/);
  });

  it('throws when beneficiary_type missing', () => {
    expect(() => validatePackDefinition({ ...valid, beneficiary_type: '' })).toThrow(/beneficiary_type/);
  });
});

// Integration smoke test : 2 packs déclaratifs (R7 — patterns réutilisables).
//
// Ces packs reproduisent le pattern phase6-runner.ts (orchestration L1-L5)
// SANS appeler les vraies primitives Sonnet (cap LLM 0$ pour T2.2).
// Quand les wrappers d'agents seront branchés, le caller fera juste :
//   const registry = createMapAgentRegistry(new Map([
//     ['extract-key-moments', wrapPrimitive(extractKeyMoments)],
//     ...
//   ]));
//   const out = await runPack(packStefaniL1L5, episodeId, stefaniConfig, registry);
describe('runPack — packs déclaratifs (smoke)', () => {
  it('pack-key-moments-only : 1-step minimal', async () => {
    const fakeKM: AgentFn = async () => ({
      output: { moments: [{ title: 'm1', hook: 'h1' }] },
      cost_estimate_cents: 15,
    });
    const registry = createMapAgentRegistry(new Map([['extract-key-moments', fakeKM]]));
    const pack: PackDefinition = {
      pack_id: 'pack-key-moments-only',
      display_name: 'Key Moments Only',
      output_format: 'markdown',
      beneficiary_type: 'creator',
      steps: [
        { step_id: 'L1', agent_id: 'extract-key-moments', required: true },
      ],
    };

    const out = await runPack(pack, 'ep-123', mkClient(), registry, { now: fixedNow });
    expect(out.steps_results).toHaveLength(1);
    expect(out.steps_results[0]!.status).toBe('success');
    expect(out.metadata.total_cost_estimate_cents).toBe(15);
  });

  it('pack-stefani-l1-l5 : 5-step full pipeline (mocked agents)', async () => {
    const callOrder: string[] = [];
    const stub = (name: string): AgentFn => async (ctx) => {
      callOrder.push(name);
      // Vérifie que les agents avals voient les outputs amont
      if (name === 'L4' || name === 'L5') {
        expect(ctx.prior['L1']).toBeDefined();
        expect(ctx.prior['L2']).toBeDefined();
        expect(ctx.prior['L3']).toBeDefined();
      }
      return { output: { name }, cost_estimate_cents: 20 };
    };
    const registry = createMapAgentRegistry(new Map([
      ['extract-key-moments', stub('L1')],
      ['extract-quotes', stub('L2')],
      ['cross-reference-episode', stub('L3')],
      ['build-newsletter', stub('L4')],
      ['build-brief-annexe', stub('L5')],
    ]));
    const pack: PackDefinition = {
      pack_id: 'pack-stefani-l1-l5',
      display_name: 'Stefani-Orso 5 livrables',
      output_format: 'markdown',
      beneficiary_type: 'creator',
      steps: [
        { step_id: 'L1', agent_id: 'extract-key-moments', required: true },
        { step_id: 'L2', agent_id: 'extract-quotes', required: true },
        { step_id: 'L3', agent_id: 'cross-reference-episode', required: true },
        { step_id: 'L4', agent_id: 'build-newsletter', required: true },
        { step_id: 'L5', agent_id: 'build-brief-annexe', required: true },
      ],
    };

    const out = await runPack(pack, 'ep-123', mkClient(), registry, { now: fixedNow });
    expect(out.steps_results).toHaveLength(5);
    expect(out.steps_results.every((s) => s.status === 'success')).toBe(true);
    expect(callOrder).toEqual(['L1', 'L2', 'L3', 'L4', 'L5']); // ordre séquentiel respecté
    expect(out.metadata.total_cost_estimate_cents).toBe(100);
  });
});
