export type {
  DeliveryMode,
  DeliveryPolicy,
  DeliveryRequest,
  DeliveryResult,
  DlqRecord,
  ErrorClass,
} from './types.js';
export { DEFAULT_DELIVERY_POLICY, errorClassFromHttp } from './types.js';

export {
  MemoryIdempotencyStore,
  FileIdempotencyStore,
  buildIdempotencyKey,
  type IdempotencyMeta,
  type IdempotencyStore,
} from './idempotency.js';

export { writeDlqRecord, makeDlqRecord } from './dlq.js';

export {
  DeliverySimulator,
  createDeliverySimulator,
  type SimulatorOptions,
} from './simulator.js';

export {
  sendWithRetry,
  createHttpClient,
  computeBackoffMs,
  type FetchLike,
  type HttpClientOptions,
  type HttpSendRequest,
  type HttpSendResult,
  type DeliveryHttpClient,
} from './http-client.js';
