/**
 * Load fixtures from evals/fixtures (source of truth for normative eval data).
 * Paths are confined under evals/fixtures (no .. escape).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
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

/** Resolve relativePath under fixtures root; throw if it escapes. */
function resolveFixturePath(relativePath: string): string {
  if (!relativePath || relativePath.includes('\0')) {
    throw new Error(`Invalid fixture path: ${JSON.stringify(relativePath)}`);
  }
  const root = resolve(fixturesRoot());
  const resolved = resolve(root, relativePath);
  const rel = relative(root, resolved);
  // Reject .. escapes and absolute paths that leave the fixtures tree.
  if (rel.startsWith(`..${sep}`) || rel === '..' || rel.startsWith('..')) {
    throw new Error(`Fixture path escapes evals/fixtures: ${relativePath}`);
  }
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    throw new Error(`Fixture path escapes evals/fixtures: ${relativePath}`);
  }
  return resolved;
}

/**
 * Load and parse a JSON fixture relative to evals/fixtures.
 * @example loadFixture('meta/map-v2.json')
 */
export function loadFixture<T = unknown>(relativePath: string): T {
  const path = resolveFixturePath(relativePath);
  if (!existsSync(path)) {
    throw new Error(`Fixture not found: evals/fixtures/${relativePath}`);
  }
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/**
 * Load a text fixture (OpenAPI YAML, curl samples, markdown) relative to evals/fixtures.
 */
export function loadFixtureText(relativePath: string): string {
  const path = resolveFixturePath(relativePath);
  if (!existsSync(path)) {
    throw new Error(`Fixture not found: evals/fixtures/${relativePath}`);
  }
  return readFileSync(path, 'utf8');
}
