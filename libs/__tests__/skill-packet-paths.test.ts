import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertEvidenceForStep,
  resolvePackageRootForPaths,
} from '../agent/skill-packet.js';

describe('resolvePackageRootForPaths', () => {
  it('prefers repoRoot when provided', () => {
    expect(resolvePackageRootForPaths('/pkg/.layerkit', '/pkg')).toBe('/pkg');
  });

  it('uses parent of .layerkit store as package root', () => {
    const root = resolvePackageRootForPaths('/tmp/my-client/.layerkit');
    expect(root?.endsWith('my-client') || root === '/tmp/my-client').toBe(true);
  });
});

describe('source-edit on-disk paths', () => {
  it('accepts production paths under package root when projectDir is .layerkit', () => {
    const pkg = mkdtempSync(join(tmpdir(), 'lk-src-edit-'));
    const projectDir = join(pkg, '.layerkit');
    mkdirSync(join(pkg, 'src', 'vendors', 'linkedin'), { recursive: true });
    mkdirSync(join(projectDir, 'memory', 'runbooks'), { recursive: true });
    writeFileSync(join(pkg, 'src', 'vendors', 'linkedin', 'adapter.ts'), 'export const x = 1;\n');
    writeFileSync(
      join(projectDir, 'memory', 'runbooks', 'surface-inventory.json'),
      JSON.stringify({
        schemaVersion: 1,
        package: 't',
        languages: [
          {
            id: 'node',
            roots: ['src/'],
            status: 'updated',
            paths: ['src/vendors/linkedin/adapter.ts'],
          },
        ],
      }),
    );

    const evidence = join(pkg, 'evidence.md');
    writeFileSync(
      evidence,
      [
        '# source-edit',
        'edited production source files:',
        '- src/vendors/linkedin/adapter.ts',
        'package_verify: green',
      ].join('\n'),
    );

    expect(() =>
      assertEvidenceForStep(
        'source-edit',
        [evidence],
        (p) => {
          try {
            return require('node:fs').readFileSync(p, 'utf8');
          } catch {
            return null;
          }
        },
        { projectDir, repoRoot: pkg },
      ),
    ).not.toThrow();
  });
});
