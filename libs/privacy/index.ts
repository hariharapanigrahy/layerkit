export type {
  ConditionExpr,
  DocSource,
  EgressCheck,
  PrivacyAction,
  PrivacyEvent,
  PrivacyPolicy,
  PrivacyResult,
  PrivacyRule,
  RuntimeMode,
} from './types.js';
export { evaluatePrivacy } from './gate.js';
export type { EvaluatePrivacyOptions } from './gate.js';
export { evalCondition, getPath } from './conditions.js';
export {
  loadPrivacyPolicy,
  listPrivacyPolicies,
  privacyPolicyCandidates,
  type LoadPrivacyPolicyOpts,
} from './load.js';
