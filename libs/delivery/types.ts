/**
 * Delivery policy, error classes, DLQ, and simulation results.
 */

export type ErrorClass =
  | 'network'
  | 'timeout'
  | 'auth'
  | 'rate_limit'
  | 'validation'
  | 'vendor_4xx'
  | 'vendor_5xx'
  | 'unknown';

export type DeliveryMode = 'live' | 'dry_run' | 'shadow';

export interface DeliveryPolicy {
  idempotency: {
    keyFrom: string;
    headerName?: string;
  };
  retry: {
    maxAttempts: number;
    backoff: 'exponential' | 'fixed';
    initialMs: number;
    maxMs: number;
    retryOn: ErrorClass[];
  };
  rateLimit?: {
    requestsPerSecond: number;
    burst?: number;
  };
  timeoutMs: number;
  dlq: {
    enabled: boolean;
    sink: { type: 'directory'; path: string } | { type: 'stdout_json' };
  };
  mode: DeliveryMode;
}

export const DEFAULT_DELIVERY_POLICY: DeliveryPolicy = {
  idempotency: { keyFrom: 'eventId', headerName: 'Idempotency-Key' },
  retry: {
    maxAttempts: 3,
    backoff: 'exponential',
    initialMs: 100,
    maxMs: 5000,
    retryOn: ['network', 'timeout', 'rate_limit', 'vendor_5xx'],
  },
  timeoutMs: 10_000,
  dlq: {
    enabled: true,
    sink: { type: 'directory', path: '{projectDir}/dlq' },
  },
  mode: 'dry_run',
};

export interface DlqRecord {
  schemaVersion: 2;
  id: string;
  ts: string;
  vendor: string;
  operationId: string;
  eventId?: string;
  intent: string;
  errorClass: ErrorClass;
  httpStatus?: number;
  attempts: number;
  event: unknown;
  wire: unknown;
  requestHeadersRedacted: Record<string, string>;
  mapVersion?: string;
  privacyPolicyVersion?: string;
}

export interface DeliveryRequest {
  vendor: string;
  operationId: string;
  intent: string;
  eventId?: string;
  /** Final wire after privacy */
  wire: unknown;
  /** Redacted headers (no secrets) */
  headers?: Record<string, string>;
  /** Domain event snapshot */
  event?: unknown;
  mapVersion?: string;
  privacyPolicyVersion?: string;
  /** Resolved URL — used only for logging; never fetched in dry_run/shadow */
  url?: string;
  method?: string;
}

export interface DeliveryResult {
  outcome: 'success' | 'failure' | 'skipped' | 'shadow' | 'dry_run';
  simulated: boolean;
  networkCalls: number;
  httpStatus?: number;
  errorClass?: ErrorClass;
  idempotentReplay?: boolean;
  attempts: number;
  dlqId?: string;
  reasonCode?: string;
}

/** Derive ErrorClass from HTTP status / failure kind (normative table). */
export function errorClassFromHttp(status: number | undefined, kind?: 'network' | 'timeout'): ErrorClass {
  if (kind === 'network') return 'network';
  if (kind === 'timeout') return 'timeout';
  if (status === undefined) return 'unknown';
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status === 400 || status === 404 || status === 422) return 'validation';
  if (status >= 400 && status < 500) return 'vendor_4xx';
  if (status >= 500) return 'vendor_5xx';
  return 'unknown';
}
