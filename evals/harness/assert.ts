/**
 * Deterministic assertion helpers for eval gates.
 * Prints PASS/FAIL lines; fail() exits the process with code 1.
 */
import { strict as assert } from 'node:assert';

export function pass(name: string): void {
  console.log(`PASS ${name}`);
}

export function fail(name: string, message: string): never {
  console.error(`FAIL ${name}: ${message}`);
  process.exit(1);
}

export function assertTrue(name: string, cond: boolean, message?: string): void {
  if (!cond) fail(name, message ?? 'assertion failed');
  pass(name);
}

export function assertEqual<T>(name: string, actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    fail(name, message ?? `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
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
