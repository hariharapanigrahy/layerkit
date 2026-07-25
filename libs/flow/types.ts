/**
 * Integration Flow DSL AST (v0.2 — structured predicates only, no CEL).
 */
import type { ConditionExpr, PrivacyPolicy, RuntimeMode } from '../privacy/types.js';
import type { DomainEvent } from '../vendor-memory/map-engine.js';
import type { FieldMapRow } from '../domain/types.js';

export type { ConditionExpr };

export const FLOW_LIMITS = {
  maxNodes: 50,
  maxForeachItems: 500,
  maxWorkingMemoryBytes: 1_048_576,
  maxCallDepth: 8,
} as const;

export interface IntegrationFlow {
  schemaVersion: 2;
  id: string;
  description?: string;
  entry: string;
  nodes: FlowNode[];
}

export type FlowNode =
  | RouteNode
  | MapFieldsNode
  | ForEachNode
  | IfNode
  | AssignNode
  | CallOpNode
  | PrivacyNode
  | FanoutBranchesNode
  | EndNode;

export interface FlowNodeBase {
  id: string;
  next?: string;
}

export interface RouteNode extends FlowNodeBase {
  type: 'route';
  by: 'intent' | 'predicate';
  cases: Array<{ when: string | ConditionExpr; goto: string }>;
  elseGoto?: string;
}

export interface MapFieldsNode extends FlowNodeBase {
  type: 'map_fields';
  source: 'map' | 'intent' | 'inline';
  fields?: FieldMapRow[];
  into: string;
}

export interface ForEachNode extends FlowNodeBase {
  type: 'foreach';
  itemsPath: string;
  as: string;
  body: string;
  collect?: { into: string; mode: 'array' | 'batch_chunks'; chunkSize?: number };
  nextAfter?: string;
}

export interface IfNode extends FlowNodeBase {
  type: 'if';
  condition: ConditionExpr;
  thenGoto: string;
  elseGoto?: string;
}

export interface AssignNode extends FlowNodeBase {
  type: 'assign';
  set: Array<{
    path: string;
    value?: unknown;
    from?: string;
  }>;
}

export interface CallOpNode extends FlowNodeBase {
  type: 'call';
  operationId: string;
  payloadFrom?: string;
  responseInto?: string;
  responseExtract?: Array<{ from: string; to: string }>;
  headersFromVars?: Array<{ header: string; varPath: string; prefix?: string }>;
  mode?: 'live' | 'shadow' | 'dry_run' | 'inherit';
}

export interface PrivacyNode extends FlowNodeBase {
  type: 'privacy';
  policyId?: string;
}

export interface FanoutBranchesNode extends FlowNodeBase {
  type: 'fanout_branches';
  branches: string[];
  join: 'all' | 'all_settled';
}

export interface EndNode extends FlowNodeBase {
  type: 'end';
  status: 'success' | 'skip' | 'abort';
  reason?: string;
}

export interface CallResult {
  httpStatus?: number;
  body: unknown;
  headers: Record<string, string>;
  errorClass?: string;
  simulated?: boolean;
}

export interface FlowWorkingMemory {
  readonly event: DomainEvent;
  payload: Record<string, unknown>;
  vars: Record<string, unknown>;
  loop?: { name: string; index: number; item: unknown };
  results: Record<string, CallResult>;
}

export interface FlowExecuteOptions {
  mode?: RuntimeMode;
  /** Simulated HTTP responses keyed by operationId (dry_run / tests) */
  simulatedResponses?: Record<string, Partial<CallResult>>;
  /** Optional privacy policy for privacy nodes */
  privacyPolicy?: PrivacyPolicy | null;
  /** Initial payload (e.g. from map-engine) */
  initialPayload?: Record<string, unknown>;
}

export interface FlowExecutionResult {
  status: 'success' | 'skip' | 'abort' | 'failure';
  reason?: string;
  reasonCode?: string;
  memory: FlowWorkingMemory;
  nodesVisited: number;
  callLog: Array<{
    operationId: string;
    headers: Record<string, string>;
    payload: unknown;
    response: CallResult;
  }>;
}
