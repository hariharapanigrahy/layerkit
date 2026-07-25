/**
 * Agent helpers — deterministic process tools (not an LLM).
 * - checklist / style-profile / fix-loop: process evals
 * - pipeline: CLI agent status/next/mark-done
 */

export {
  REQUIRED_SKILL_PIPELINE,
  assertChecklistCompleteness,
  type RequiredSkillId,
  type OrchestrateChecklist,
} from './checklist.js';

export {
  STYLE_PROFILE_REQUIRED_KEYS,
  validateStyleProfile,
  parseStyleProfileMarkdown,
  parseStyleProfileJson,
  formatStyleProfileMarkdown,
  requireStyleProfile,
  type StyleProfile,
  type StyleProfileRequiredKey,
  type StyleProfileValidation,
} from './style-profile.js';

export {
  extractPathFromDocExcerpt,
  detectPathMismatch,
  applyMapPathFix,
  applyMapPatches,
  runSequentialMapFixes,
  evaluateDryRunWire,
  applyProposalMapFix,
  applyProposalMapFixes,
  pathFixFromDoc,
  asV1Map,
  type MapPathFixPatch,
  type PathMismatch,
  type FixLoopStepResult,
  type WireExpectation,
  type DryRunCheckResult,
} from './fix-loop.js';

export {
  INTEGRATION_PIPELINE,
  PIPELINE_STATUS_REL,
  formatNextStepLine,
  formatPipelineStatus,
  getNextStep,
  isPipelineStepId,
  loadCompletedSteps,
  markStepDone,
  pipelineStatusPath,
  type PipelineStep,
} from './pipeline.js';
