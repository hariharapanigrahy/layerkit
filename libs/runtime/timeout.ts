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
 *
 * Non-positive or non-finite `ms` is treated as "no timeout" (await promise only).
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label?: string,
): Promise<TimeoutResult<T>> {
  if (!Number.isFinite(ms) || ms <= 0) {
    return promise.then((value): TimeoutResult<T> => ({ ok: true, value }));
  }

  return new Promise<TimeoutResult<T>>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, reason: 'timeout', label });
    }, ms);

    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ ok: true, value });
      },
      (err: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
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
): Promise<TimeoutResult<T>> {
  return withTimeout(promise, ms, label);
}

/** True when a positive finite timeout budget is configured. */
export function hasTimeoutBudget(ms: number | undefined): ms is number {
  return typeof ms === 'number' && Number.isFinite(ms) && ms > 0;
}
