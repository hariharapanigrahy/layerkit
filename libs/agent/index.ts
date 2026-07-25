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
  STYLE_PROFILE_RUNBOOK_REL,
  scanJavaStyle,
  profileFromEvidence,
  writeStyleProfileRunbook,
  scanAndWriteStyleProfile,
  isScannableRoot,
  type StyleScanEvidence,
  type StyleScanResult,
} from './scan-style.js';

export {
  DOMAIN_DISCOVERY_RUNBOOK_REL,
  scanDomain,
  buildDomainSpecProposal,
  formatDomainDiscoveryMarkdown,
  writeDomainDiscoveryRunbook,
  scanAndWriteDomainDiscovery,
  isDomainScannableRoot,
  type DomainDiscoveryResult,
  type DomainDiscoverySource,
  type DomainIntentHit,
  type DomainFieldHit,
} from './discover-domain.js';

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

export {
  checkDryRunGate,
  checkMapStatusGate,
  collectSecretFindings,
  criticalSecretFindings,
  evaluatePromoteGates,
  formatPromoteGateFailures,
  hasPrivacyPolicyForVendor,
  listPrivacyPolicyIds,
  mapHasPiiLookingFields,
  type PromoteGateFailure,
  type PromoteGateId,
  type PromoteGatesInput,
  type PromoteGatesResult,
} from './promote-gates.js';

export {
  decideShape,
  defaultRationale,
  designDecisionPath,
  designDecisionRunbookRel,
  formatDesignDecisionMarkdown,
  loadDesignDecision,
  parseDesignDecisionJson,
  parseDesignDecisionMarkdown,
  writeDesignDecision,
  type DecideShapeInput,
  type DesignDecision,
  type IntegrationShape,
  type WriteDesignDecisionOpts,
} from './design-decision.js';

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

export {
  DOMAIN_BINDING_REL,
  DEFAULT_DOMAIN_BINDING,
  domainBindingPath,
  loadDomainBinding,
  writeDomainBinding,
  formatDomainBindingMarkdown,
  resolveIntentForOperation,
  resolveIntentsFromOpenApi,
  type DomainBindingConvention,
  type DomainIntentSource,
  type ResolvedDomainIntent,
} from './domain-binding.js';
