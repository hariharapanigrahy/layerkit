/**
 * Resolve Layerkit project store directory.
 *
 * Priority (normative):
 * 1. CLI flag --project-dir
 * 2. Env LAYERKIT_PROJECT_DIR
 * 3. Repo pointer layerkit.path.json (or layerkit.json)
 * 4. Default: {repoRoot}/.layerkit
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export const DEFAULT_PROJECT_DIR_NAME = '.layerkit';
export const PATH_POINTER_FILES = ['layerkit.path.json', 'layerkit.json'] as const;

export interface LayerkitPathPointer {
  schemaVersion: 1;
  projectDir: string;
}

export interface ResolveProjectDirOptions {
  /** CLI --project-dir value (absolute or repo-relative) */
  cliProjectDir?: string;
  /** Env map (defaults to process.env) */
  env?: NodeJS.ProcessEnv;
}

/** Resolve a path that may be absolute or relative to repoRoot. */
export function resolveAgainstRepo(repoRoot: string, pathValue: string): string {
  const trimmed = pathValue.trim();
  if (!trimmed) {
    return join(repoRoot, DEFAULT_PROJECT_DIR_NAME);
  }
  if (isAbsolute(trimmed)) {
    return resolve(trimmed);
  }
  return resolve(repoRoot, trimmed);
}

/** Read first existing path pointer at repo root, or null. */
export function readPathPointer(repoRoot: string): LayerkitPathPointer | null {
  for (const name of PATH_POINTER_FILES) {
    const path = join(repoRoot, name);
    if (!existsSync(path)) continue;
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<LayerkitPathPointer>;
      if (typeof parsed.projectDir === 'string' && parsed.projectDir.trim()) {
        return {
          schemaVersion: 1,
          projectDir: parsed.projectDir.trim(),
        };
      }
    } catch {
      // ignore malformed pointer; fall through
    }
  }
  return null;
}

/**
 * Write repo-root pointer when projectDir is non-default.
 * Pointer is relative to repo root when possible for team portability.
 */
export function writePathPointer(
  repoRoot: string,
  projectDir: string,
  opts?: { force?: boolean },
): string | null {
  const resolved = resolveAgainstRepo(repoRoot, projectDir);
  const defaultDir = join(repoRoot, DEFAULT_PROJECT_DIR_NAME);
  if (!opts?.force && resolved === resolve(defaultDir)) {
    return null;
  }

  // Prefer repo-relative path in the pointer for commit-friendliness.
  let pointerValue = resolved;
  const rel = relative(resolve(repoRoot), resolved);
  if (rel === '') {
    pointerValue = '.';
  } else if (!rel.startsWith('..') && !isAbsolute(rel)) {
    pointerValue = rel.split(sep).join('/');
  }

  const pointer: LayerkitPathPointer = {
    schemaVersion: 1,
    projectDir: pointerValue,
  };
  const outPath = join(repoRoot, 'layerkit.path.json');
  mkdirSync(repoRoot, { recursive: true });
  writeFileSync(outPath, JSON.stringify(pointer, null, 2) + '\n', 'utf8');
  return outPath;
}

/**
 * Resolve absolute project store directory.
 * Order: CLI → LAYERKIT_PROJECT_DIR → layerkit.path.json → default .layerkit
 */
export function resolveProjectDir(repoRoot: string, opts?: ResolveProjectDirOptions): string {
  const env = opts?.env ?? process.env;

  if (opts?.cliProjectDir !== undefined && opts.cliProjectDir !== '') {
    return resolveAgainstRepo(repoRoot, opts.cliProjectDir);
  }

  const fromEnv = env.LAYERKIT_PROJECT_DIR;
  if (fromEnv !== undefined && fromEnv !== '') {
    return resolveAgainstRepo(repoRoot, fromEnv);
  }

  const pointer = readPathPointer(repoRoot);
  if (pointer) {
    return resolveAgainstRepo(repoRoot, pointer.projectDir);
  }

  return join(resolve(repoRoot), DEFAULT_PROJECT_DIR_NAME);
}

/** True when resolved path is the default {repoRoot}/.layerkit */
export function isDefaultProjectDir(repoRoot: string, projectDir: string): boolean {
  return resolve(projectDir) === resolve(join(repoRoot, DEFAULT_PROJECT_DIR_NAME));
}
