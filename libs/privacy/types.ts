/**
 * Privacy policy + gate result types (design-doc Privacy Gate).
 * Domain package is not extended here — types live with the gate.
 */

export type RuntimeMode = 'live' | 'dry_run' | 'shadow';

export interface DocSource {
  title: string;
  url: string;
  excerpt?: string;
}

/** Structured condition (v0.2 — no CEL). Shared shape with flow DSL. */
export type ConditionExpr =
  | { op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'exists'; path: string; value?: unknown }
  | { op: 'and' | 'or'; args: ConditionExpr[] }
  | { op: 'not'; arg: ConditionExpr };

export interface PrivacyRule {
  id: string;
  when?: ConditionExpr;
  fields?: string[];
  action: 'allow' | 'redact' | 'hash' | 'drop_event' | 'require_consent';
  processorId?: string;
  purposes?: string[];
  regions?: string[];
  notes?: string;
}

export interface EgressCheck {
  type: 'field_allowlist' | 'field_denylist' | 'consent_required' | 'region_lock';
  config: Record<string, unknown>;
}

export interface PrivacyPolicy {
  schemaVersion: 2;
  id: string;
  version: string;
  description: string;
  sources?: DocSource[];
  defaultAction: 'allow' | 'deny';
  rules: PrivacyRule[];
  egressChecks: EgressCheck[];
}

/** Event shape accepted by the privacy gate (DomainEvent + optional consent). */
export interface PrivacyEvent {
  intent: string;
  eventId?: string;
  user?: Record<string, unknown>;
  product?: Record<string, unknown>;
  value?: Record<string, unknown>;
  context?: Record<string, unknown>;
  consent?: {
    purposes?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export type PrivacyAction = 'allow' | 'drop' | 'fail';

export interface PrivacyResult {
  action: PrivacyAction;
  /** Wire after redactions/hashes; null when dropped/failed */
  payload: Record<string, unknown> | null;
  redactedPaths: string[];
  reasonCode?: string;
  warnings: string[];
}
