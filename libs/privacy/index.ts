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
export { evalCondition, getPath } from './conditions.js';
