/**
 * Observation & audit config (v0.2 sinks: noop, stdout_json, file, SPI, OTel placeholder).
 *
 * Real OTLP/export integrations should use `{ type: 'spi', name }` with a
 * customer-registered ObservationSinkSpi — no OpenTelemetry SDK dependency in Layerkit.
 */

export type TelemetryPii = 'never' | 'hashed' | 'allowlist';
export type EmitFailurePolicy = 'best_effort' | 'fail_track';

/** Shared sink variants available on tracing and audit. */
export type OtelOtlpHttpSinkV02 = {
  type: 'otel_otlp_http';
  endpoint: string;
  headers?: Record<string, string>;
  /**
   * Optional injectable fetch for tests / advanced hosts.
   * When omitted (default), events are buffered in-memory and never sent over the network.
   */
  fetchImpl?: (
    input: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string },
  ) => Promise<unknown>;
};

export type SpiSinkV02 = {
  type: 'spi';
  name: string;
  options?: Record<string, unknown>;
};

export type TraceSinkV02 =
  | { type: 'noop' }
  | { type: 'stdout_json' }
  | { type: 'file'; path: string }
  | OtelOtlpHttpSinkV02
  | SpiSinkV02;

export type MetricSinkV02 = TraceSinkV02;
export type LogSinkV02 = TraceSinkV02;

export type AuditSinkV02 =
  | { type: 'noop' }
  | { type: 'stdout_json' }
  | { type: 'file'; path: string }
  | { type: 'custom_java'; className: string }
  | OtelOtlpHttpSinkV02
  | SpiSinkV02;

export interface ObservationConfig {
  schemaVersion: 2;
  tracing: TraceSinkV02[];
  metrics: MetricSinkV02[];
  logs: LogSinkV02[];
  audit: AuditSinkV02[];
  events: {
    mapApply: boolean;
    privacyDecision: boolean;
    deliveryAttempt: boolean;
    deliverySuccess: boolean;
    deliveryFailure: boolean;
    skip: boolean;
  };
  telemetryPii: TelemetryPii;
  telemetryFieldAllowlist?: string[];
  emitFailurePolicy: EmitFailurePolicy;
}

export interface AuditEvent {
  id: string;
  ts: string;
  tenantId?: string;
  vendor: string;
  intent: string;
  eventId?: string;
  stage: 'map' | 'privacy' | 'deliver' | 'skip' | 'dlq' | 'orchestrate';
  outcome: 'success' | 'failure' | 'skipped' | 'shadow';
  reasonCode?: string;
  durationMs?: number;
  /** SHA-256 hex of canonical JSON of allowlisted non-PII fields only */
  wireFingerprint?: string;
  proposalId?: string;
  mapVersion?: string;
  privacyPolicyVersion?: string;
}

export const DEFAULT_OBSERVATION_CONFIG: ObservationConfig = {
  schemaVersion: 2,
  tracing: [{ type: 'noop' }],
  metrics: [{ type: 'noop' }],
  logs: [{ type: 'stdout_json' }],
  audit: [{ type: 'file', path: '{projectDir}/audit' }],
  events: {
    mapApply: true,
    privacyDecision: true,
    deliveryAttempt: true,
    deliverySuccess: true,
    deliveryFailure: true,
    skip: true,
  },
  telemetryPii: 'never',
  emitFailurePolicy: 'best_effort',
};
