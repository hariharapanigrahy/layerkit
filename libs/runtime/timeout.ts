/**
 * Promise timeout helpers for track() overall + per-vendor budgets.
 *
 * Deterministic, no LLM. Uses clearable timers and always attaches
 * handlers so late rejections after a timeout do not become unhandled.
 */

/** Settled value when work finishes before the deadline. */
export type TimeoutOk<T> = { ok: true; value: T };

/** Sentinel when the budget is exhausted before work settles. */
export type TimeoutExpired = {
  ok: false;
  reason: 'timeout';
  /** Optional caller label (vendor id, "track", etc.) for diagnostics. */
  label?: string;
};

export type TimeoutResult<T> = TimeoutOk<T> | TimeoutExpired;

/**
 * Race `promise` against a wall-clock budget.
 *
 * - Resolves with `{ ok: true, value }` if `promise` fulfills first.
 * - Resolves with `{ ok: false, reason: 'timeout', label }` if the timer fires first.
 * - Rejects with the original error if `promise` rejects before the timer.
 * - After a timeout win, fulfillment/rejection of `promise` is swallowed (no unhandled rejections).
 * - Timer is always cleared when the race settles.
 * - When `signal` is already aborted on entry, resolves immediately with a timeout sentinel
 *   and swallows `promise` settlement (no unhandled rejections).
 *
 * Non-positive or non-finite `ms` is treated as "no timeout" (await promise only).
 *
 * @param signal  Optional AbortSignal. When provided and the signal fires first,
 *                the race resolves with the timeout sentinel and the underlying
 *                promise is swallowed.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label?: string,
  signal?: AbortSignal,
): Promise<TimeoutResult<T>> {
  // Fast path: signal already aborted — treat as immediate timeout.
  if (signal?.aborted) {
    promise.then(undefined, () => undefined); // swallow late rejection
    return Promise.resolve({ ok: false, reason: 'timeout', label });
  }

  if (!Number.isFinite(ms) || ms <= 0) {
    // No timer budget, but still honour an aborting signal.
    if (!signal) {
      return promise.then((value): TimeoutResult<T> => ({ ok: true, value }));
    }
    return new Promise<TimeoutResult<T>>((resolve, reject) => {
      let settled = false;

      const onAbort = () => {
        if (settled) return;
        settled = true;
        promise.then(undefined, () => undefined);
        resolve({ ok: false, reason: 'timeout', label });
      };
      signal.addEventListener('abort', onAbort, { once: true });

      promise.then(
        (value) => {
          if (settled) return;
          settled = true;
          signal.removeEventListener('abort', onAbort);
          resolve({ ok: true, value });
        },
        (err: unknown) => {
          if (settled) return;
          settled = true;
          signal.removeEventListener('abort', onAbort);
          reject(err);
        },
      );
    });
  }

  return new Promise<TimeoutResult<T>>((resolve, reject) => {
    let settled = false;

    const settle = (result: TimeoutResult<T>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      onAbort && signal?.removeEventListener('abort', onAbort);
      resolve(result);
    };

    const timer = setTimeout(() => {
      promise.then(undefined, () => undefined); // swallow after timeout
      settle({ ok: false, reason: 'timeout', label });
    }, ms);

    let onAbort: (() => void) | undefined;
    if (signal) {
      onAbort = () => {
        promise.then(undefined, () => undefined);
        settle({ ok: false, reason: 'timeout', label });
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }

    promise.then(
      (value) => settle({ ok: true, value }),
      (err: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        onAbort && signal?.removeEventListener('abort', onAbort);
        reject(err);
      },
    );
  });
}

/**
 * Alias of {@link withTimeout} — used by track() per-vendor / overall races.
 * Prefer this name when wrapping a unit of work with a budget.
 */
export function runWithTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label?: string,
  signal?: AbortSignal,
): Promise<TimeoutResult<T>> {
  return withTimeout(promise, ms, label, signal);
}

/** True when a positive finite timeout budget is configured. */
export function hasTimeoutBudget(ms: number | undefined): ms is number {
  return typeof ms === 'number' && Number.isFinite(ms) && ms > 0;
}

/**
 * Create an AbortController whose signal fires after `ms` milliseconds,
 * or that can be aborted early via the returned `abort()` function.
 *
 * The internal timer is cleared automatically when `abort()` is called early,
 * so there is no timer leak if the caller aborts before the deadline.
 */
export function createTimeoutController(ms: number): {
  signal: AbortSignal;
  abort: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  const abort = () => {
    clearTimeout(timer);
    if (!controller.signal.aborted) controller.abort();
  };

  return { signal: controller.signal, abort };
}
