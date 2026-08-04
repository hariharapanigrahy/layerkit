/**
 * Expand compact skill-scenario fixtures into full SkillScenario shapes.
 *
 * Compact runs omit repeated 9-step pipelines — only store deltas
 * (stepOverrides, prepend/append steps, artifacts / presets).
 * Legacy full `transcript` runs still load unchanged.
 */
import type {
  AgentRun,
  AgentRunArtifacts,
  AgentTranscript,
  SkillScenario,
  TranscriptStep,
} from './types.js';

/** Default skill name per pipeline step id. */
export const PIPELINE_STEP_SKILLS: Record<string, string> = {
  discover: 'layerkit-discover-data-layer',
  surfaces: 'layerkit-inventory-surfaces',
  research: 'layerkit-research-vendor',
  design: 'layerkit-design-flow',
  author: 'layerkit-author-map',
  privacy: 'layerkit-privacy-review',
  'deletion-first': 'layerkit-deletion-first',
  'source-edit': 'layerkit-source-edit-client',
  handoff: 'layerkit-session-handoff',
};

export type ArtifactsPreset =
  | 'good-pr'
  | 'store-only'
  | 'store-only-map'
  | 'residual-no-pr'
  | 'pin-only-pr'
  | 'none';

/** Compact run: deltas only (or legacy full transcript). */
export interface CompactRunSpec {
  id: string;
  expectPass: boolean;
  defect?: string;
  /** Full transcript — if present with steps, used as-is (legacy). */
  transcript?: AgentTranscript;
  /** Partial overrides keyed by pipelineStep id */
  stepOverrides?: Record<string, Partial<TranscriptStep>>;
  /** Steps inserted before the default pipeline */
  prepend?: Array<Partial<TranscriptStep> & { action: string }>;
  /** Steps appended after the default pipeline */
  append?: Array<Partial<TranscriptStep> & { action: string }>;
  /**
   * Absolute step list (skips default pipeline expansion).
   * Use for incomplete/partial pipelines (bad runs that omit steps).
   */
  steps?: Array<Partial<TranscriptStep> & { action: string }>;
  /** Named artifact baseline */
  artifactsPreset?: ArtifactsPreset;
  /** Deep-merged over preset (or standalone when preset is none/omitted) */
  artifacts?: AgentRunArtifacts;
}

export interface CompactSkillScenario {
  id: string;
  title: string;
  userIntent: string;
  mode: 'full' | 'heal';
  vendor: string;
  trains: string[];
  skillText: SkillScenario['skillText'];
  runGold: SkillScenario['runGold'];
  runs: CompactRunSpec[];
}

const DEFAULT_CITE_HOST = 'docs.example.com';

export const ARTIFACT_PRESETS: Record<Exclude<ArtifactsPreset, 'none'>, AgentRunArtifacts> = {
  'good-pr': {
    mapFields: [{ domain: 'amount', vendor: 'amount' }],
    mapIntents: { sample: { eventName: 'sample', operationId: 'default' } },
    mapOperations: ['default'],
    documentationUrls: [`https://${DEFAULT_CITE_HOST}/api`],
    prUrl: 'https://github.com/acme/client/pull/1',
    sourceEditPaths: ['server/server.js'],
  },
  'store-only': {
    documentationUrls: [`https://${DEFAULT_CITE_HOST}/api`],
    mapFields: [],
    prUrl: null,
  },
  'store-only-map': {
    documentationUrls: [`https://${DEFAULT_CITE_HOST}/api`],
    mapFields: [{ domain: 'amount', vendor: 'amount' }],
    mapIntents: { sample: { eventName: 'sample', operationId: 'default' } },
    mapOperations: ['default'],
  },
  'residual-no-pr': {
    mapFields: [],
    mapIntents: { sample: { eventName: 'sample', operationId: 'default' } },
    mapOperations: ['default'],
    documentationUrls: [`https://${DEFAULT_CITE_HOST}/api`],
    residualNoPr: true,
    allowResidualNoPr: true,
    residualNote: 'no production field drift',
    residualNoFieldEdit: true,
    prUrl: null,
  },
  'pin-only-pr': {
    documentationUrls: [`https://${DEFAULT_CITE_HOST}/api`],
    mapFields: [],
    mapIntents: { sample: { eventName: 'sample', operationId: 'default' } },
    mapOperations: ['default'],
    prUrl: 'https://github.com/acme/client/pull/1',
    sourceEditPaths: ['package.json'],
  },
};

function mergeArtifacts(
  preset: ArtifactsPreset | undefined,
  override?: AgentRunArtifacts,
): AgentRunArtifacts | undefined {
  if ((!preset || preset === 'none') && !override) return undefined;
  const base =
    preset && preset !== 'none'
      ? { ...ARTIFACT_PRESETS[preset] }
      : ({} as AgentRunArtifacts);
  if (!override) return base;
  return {
    ...base,
    ...override,
    mapFields: override.mapFields ?? base.mapFields,
    mapIntents: override.mapIntents ?? base.mapIntents,
    mapOperations: override.mapOperations ?? base.mapOperations,
    documentationUrls: override.documentationUrls ?? base.documentationUrls,
    sourceEditPaths: override.sourceEditPaths ?? base.sourceEditPaths,
  };
}

/** Build one default pipeline step for a scenario. */
export function defaultPipelineStep(
  scenarioId: string,
  step: string,
  citeHost = DEFAULT_CITE_HOST,
): TranscriptStep {
  const skill = PIPELINE_STEP_SKILLS[step] ?? `layerkit-${step}`;
  if (step === 'surfaces') {
    return {
      id: `${scenarioId}-${step}`,
      pipelineStep: step,
      skill,
      action: step,
      claim: `Inventoried languages for ${scenarioId}`,
      sources: [
        {
          title: 'layout',
          url: 'file://package',
          excerpt: 'server/node server/python',
        },
      ],
      invent: false,
      deepened: true,
      askedHuman: false,
    };
  }
  if (step === 'research') {
    return {
      id: `${scenarioId}-${step}`,
      pipelineStep: step,
      skill,
      action: step,
      claim: `Contract drift assessed from ${citeHost}`,
      sources: [
        {
          title: citeHost,
          url: `https://${citeHost}/api`,
          excerpt: 'API reference',
        },
      ],
      invent: false,
      deepened: true,
      askedHuman: false,
    };
  }
  return {
    id: `${scenarioId}-${step}`,
    pipelineStep: step,
    skill,
    action: step,
    claim: `Completed ${step} for scenario ${scenarioId}`,
    sources: [
      {
        title: citeHost,
        url: `https://${citeHost}/api`,
        excerpt: 'API reference',
      },
    ],
    invent: false,
    deepened: true,
    askedHuman: false,
  };
}

function expandPartialStep(
  scenarioId: string,
  partial: Partial<TranscriptStep> & { action: string },
  index: number,
): TranscriptStep {
  const pipelineStep = partial.pipelineStep ?? partial.action;
  const base =
    pipelineStep && PIPELINE_STEP_SKILLS[pipelineStep]
      ? defaultPipelineStep(scenarioId, pipelineStep)
      : {
          id: `${scenarioId}-extra-${index}`,
          action: partial.action,
          invent: false,
          deepened: true,
          askedHuman: false,
          sources: [] as TranscriptStep['sources'],
        };
  return {
    ...base,
    ...partial,
    id: partial.id ?? base.id ?? `${scenarioId}-extra-${index}`,
    action: partial.action,
    sources: partial.sources ?? base.sources ?? [],
  };
}

/** Expand one compact run into a full AgentRun. */
export function expandRun(
  scenarioId: string,
  pipelineSteps: string[],
  run: CompactRunSpec,
  citeHost = DEFAULT_CITE_HOST,
): AgentRun {
  // Legacy full transcript
  if (run.transcript?.steps?.length) {
    return {
      id: run.id,
      expectPass: run.expectPass,
      defect: run.defect,
      transcript: run.transcript,
      artifacts: run.artifacts,
    };
  }

  const steps: TranscriptStep[] = [];
  let i = 0;

  if (run.steps?.length) {
    // Absolute partial pipeline (bad incomplete runs)
    for (const p of run.steps) {
      steps.push(expandPartialStep(scenarioId, p, i++));
    }
  } else {
    for (const p of run.prepend ?? []) {
      steps.push(expandPartialStep(scenarioId, p, i++));
    }
    for (const stepId of pipelineSteps) {
      const base = defaultPipelineStep(scenarioId, stepId, citeHost);
      const ov = run.stepOverrides?.[stepId];
      steps.push(
        ov
          ? { ...base, ...ov, id: ov.id ?? base.id, sources: ov.sources ?? base.sources }
          : base,
      );
    }
    for (const p of run.append ?? []) {
      steps.push(expandPartialStep(scenarioId, p, i++));
    }
  }

  return {
    id: run.id,
    expectPass: run.expectPass,
    defect: run.defect,
    transcript: {
      id: `t-${run.id}`,
      scenarioId,
      steps,
    },
    artifacts: mergeArtifacts(run.artifactsPreset, run.artifacts),
  };
}

/** Expand compact (or already-full) scenario JSON into SkillScenario. */
export function expandSkillScenario(raw: CompactSkillScenario | SkillScenario): SkillScenario {
  const pipeline = raw.runGold.requiredPipelineSteps;
  const citeHost = raw.runGold.mustCiteHosts?.[0] ?? DEFAULT_CITE_HOST;

  const runs: AgentRun[] = (raw.runs as CompactRunSpec[]).map((run) =>
    expandRun(raw.id, pipeline, run, citeHost),
  );

  return {
    id: raw.id,
    title: raw.title,
    userIntent: raw.userIntent,
    mode: raw.mode,
    vendor: raw.vendor,
    trains: raw.trains,
    skillText: raw.skillText,
    runGold: raw.runGold,
    runs,
  };
}

/** True when a run still uses the expanded legacy shape. */
export function isLegacyFullRun(run: CompactRunSpec | AgentRun): boolean {
  return Boolean((run as CompactRunSpec).transcript?.steps?.length);
}
