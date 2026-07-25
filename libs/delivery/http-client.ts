/**
 * Live HTTP delivery client — fetch-based with retry on 429/5xx (and policy.retryOn).
 * dry_run/shadow never call this module; only DeliverySimulator live + allowNetwork.
 */
import type { DeliveryPolicy, ErrorClass } from './types.js';
import { errorClassFromHttp } from './types.js';

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface HttpClientOptions {
  /** Retry + timeout from delivery policy */
  policy: Pick<DeliveryPolicy, 'retry' | 'timeoutMs' | 'idempotency'>;
  /** Injected fetch (default globalThis.fetch). Tests mock this — never hit real internet. */
  fetchImpl?: FetchLike;
  /** Backoff sleep (default real timer). Tests inject immediate resolve. */
  sleep?: (ms: number) => Promise<void>;
  /**
   * Optional spy — incremented once per actual fetch attempt.
   * Used by gates to prove shadow does not network.
   */
  networkProbe?: { calls: number };
}

export interface HttpSendRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  /** Wire body — objects are JSON-serialized */
  body?: unknown;
  /** Value for Idempotency-Key header when policy sets headerName */
  idempotencyKey?: string;
}

export interface HttpSendResult {
  ok: boolean;
  httpStatus?: number;
  errorClass?: ErrorClass;
  attempts: number;
  networkCalls: number;
  bodyText?: string;
  reasonCode?: string;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Backoff delay for attempt `n` (1-based completed attempt about to retry). */
export function computeBackoffMs(
  attempt: number,
  retry: DeliveryPolicy['retry'],
): number {
  const base =
    retry.backoff === 'fixed'
      ? retry.initialMs
      : retry.initialMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(retry.maxMs, Math.max(0, base));
}

function isRetryable(errorClass: ErrorClass, retryOn: ErrorClass[]): boolean {
  return retryOn.includes(errorClass);
}

function classifyFetchError(err: unknown): ErrorClass {
  if (err && typeof err === 'object') {
    const name = (err as { name?: string }).name;
    const message = String((err as { message?: string }).message ?? '');
    if (name === 'AbortError' || /aborted|timeout/i.test(message)) {
      return 'timeout';
    }
  }
  return 'network';
}

function buildBody(body: unknown): { bodyInit?: string | Uint8Array; contentType?: string } {
  if (body === undefined || body === null) return {};
  if (typeof body === 'string') return { bodyInit: body };
  if (body instanceof Uint8Array) return { bodyInit: body };
  return {
    bodyInit: JSON.stringify(body),
    contentType: 'application/json',
  };
}

/**
 * Send HTTP request with retries per policy.
 * Retries only when derived ErrorClass is in policy.retry.retryOn and attempts remain.
 * Caps backoff at retry.maxMs.
 */
export async function sendWithRetry(
  req: HttpSendRequest,
  opts: HttpClientOptions,
): Promise<HttpSendResult> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const sleep = opts.sleep ?? defaultSleep;
  const { retry, timeoutMs, idempotency } = opts.policy;
  const maxAttempts = Math.max(1, retry.maxAttempts);
  const method = (req.method ?? 'POST').toUpperCase();

  let attempts = 0;
  let networkCalls = 0;
  let lastStatus: number | undefined;
  let lastErrorClass: ErrorClass | undefined;
  let lastBody: string | undefined;

  while (attempts < maxAttempts) {
    attempts += 1;
    networkCalls += 1;
    if (opts.networkProbe) opts.networkProbe.calls += 1;

    const headers: Record<string, string> = { ...(req.headers ?? {}) };
    if (idempotency.headerName && req.idempotencyKey) {
      headers[idempotency.headerName] = req.idempotencyKey;
    }
    const built = buildBody(req.body);
    if (built.contentType && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
      headers['Content-Type'] = built.contentType;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetchImpl(req.url, {
        method,
        headers,
        body: method === 'GET' || method === 'HEAD' ? undefined : built.bodyInit,
        signal: controller.signal,
      });
      lastStatus = res.status;
      lastBody = await res.text().catch(() => undefined);

      if (res.ok || (res.status >= 200 && res.status < 400)) {
        return {
          ok: true,
          httpStatus: res.status,
          attempts,
          networkCalls,
          bodyText: lastBody,
          reasonCode: 'live_http_success',
        };
      }

      lastErrorClass = errorClassFromHttp(res.status);
      const canRetry =
        attempts < maxAttempts && isRetryable(lastErrorClass, retry.retryOn);
      if (!canRetry) {
        return {
          ok: false,
          httpStatus: res.status,
          errorClass: lastErrorClass,
          attempts,
          networkCalls,
          bodyText: lastBody,
          reasonCode: `http_${res.status}`,
        };
      }
      await sleep(computeBackoffMs(attempts, retry));
    } catch (err) {
      lastErrorClass = classifyFetchError(err);
      lastStatus = undefined;
      const canRetry =
        attempts < maxAttempts && isRetryable(lastErrorClass, retry.retryOn);
      if (!canRetry) {
        return {
          ok: false,
          httpStatus: lastStatus,
          errorClass: lastErrorClass,
          attempts,
          networkCalls,
          reasonCode: lastErrorClass === 'timeout' ? 'http_timeout' : 'http_network',
        };
      }
      await sleep(computeBackoffMs(attempts, retry));
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    ok: false,
    httpStatus: lastStatus,
    errorClass: lastErrorClass ?? 'unknown',
    attempts,
    networkCalls,
    bodyText: lastBody,
    reasonCode: 'http_exhausted',
  };
}

/** Convenience factory binding policy + injectables. */
export function createHttpClient(opts: HttpClientOptions) {
  return {
    send(req: HttpSendRequest): Promise<HttpSendResult> {
      return sendWithRetry(req, opts);
    },
  };
}

export type DeliveryHttpClient = ReturnType<typeof createHttpClient>;
