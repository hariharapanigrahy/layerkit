import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROJECT_DIR_NAME,
  isDefaultProjectDir,
  readPathPointer,
  resolveAgainstRepo,
  resolveProjectDir,
  writePathPointer,
} from '../config/project-dir.js';

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), 'layerkit-unit-'));
}

describe('project-dir', () => {
  it('resolves defaults, cli, env, pointers, and absolute paths', () => {
    const root = tempRoot();
    try {
      expect(resolveAgainstRepo(root, '')).toBe(join(root, DEFAULT_PROJECT_DIR_NAME));
      expect(resolveAgainstRepo(root, 'custom')).toBe(join(root, 'custom'));
      expect(resolveProjectDir(root, { env: {} })).toBe(join(root, DEFAULT_PROJECT_DIR_NAME));
      expect(resolveProjectDir(root, { cliProjectDir: 'cli', env: { LAYERKIT_PROJECT_DIR: 'env' } })).toBe(join(root, 'cli'));
      expect(resolveProjectDir(root, { env: { LAYERKIT_PROJECT_DIR: 'env' } })).toBe(join(root, 'env'));

      writeFileSync(join(root, 'layerkit.path.json'), '{"schemaVersion":1,"projectDir":"from-pointer"}\n');
      expect(resolveProjectDir(root, { env: {} })).toBe(join(root, 'from-pointer'));
      expect(readPathPointer(root)).toEqual({ schemaVersion: 1, projectDir: 'from-pointer' });
      expect(isDefaultProjectDir(root, join(root, DEFAULT_PROJECT_DIR_NAME))).toBe(true);
      expect(isDefaultProjectDir(root, join(root, 'custom'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('writes portable pointers and ignores malformed pointer files', () => {
    const root = tempRoot();
    try {
      expect(writePathPointer(root, join(root, DEFAULT_PROJECT_DIR_NAME))).toBeNull();
      const forcedDefault = writePathPointer(root, join(root, DEFAULT_PROJECT_DIR_NAME), { force: true });
      expect(JSON.parse(readFileSync(forcedDefault!, 'utf8')).projectDir).toBe('.layerkit');
      const path = writePathPointer(root, join(root, 'nested', 'store'));
      expect(path).toBe(join(root, 'layerkit.path.json'));
      expect(JSON.parse(readFileSync(path!, 'utf8')).projectDir).toBe('nested/store');

      writeFileSync(join(root, 'layerkit.path.json'), '{bad json');
      writeFileSync(join(root, 'layerkit.json'), '{"projectDir":"fallback"}\n');
      expect(readPathPointer(root)).toEqual({ schemaVersion: 1, projectDir: 'fallback' });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
