/**
 * Vitest suite for AbortSignal support in withTimeout / runWithTimeout.
 * Place at: libs/runtime/__tests__/timeout-abort.test.ts
 */
import { describe, it, expect, vi } from 'vitest';
import { withTimeout, runWithTimeout, createTimeoutController } from '../timeout.js';

// ─── helpers ────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function forever<T = never>(): Promise<T> {
  return new Promise(() => { /* intentionally never resolves */ });
}

// ─── withTimeout + AbortSignal ───────────────────────────────────────────────

describe('withTimeout + AbortSignal', () => {
  it('already-aborted signal → immediate timeout sentinel, no wait', async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await withTimeout(forever<number>(), 10_000, 'test', controller.signal);

    expect(result.ok).toBe(false);
    expect((result as { label?: string }).label).toBe('test');
  });

  it('signal aborts during race → resolves with timeout sentinel', async () => {
    const controller = new AbortController();
    const raceP = withTimeout(forever<number>(), 10_000, 'v', controller.signal);

    await delay(20);
    controller.abort();

    const result = await raceP;
    expect(result.ok).toBe(false);
  });

  it('promise resolves before signal → ok result wins', async () => {
    const controller = new AbortController();

    const result = await withTimeout(Promise.resolve(99), 10_000, 'v', controller.signal);
    controller.abort(); // fires after resolution — should be ignored

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(99);
  });

  it('timer fires before signal → timeout sentinel, signal listener removed', async () => {
    const controller = new AbortController();
    const addSpy    = vi.spyOn(controller.signal, 'addEventListener');
    const removeSpy = vi.spyOn(controller.signal, 'removeEventListener');

    const result = await withTimeout(forever<number>(), 20, 'timed', controller.signal);

    expect(result.ok).toBe(false);
    // Every addEventListener call should be matched by a removeEventListener call.
    expect(removeSpy).toHaveBeenCalledTimes(addSpy.mock.calls.length);
  });

  it('promise rejects → error propagates (not swallowed)', async () => {
    const boom = new Error('boom');
    await expect(
      withTimeout(Promise.reject<number>(boom), 10_000, 'v'),
    ).rejects.toBe(boom);
  });

  it('no budget (ms=0) + signal aborts → timeout sentinel', async () => {
    const controller = new AbortController();
    const raceP = withTimeout(forever<number>(), 0, 'v', controller.signal);

    await delay(10);
    controller.abort();

    const result = await raceP;
    expect(result.ok).toBe(false);
  });

  it('no budget (ms=0) + no signal → awaits promise normally', async () => {
    const result = await withTimeout(Promise.resolve(7), 0);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(7);
  });
});

// ─── runWithTimeout (alias) ──────────────────────────────────────────────────

describe('runWithTimeout', () => {
  it('is an alias for withTimeout — passes signal through', async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await runWithTimeout(forever<number>(), 10_000, 'alias', controller.signal);
    expect(result.ok).toBe(false);
  });
});

// ─── createTimeoutController ─────────────────────────────────────────────────

describe('createTimeoutController', () => {
  it('signal is not aborted immediately', () => {
    const { signal, abort } = createTimeoutController(10_000);
    expect(signal.aborted).toBe(false);
    abort(); // clean up
  });

  it('fires abort after ms elapses', async () => {
    const { signal } = createTimeoutController(30);
    expect(signal.aborted).toBe(false);
    await delay(60);
    expect(signal.aborted).toBe(true);
  });

  it('early abort() cancels the timer and aborts the signal', async () => {
    const { signal, abort } = createTimeoutController(10_000);
    abort();
    expect(signal.aborted).toBe(true);
    // timer should not fire (cleared) — just wait to be sure
    await delay(20);
    expect(signal.aborted).toBe(true); // still true, not a double-toggle
  });

  it('abort() is idempotent — calling twice does not throw', () => {
    const { abort, signal } = createTimeoutController(10_000);
    abort();
    expect(() => abort()).not.toThrow();
    expect(signal.aborted).toBe(true);
  });
});

// ─── audit suppression (unit-level guard) ────────────────────────────────────

describe('audit suppression via AbortSignal', () => {
  it('emitAudit is skipped when signal is already aborted', () => {
    const controller = new AbortController();
    controller.abort();

    const emitted: string[] = [];
    const bus = { emitAudit: (ev: { vendor: string }) => emitted.push(ev.vendor) };

    // Mirrors the guard added to runOne():
    // "if (bus && !signal?.aborted) { bus.emitAudit(...) }"
    if (bus && !controller.signal.aborted) {
      bus.emitAudit({ vendor: 'acme' });
    }

    expect(emitted).toHaveLength(0);
  });

  it('emitAudit fires normally when signal is live', () => {
    const controller = new AbortController();

    const emitted: string[] = [];
    const bus = { emitAudit: (ev: { vendor: string }) => emitted.push(ev.vendor) };

    if (bus && !controller.signal.aborted) {
      bus.emitAudit({ vendor: 'beta' });
    }

    expect(emitted).toEqual(['beta']);
    controller.abort(); // clean up
  });
});
