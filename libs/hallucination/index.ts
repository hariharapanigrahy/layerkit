/**
 * Placeholder / invent-signal guards for proposals before store mutation.
 *
 * @example
 * ```ts
 * import { detectHallucinationIssues, assertNoHallucinationIssues } from './hallucination';
 *
 * const report = detectHallucinationIssues(proposal);
 * assertNoHallucinationIssues(proposal); // throws hallucination_blocked: …
 * assertNoHallucinationIssues(proposal, { strict: true }); // also fails on warns (example.com)
 * ```
 *
 * Apply path: VendorMemoryStore.applyProposal runs detectHallucinationIssues before applyByKind.
 * Break-glass: LAYERKIT_ALLOW_HALLUCINATION=1 skips the apply block (not for production).
 */
export type {
  AssertNoHallucinationIssuesOpts,
  HallucinationIssue,
  HallucinationIssueCode,
  HallucinationLevel,
  HallucinationReport,
} from './types.js';
export { HALLUCINATION_ISSUE_CODES } from './types.js';
export {
  assertNoHallucinationIssues,
  detectHallucinationIssues,
  hasHallucinationErrors,
} from './detect.js';
