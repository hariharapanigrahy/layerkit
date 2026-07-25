export type {
  AuditEvent,
  AuditSinkV02,
  EmitFailurePolicy,
  LogSinkV02,
  MetricSinkV02,
  ObservationConfig,
  TelemetryPii,
  TraceSinkV02,
} from './types.js';
export { DEFAULT_OBSERVATION_CONFIG } from './types.js';

export {
  wireFingerprint,
  scrubWire,
  canonicalize,
  auditPayloadHasRawPii,
} from './fingerprint.js';

export {
  createObservationBus,
  noopSink,
  stdoutJsonSink,
  fileSink,
  type EmitContext,
  type ObservationBus,
} from './sinks.js';
