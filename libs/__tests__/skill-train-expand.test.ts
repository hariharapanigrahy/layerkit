import { describe, expect, it } from 'vitest';
import {
  ARTIFACT_PRESETS,
  defaultPipelineStep,
  expandRun,
  expandSkillScenario,
  type CompactSkillScenario,
} from '../../evals/skill-train/expand.js';

describe('skill-train expand', () => {
  it('builds default pipeline steps with surfaces special-case', () => {
    const s = defaultPipelineStep('demo', 'surfaces');
    expect(s.skill).toBe('layerkit-inventory-surfaces');
    expect(s.sources?.[0]?.url).toBe('file://package');
    const r = defaultPipelineStep('demo', 'research');
    expect(r.claim).toMatch(/docs\.example\.com/);
  });

  it('expands compact run from required pipeline + overrides', () => {
    const run = expandRun(
      'invent-field-blocked',
      ['discover', 'surfaces', 'research', 'author', 'handoff'],
      {
        id: 'bad',
        expectPass: false,
        stepOverrides: { author: { invent: true } },
        artifactsPreset: 'good-pr',
        artifacts: { mapFields: [{ domain: 'a', vendor: 'invent_x' }] },
      },
    );
    expect(run.transcript.steps).toHaveLength(5);
    expect(run.transcript.steps.find((s) => s.pipelineStep === 'author')?.invent).toBe(true);
    expect(run.artifacts?.mapFields?.[0]?.vendor).toBe('invent_x');
    expect(run.artifacts?.prUrl).toBe(ARTIFACT_PRESETS['good-pr'].prUrl);
  });

  it('supports absolute steps for incomplete bad pipelines', () => {
    const run = expandRun('partial', ['discover', 'surfaces', 'handoff'], {
      id: 'bad-partial',
      expectPass: false,
      steps: [
        { action: 'surfaces', pipelineStep: 'surfaces' },
        { action: 'research', pipelineStep: 'research' },
      ],
      artifactsPreset: 'store-only-map',
    });
    expect(run.transcript.steps.map((s) => s.pipelineStep)).toEqual(['surfaces', 'research']);
    expect(run.artifacts?.prUrl).toBeUndefined();
  });

  it('expands a full compact scenario with good+bad runs', () => {
    const raw: CompactSkillScenario = {
      id: 'demo-scenario',
      title: 'demo',
      userIntent: 'layerkit: heal acme',
      mode: 'heal',
      vendor: 'acme',
      trains: ['demo'],
      skillText: {
        skillsUnderTest: ['layerkit-orchestrate-integration'],
        mustMatch: ['pipeline'],
        mustNotMatch: [],
      },
      runGold: {
        mustCiteHosts: ['docs.example.com'],
        requiredPipelineSteps: ['discover', 'surfaces', 'research', 'handoff'],
        mapFieldsMin: 0,
        forbidInventFieldPaths: true,
        forbidStoreOnlyHandoff: true,
        requirePrUrl: true,
        allowResidualNoPr: false,
      },
      runs: [
        { id: 'good', expectPass: true, artifactsPreset: 'good-pr' },
        {
          id: 'bad',
          expectPass: false,
          artifactsPreset: 'store-only',
        },
      ],
    };
    const s = expandSkillScenario(raw);
    expect(s.runs).toHaveLength(2);
    expect(s.runs[0]!.transcript.steps).toHaveLength(4);
    expect(s.runs[0]!.artifacts?.sourceEditPaths).toEqual(['server/server.js']);
    expect(s.runs[1]!.artifacts?.prUrl).toBeNull();
  });

  it('preserves legacy full transcripts', () => {
    const run = expandRun('legacy', ['discover'], {
      id: 'legacy-run',
      expectPass: true,
      transcript: {
        id: 't',
        steps: [{ id: '1', action: 'discover', claim: 'x', sources: [{ url: 'https://docs.example.com' }] }],
      },
      artifacts: { prUrl: 'https://github.com/acme/c/pull/1' },
    });
    expect(run.transcript.steps).toHaveLength(1);
    expect(run.artifacts?.prUrl).toContain('/pull/1');
  });
});
