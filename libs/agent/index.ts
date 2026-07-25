/**
 * Agent process-quality helpers (deterministic; no LLM).
 * Used by agent-as-developer eval gates and optional skill checklist docs.
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
  applyProposalMapFix,
  pathFixFromDoc,
  asV1Map,
  type MapPathFixPatch,
  type PathMismatch,
} from './fix-loop.js';
