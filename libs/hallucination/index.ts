/**
 * Hallucination / invent-signal detection for proposals before store mutation.
 *
 * @example
 * ```ts
 * import { detectHallucination, assertNoHallucination } from 'layerkit/hallucination';
 *
 * const report = detectHallucination(proposal);
 * assertNoHallucination(proposal); // throws hallucination_blocked: …
 * assertNoHallucination(proposal, { strict: true }); // also fails on warns (example.com)
 * ```
 *
 * Apply path: VendorMemoryStore.applyProposal runs detectHallucination before applyByKind.
 * Break-glass: LAYERKIT_ALLOW_HALLUCINATION=1 skips the apply block (not for production).
 */
export type {
  AssertNoHallucinationOpts,
  DetectionResult,
  HallucinationIssue,
  HallucinationIssueCode,
  HallucinationLevel,
  HallucinationReport,
} from './types.js';
export { HALLUCINATION_ISSUE_CODES } from './types.js';
export {
  assertNoHallucination,
  detectHallucination,
  hasHallucinationErrors,
} from './detect.js';
