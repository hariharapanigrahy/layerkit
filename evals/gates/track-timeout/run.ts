/**
 * Gate: track() overall + per-vendor timeouts (withTimeout / runWithTimeout).
 *
 * - Unit-tests withTimeout thoroughly with artificial delay (no flaky track slow-path).
 * - Integration: track() with vendorTimeoutMs / timeoutMs generous budgets still succeeds.
 * - vendorTimeoutMs is applied as runWithTimeout around each runOne (see track.ts).
 */
import { assertEqual, assertTrue } from '../../harness/assert.js';
import type { VendorMap } from '../../../libs/domain/types.js';
import {
  runWithTimeout,
  withTimeout,
  type TimeoutResult,
} from '../../../libs/runtime/timeout.js';
import { track } from '../../../libs/runtime/track.js';

function delay<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(value), ms);
  });
}

function rejectAfter(ms: number, err: Error): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(err), ms);
  });
}

// ── withTimeout: resolves within bound ──────────────────────────────────────
{
  const t0 = Date.now();
  const r = await withTimeout(Promise.resolve(42), 500, 'quick');
  const elapsed = Date.now() - t0;
  assertTrue('withTimeout ok shape', r.ok === true);
  if (r.ok) assertEqual('withTimeout value', r.value, 42);
  assertTrue('withTimeout fast path < 200ms', elapsed < 200, `elapsed=${elapsed}`);
}

// ── withTimeout: timeout sentinel within bound ──────────────────────────────
{
  const t0 = Date.now();
  const r = await withTimeout(delay(200, 'late'), 15, 'slow-label');
  const elapsed = Date.now() - t0;
  assertTrue('withTimeout timeout shape', r.ok === false);
  if (!r.ok) {
    assertEqual('withTimeout reason', r.reason, 'timeout');
    assertEqual('withTimeout label', r.label, 'slow-label');
  }
  assertTrue(
    'withTimeout fires before work (~15ms, not 200ms)',
    elapsed < 120,
    `elapsed=${elapsed}`,
  );
}

// ── withTimeout: never-resolving promise times out ──────────────────────────
{
  const never = new Promise<string>(() => {
    /* intentionally never settles */
  });
  const r = await withTimeout(never, 20, 'never');
  assertTrue('never → timeout', r.ok === false);
  if (!r.ok) assertEqual('never reason', r.reason, 'timeout');
}

// ── withTimeout: propagates rejection before deadline ───────────────────────
{
  let rejected = false;
  try {
    await withTimeout(Promise.reject(new Error('boom')), 500, 'rej');
  } catch (e) {
    rejected = e instanceof Error && e.message === 'boom';
  }
  assertTrue('withTimeout rejects when work fails first', rejected);
}

// ── withTimeout: late rejection after timeout is not unhandled ──────────────
{
  let unhandled = 0;
  const onUnhandled = () => {
    unhandled += 1;
  };
  process.on('unhandledRejection', onUnhandled);
  try {
    const lateReject = rejectAfter(40, new Error('late-reject'));
    const r = await withTimeout(lateReject, 5, 'swallow');
    assertTrue('late reject → timeout first', r.ok === false);
    // Allow late rejection to surface into the attached swallow handler
    await delay(80, null);
    assertEqual('no unhandledRejection after timeout', unhandled, 0);
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
}

// ── runWithTimeout alias behaves identically ────────────────────────────────
{
  const ok = await runWithTimeout(Promise.resolve('a'), 100, 'alias');
  assertTrue('runWithTimeout ok', ok.ok === true);
  const timed: TimeoutResult<string> = await runWithTimeout(delay(100, 'b'), 5, 'alias-t');
  assertTrue('runWithTimeout timeout', timed.ok === false);
}

// ── non-positive ms = no timeout (await only) ───────────────────────────────
{
  const r = await withTimeout(delay(10, 'x'), 0, 'zero');
  assertTrue('ms=0 no timeout sentinel', r.ok === true);
  if (r.ok) assertEqual('ms=0 value', r.value, 'x');
}

// ── track integration: generous vendorTimeoutMs still succeeds ──────────────
const sampleMap: VendorMap = {
  vendor: 'timeout_v',
  displayName: 'Timeout Vendor',
  version: '1.0.0',
  auth: { type: 'bearer' },
  endpoint: { method: 'POST', path: '/e', baseUrl: 'https://api.example.com' },
  intents: { purchase: { eventName: 'purchase' } },
  fields: [{ domain: 'eventId', vendor: 'event_id', transform: { type: 'identity' } }],
  documentation: [{ title: 'd', url: 'https://docs.example.com' }],
  status: 'map_complete',
};

const generous = await track(
  { intent: 'purchase', eventId: 'evt_to_1' },
  [sampleMap],
  {
    mode: 'dry_run',
    observation: false,
    requirePrivacyPolicyForLive: false,
    // Documented: vendorTimeoutMs races each runOne via runWithTimeout
    vendorTimeoutMs: 5000,
    timeoutMs: 5000,
  },
);
assertEqual('track generous timeout → 1 result', generous.results.length, 1);
assertTrue(
  'track generous not timeout failure',
  generous.results[0]!.reason !== 'timeout',
  `reason=${generous.results[0]!.reason}`,
);
assertTrue(
  'track generous no timeout_overall diagnostic',
  !(generous.diagnostics ?? []).some((d) => d.includes('timeout_overall')),
);

// vendorTimeoutMs: 1 — map path is sync/fast; may or may not hit timeout on a
// loaded machine. Contract check: call accepts the option and returns a result.
const tight = await track(
  { intent: 'purchase', eventId: 'evt_to_2' },
  [sampleMap],
  {
    mode: 'dry_run',
    observation: false,
    requirePrivacyPolicyForLive: false,
    vendorTimeoutMs: 1,
  },
);
assertEqual('track vendorTimeoutMs:1 → 1 result', tight.results.length, 1);
assertTrue(
  'track vendorTimeoutMs:1 outcome defined',
  tight.results[0]!.outcome === 'success' ||
    tight.results[0]!.outcome === 'failure' ||
    tight.results[0]!.outcome === 'skipped',
);
// If the race lost, contract is failure + reason timeout + skipped false
if (tight.results[0]!.reason === 'timeout') {
  assertEqual('per-vendor timeout outcome', tight.results[0]!.outcome, 'failure');
  assertEqual('per-vendor timeout skipped', tight.results[0]!.skipped, false);
  assertEqual('per-vendor timeout errorClass', tight.results[0]!.errorClass, 'timeout');
}

console.log('track-timeout: all checks passed');
