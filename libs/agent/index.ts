/**
 * Agent helpers — deterministic process tools (not an LLM).
 * - checklist / artifact validators / fix-loop: process evals
 * - pipeline: CLI agent status/next/mark-done
 */

export {
  REQUIRED_SKILL_PIPELINE,
  assertChecklistCompleteness,
  type RequiredSkillId,
  type OrchestrateChecklist,
} from './checklist.js';

export {
  INTEGRATION_PIPELINE,
  PIPELINE_STATUS_REL,
  formatNextStepLine,
  formatPipelineStatus,
  getNextStep,
  getNextStepForProject,
  isPipelineStepId,
  loadCompletedSteps,
  loadPipelineMode,
  effectiveCompletedSteps,
  markStepDone,
  assertCanMarkStep,
  setPipelineMode,
  pipelineAlreadyStarted,
  resetPipelineStatus,
  pipelineStatusPath,
  type PipelineStep,
  type PipelineMode,
} from './pipeline.js';

export {
  SKILL_PACKET_REL,
  MIN_EVIDENCE_BYTES,
  skillPacketPath,
  buildSkillPacket,
  writeSkillPacket,
  assertEvidenceForStep,
  assertSkillPacketForMarkDone,
  readEvidenceFile,
  requirePipelineStarted,
} from './skill-packet.js';

export {
  SURFACE_INVENTORY_REL,
  surfaceInventoryPath,
  loadSurfaceInventory,
  saveSurfaceInventory,
  assertValidSurfaceInventory,
  assertSurfacesStepComplete,
  assertAllSurfacesResolved,
  type SurfaceInventory,
  type SurfaceLanguage,
  type SurfaceStatus,
} from './surfaces.js';

export {
  openClientPr,
  canPushToGithubRepo,
  parseGithubOwnerRepo,
  findOpenPrByMatch,
  findOpenPrForUsecase,
  LAYERKIT_PRODUCT_URL,
  type OpenClientPrOpts,
  type OpenClientPrResult,
} from './open-client-pr.js';

export {
  LAYERKIT_INTENT_PREFIXES,
  looksLikeLayerkitIntent,
  formatLayerkitHelp,
  layerkitIntentHookLine,
} from './intent-help.js';

export {
  HANDOFF_REQUIRED_HEADINGS,
  HANDOFF_TEMPLATE,
  type HandoffRunbookInput,
  type WriteHandoffRunbookInput,
  handoffRunbookRel,
  buildHandoffRunbook,
  writeHandoffRunbook,
  handoffHasRequiredHeadings,
} from './handoff.js';
