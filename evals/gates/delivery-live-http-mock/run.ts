/**
 * Gate: live HTTP delivery retries on 429/5xx then succeeds (mocked fetch — no real internet).
 * Also asserts shadow/dry_run still make zero network calls with the same mock.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertEqual, assertTrue } from '../../harness/assert.js';
import {
  computeBackoffMs,
  createDeliverySimulator,
  errorClassFromHttp,
  MemoryIdempotencyStore,
  sendWithRetry,
  type FetchLike,
} from '../../../libs/delivery/index.js';
import { DEFAULT_DELIVERY_POLICY } from '../../../libs/delivery/types.js';

const root = mkdtempSync(join(tmpdir(), 'layerkit-delivery-live-http-'));
const projectDir = join(root, '.layerkit');

/** Sequence of status codes the mock will return, then forever last or 200. */
function mockFetchSequence(statuses: number[]): {
  fetchImpl: FetchLike;
  calls: { url: string; method: string; headers: Record<string, string> }[];
} {
  const calls: { url: string; method: string; headers: Record<string, string> }[] = [];
  let i = 0;
  const fetchImpl: FetchLike = async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers: Record<string, string> = {};
    if (init?.headers) {
      const h = init.headers as Record<string, string> | string[][] | Headers;
      if (typeof Headers !== 'undefined' && h instanceof Headers) {
        h.forEach((v, k) => {
          headers[k] = v;
        });
      } else if (Array.isArray(h)) {
        for (const [k, v] of h) headers[k] = v;
      } else {
        for (const [k, v] of Object.entries(h as Record<string, string>)) {
          headers[k] = String(v);
        }
      }
    }
    calls.push({ url, method, headers });
    const status = i < statuses.length ? statuses[i]! : 200;
    i += 1;
    return new Response(status >= 200 && status < 300 ? '{"ok":true}' : '{"err":true}', {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { fetchImpl, calls };
}

try {
  // --- ErrorClass mapping (normative table) ---
  assertEqual('429 → rate_limit', errorClassFromHttp(429), 'rate_limit');
  assertEqual('503 → vendor_5xx', errorClassFromHttp(503), 'vendor_5xx');
  assertEqual('401 → auth', errorClassFromHttp(401), 'auth');
  assertEqual('network kind', errorClassFromHttp(undefined, 'network'), 'network');

  // --- Backoff caps ---
  const retry = {
    maxAttempts: 5,
    backoff: 'exponential' as const,
    initialMs: 100,
    maxMs: 500,
    retryOn: DEFAULT_DELIVERY_POLICY.retry.retryOn,
  };
  assertEqual('backoff attempt1', computeBackoffMs(1, retry), 100);
  assertEqual('backoff attempt2', computeBackoffMs(2, retry), 200);
  assertEqual('backoff attempt3', computeBackoffMs(3, retry), 400);
  assertEqual('backoff capped at maxMs', computeBackoffMs(4, retry), 500);
  assertEqual('backoff still capped', computeBackoffMs(10, retry), 500);

  // --- sendWithRetry: 503, 429, then 200 ---
  {
    const { fetchImpl, calls } = mockFetchSequence([503, 429, 200]);
    const sleepLog: number[] = [];
    const probe = { calls: 0 };
    const result = await sendWithRetry(
      {
        url: 'http://127.0.0.1:9/v1/events', // never dialed — mock fetch only
        method: 'POST',
        headers: { Authorization: 'Bearer test' },
        body: { event_name: 'Purchase' },
        idempotencyKey: 'meta::post_events::evt-1',
      },
      {
        policy: {
          ...DEFAULT_DELIVERY_POLICY,
          retry: { ...DEFAULT_DELIVERY_POLICY.retry, maxAttempts: 5, initialMs: 1, maxMs: 5 },
          timeoutMs: 1000,
        },
        fetchImpl,
        sleep: async (ms) => {
          sleepLog.push(ms);
        },
        networkProbe: probe,
      },
    );

    assertTrue('retry then success ok', result.ok === true);
    assertEqual('httpStatus 200', result.httpStatus, 200);
    assertEqual('attempts 3', result.attempts, 3);
    assertEqual('networkCalls 3', result.networkCalls, 3);
    assertEqual('probe 3', probe.calls, 3);
    assertEqual('fetch calls 3', calls.length, 3);
    assertTrue('slept between retries', sleepLog.length === 2);
    assertTrue(
      'Idempotency-Key set',
      calls.every((c) => c.headers['Idempotency-Key'] === 'meta::post_events::evt-1'),
    );
  }

  // --- Non-retryable 401 exhausts immediately ---
  {
    const { fetchImpl, calls } = mockFetchSequence([401, 200]);
    const result = await sendWithRetry(
      { url: 'http://127.0.0.1:9/v1/events', method: 'POST', body: {} },
      {
        policy: DEFAULT_DELIVERY_POLICY,
        fetchImpl,
        sleep: async () => {},
      },
    );
    assertTrue('auth not ok', result.ok === false);
    assertEqual('auth errorClass', result.errorClass, 'auth');
    assertEqual('auth single attempt', result.attempts, 1);
    assertEqual('auth only one fetch', calls.length, 1);
  }

  // --- Unexpected redirects fail closed instead of being reported as success ---
  {
    const { fetchImpl, calls } = mockFetchSequence([302, 200]);
    const result = await sendWithRetry(
      { url: 'http://127.0.0.1:9/v1/events', method: 'POST', body: {} },
      {
        policy: DEFAULT_DELIVERY_POLICY,
        fetchImpl,
        sleep: async () => {},
      },
    );
    assertTrue('redirect not ok', result.ok === false);
    assertEqual('redirect httpStatus', result.httpStatus, 302);
    assertEqual('redirect errorClass unknown', result.errorClass, 'unknown');
    assertEqual('redirect single attempt', result.attempts, 1);
    assertEqual('redirect only one fetch', calls.length, 1);
    assertEqual('redirect reason', result.reasonCode, 'http_302');
  }

  // --- Simulator live path uses client; shadow never networks ---
  {
    const { fetchImpl, calls } = mockFetchSequence([503, 200]);
    const probe = { calls: 0 };
    const idemp = new MemoryIdempotencyStore();
    const sim = createDeliverySimulator({
      projectDir,
      policy: {
        mode: 'live',
        retry: { maxAttempts: 3, backoff: 'exponential', initialMs: 1, maxMs: 5, retryOn: DEFAULT_DELIVERY_POLICY.retry.retryOn },
      },
      idempotency: idemp,
      allowNetwork: true,
      networkProbe: probe,
      fetchImpl,
      sleep: async () => {},
    });

    const live = await sim.deliver({
      vendor: 'meta',
      operationId: 'post_events',
      intent: 'purchase',
      eventId: 'evt-live-1',
      wire: { event_name: 'Purchase', event_id: 'evt-live-1' },
      headers: { Authorization: 'Bearer secret' },
      url: 'http://127.0.0.1:9/v1/events',
      method: 'POST',
    });

    assertEqual('live outcome success', live.outcome, 'success');
    assertTrue('live not simulated', live.simulated === false);
    assertEqual('live attempts 2', live.attempts, 2);
    assertEqual('live networkCalls 2', live.networkCalls, 2);
    assertEqual('probe after live', probe.calls, 2);
    assertEqual('mock fetch after live', calls.length, 2);

    // Shadow with same mock + probe must not call fetch
    const callsBeforeShadow = calls.length;
    const probeBeforeShadow = probe.calls;
    const shadow = await sim.shadow({
      vendor: 'meta',
      operationId: 'post_events',
      intent: 'purchase',
      eventId: 'evt-shadow-new',
      wire: { event_name: 'Purchase' },
      url: 'http://127.0.0.1:9/v1/events',
      method: 'POST',
    });
    assertEqual('shadow outcome', shadow.outcome, 'shadow');
    assertTrue('shadow simulated', shadow.simulated === true);
    assertEqual('shadow networkCalls 0', shadow.networkCalls, 0);
    assertEqual('shadow no new probe', probe.calls, probeBeforeShadow);
    assertEqual('shadow no new fetch', calls.length, callsBeforeShadow);

    // dry_run also zero network
    const dry = await sim.dryRun({
      vendor: 'meta',
      operationId: 'post_events',
      intent: 'purchase',
      eventId: 'evt-dry-new',
      wire: {},
      url: 'http://127.0.0.1:9/v1/events',
    });
    assertEqual('dry_run networkCalls 0', dry.networkCalls, 0);
    assertEqual('dry_run no new fetch', calls.length, callsBeforeShadow);
  }

  // --- Live without allowNetwork still blocked, no fetch ---
  {
    const { fetchImpl, calls } = mockFetchSequence([200]);
    const sim = createDeliverySimulator({
      projectDir,
      policy: { mode: 'live' },
      allowNetwork: false,
      fetchImpl,
      sleep: async () => {},
    });
    const blocked = await sim.deliver({
      vendor: 'meta',
      operationId: 'post_events',
      intent: 'purchase',
      eventId: 'evt-blocked',
      wire: {},
      url: 'http://127.0.0.1:9/v1/events',
    });
    assertEqual('blocked outcome failure', blocked.outcome, 'failure');
    assertEqual('blocked reason', blocked.reasonCode, 'live_network_not_allowed');
    assertEqual('blocked zero network', blocked.networkCalls, 0);
    assertEqual('blocked no fetch', calls.length, 0);
  }

  console.log('delivery-live-http-mock: all checks passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
