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

export { assert };
