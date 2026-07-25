export type {
  AuditEvent,
  AuditSinkV02,
  EmitFailurePolicy,
  LogSinkV02,
  MetricSinkV02,
  ObservationConfig,
  OtelOtlpHttpSinkV02,
  SpiSinkV02,
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
  spiSink,
  otelOtlpHttpSink,
  getOtelOtlpHttpBuffer,
  clearOtelOtlpHttpBuffer,
  type EmitContext,
  type ObservationBus,
  type OtelOtlpHttpBufferEntry,
} from './sinks.js';

export {
  registerSinkSpi,
  getSinkSpi,
  listSinkSpi,
  clearSinkSpi,
  type ObservationSinkSpi,
} from './spi.js';
