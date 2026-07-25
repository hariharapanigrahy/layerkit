/**
 * Deterministic assertion helpers for eval gates.
 * Prints PASS/FAIL lines; fail() throws so try/finally (temp cleanup) still runs.
 * Uncaught EvalAssertionError ends the gate process with a non-zero exit code.
 */
import { strict as assert } from 'node:assert';

/** Thrown by fail() / failed assertions — do not catch unless rethrowing. */
export class EvalAssertionError extends Error {
  readonly checkName: string;

  constructor(checkName: string, message: string) {
    super(`${checkName}: ${message}`);
    this.name = 'EvalAssertionError';
    this.checkName = checkName;
  }
}

export function pass(name: string): void {
  console.log(`PASS ${name}`);
}

/**
 * Report a failed check and abort the gate.
 * Throws (does not process.exit) so withTempProject finally / cleanup always runs.
 */
export function fail(name: string, message: string): never {
  console.error(`FAIL ${name}: ${message}`);
  throw new EvalAssertionError(name, message);
}

export function assertTrue(name: string, cond: boolean, message?: string): void {
  if (!cond) fail(name, message ?? 'assertion failed');
  pass(name);
}

/** Deep equality (objects/arrays OK). Prefer this over reference equality. */
export function assertEqual<T>(name: string, actual: T, expected: T, message?: string): void {
  try {
    assert.deepStrictEqual(actual, expected);
  } catch {
    fail(
      name,
      message ?? `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
  pass(name);
}

export function assertThrows(name: string, fn: () => void, message?: string): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) fail(name, message ?? 'expected function to throw');
  pass(name);
}

export { assert };
