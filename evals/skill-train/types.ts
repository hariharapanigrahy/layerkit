/**
 * Continuous skill-training curriculum: scenarios → skill-text judge → agent-run judge.
 * Agents never load these at runtime; the train loop improves SKILL.md + rails.
 */

export interface TranscriptSource {
  title?: string;
  url?: string;
  excerpt?: string;
}

export interface TranscriptStep {
  id: string;
  skill?: string;
  pipelineStep?: string;
  action: string;
  claim?: string;
  sources?: TranscriptSource[];
  invent?: boolean;
  deepened?: boolean;
  askedHuman?: boolean;
  notes?: string;
}

export interface AgentTranscript {
  id: string;
  vendor?: string;
  title?: string;
  scenarioId?: string;
  steps: TranscriptStep[];
}

export interface AgentRunArtifacts {
  mapFields?: Array<{ domain: string; vendor: string }>;
  mapIntents?: Record<
    string,
    { eventName?: string; operationId?: string; skip?: boolean }
  >;
  mapOperations?: string[];
  documentationUrls?: string[];
  sourceEditPaths?: string[];
  residualNoFieldEdit?: boolean;
  prUrl?: string | null;
  residualNoPr?: boolean;
  residualNote?: string;
  allowResidualNoPr?: boolean;
}

export interface AgentRun {
  id: string;
  /** expectPass=true → must score ok; false → must score not-ok */
  expectPass: boolean;
  defect?: string;
  transcript: AgentTranscript;
  artifacts?: AgentRunArtifacts;
}

/** Skill-text expectations: regex strings (case-insensitive unless noted). */
export interface SkillTextGold {
  /** Skills whose SKILL.md is loaded and concatenated for this scenario */
  skillsUnderTest: string[];
  /** Each pattern must match the skill corpus */
  mustMatch: string[];
  /** Each pattern must NOT match */
  mustNotMatch: string[];
}

export interface RunGold {
  mustCiteHosts: string[];
  requiredPipelineSteps: string[];
  mapFieldsMin: number;
  forbidInventFieldPaths: boolean;
  forbidStoreOnlyHandoff: boolean;
  requirePrUrl: boolean;
  allowResidualNoPr: boolean;
}

export interface SkillScenario {
  id: string;
  title: string;
  userIntent: string;
  mode: 'full' | 'heal';
  vendor: string;
  /** Why this scenario trains the agent */
  trains: string[];
  skillText: SkillTextGold;
  runGold: RunGold;
  /** L0 recorded/synthetic runs bound to this scenario */
  runs: AgentRun[];
}

export interface RubricCheck {
  id: string;
  ok: boolean;
  detail?: string;
}

export interface DimensionScore {
  ok: boolean;
  checks: RubricCheck[];
}

export interface ScenarioTrainResult {
  scenarioId: string;
  skillText: DimensionScore;
  runs: Array<{
    runId: string;
    expectPass: boolean;
    scoreOk: boolean;
    ok: boolean;
    checks: RubricCheck[];
  }>;
  ok: boolean;
}

export interface TrainLoopResult {
  ok: boolean;
  scenarios: ScenarioTrainResult[];
  passed: number;
  failed: number;
}
