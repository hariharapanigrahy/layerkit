/**
 * Recorded agent transcript fixture shape for the nightly process judge.
 * Deterministic only — no live LLM; steps are scored by fixed rubrics.
 */

export interface TranscriptSource {
  title?: string;
  url?: string;
  excerpt?: string;
}

export interface TranscriptStep {
  /** Stable step id within the transcript */
  id: string;
  /** Optional skill name (e.g. layerkit-research-vendor) */
  skill?: string;
  /** What the agent did (research, author-map, ask-human, deepen, …) */
  action: string;
  /** Factual claim the agent asserted (requires sources when present) */
  claim?: string;
  /** Citations backing the claim */
  sources?: TranscriptSource[];
  /**
   * Explicit invent marker. true = agent invented / guessed without evidence.
   * Also detected via text markers in claim/notes/action.
   */
  invent?: boolean;
  /** Agent ran deepen / expand evidence before residual human ask */
  deepened?: boolean;
  /** Agent asked a human for residual gaps on this step */
  askedHuman?: boolean;
  /** Free-form notes (scanned for invent markers) */
  notes?: string;
}

export interface AgentTranscript {
  id: string;
  vendor?: string;
  title?: string;
  steps: TranscriptStep[];
}

export interface RubricCheck {
  id: string;
  ok: boolean;
  detail?: string;
}

export interface ScoreResult {
  transcriptId: string;
  ok: boolean;
  checks: RubricCheck[];
  /** Aggregate flags for reporting */
  citationsOk: boolean;
  noInventOk: boolean;
  deepenBeforeHumanOk: boolean;
}
