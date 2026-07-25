/**
 * Load fixtures from evals/fixtures (source of truth for normative eval data).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function findRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'evals'))) {
      return dir;
    }
    dir = dirname(dir);
  }
  return process.cwd();
}

/** Absolute path to evals/fixtures */
export function fixturesRoot(): string {
  return join(findRepoRoot(), 'evals', 'fixtures');
}

/**
 * Load and parse a JSON fixture relative to evals/fixtures.
 * @example loadFixture('meta/map-v2.json')
 */
export function loadFixture<T = unknown>(relativePath: string): T {
  const path = join(fixturesRoot(), relativePath);
  if (!existsSync(path)) {
    throw new Error(`Fixture not found: evals/fixtures/${relativePath}`);
  }
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/**
 * Load a text fixture (OpenAPI YAML, curl samples, markdown) relative to evals/fixtures.
 */
export function loadFixtureText(relativePath: string): string {
  const path = join(fixturesRoot(), relativePath);
  if (!existsSync(path)) {
    throw new Error(`Fixture not found: evals/fixtures/${relativePath}`);
  }
  return readFileSync(path, 'utf8');
}
