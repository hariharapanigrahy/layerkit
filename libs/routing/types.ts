/**
 * Declarative event routing — vendor sets, expansions, routes.
 *
 * Customer-owned policy under `{projectDir}/routing.json` (or named files).
 * No business-specific segment/product taxonomy in core.
 */
import type { ConditionExpr, DocSource } from '../privacy/types.js';
import type { DomainEvent } from '../domain/event.js';

export type { ConditionExpr };

export interface VendorSet {
  id: string;
  /** Map / vendor ids that belong to this set */
  vendors: string[];
  notes?: string;
}

/**
 * When `when` matches the base event, emit additional intents (same correlation).
 * Base intent is kept unless `keepBaseIntent` is false.
 */
export interface ExpansionRule {
  id: string;
  when?: ConditionExpr;
  emit: Array<{ intent: string; notes?: string }>;
  /** Default true — keep original event intent in the plan */
  keepBaseIntent?: boolean;
}

/**
 * Match an (possibly expanded) event and send its intent to a vendor set.
 * Optional `intent` is shorthand for `{ op: 'eq', path: 'intent', value }`.
 */
export interface RouteRule {
  id: string;
  /** Higher runs first (default 0) */
  priority?: number;
  intent?: string;
  when?: ConditionExpr;
  /** Vendor set id */
  to: string;
  /** Stop evaluating further routes for this expanded event */
  stop?: boolean;
}

export interface RoutingPolicy {
  schemaVersion: 1;
  id: string;
  version: string;
  description?: string;
  sources?: DocSource[];
  vendorSets: VendorSet[];
  expansions?: ExpansionRule[];
  routes: RouteRule[];
  /** Used when no route matches an expanded event */
  defaultVendorSet?: string;
  /**
   * When true, a base/expanded event with zero matching vendors
   * adds a diagnostic (and track may fail-closed via opts).
   */
  requireRouteMatch?: boolean;
  /** Max expansion chain depth (default 3) */
  maxExpansionDepth?: number;
}

export interface RoutePlanEntry {
  vendor: string;
  intent: string;
  /** Route + expansion rule ids that produced this entry */
  ruleIds: string[];
  expansionId?: string;
  /** Domain event to apply (intent may differ from the original base) */
  event: DomainEvent;
}

export interface RoutePlanDiagnostic {
  code: string;
  message: string;
  expansionId?: string;
  routeId?: string;
  intent?: string;
}

export interface RoutePlan {
  eventId?: string;
  baseIntent: string;
  expandedIntents: string[];
  entries: RoutePlanEntry[];
  diagnostics: RoutePlanDiagnostic[];
}

export interface EvaluateRoutingOpts {
  /** Known vendor ids (from maps); unknown set members are dropped with diagnostic */
  knownVendors?: string[];
  /**
   * When true, drop vendors not in knownVendors (default true).
   * When false, keep them (caller may still lack maps).
   */
  filterUnknownVendors?: boolean;
}
