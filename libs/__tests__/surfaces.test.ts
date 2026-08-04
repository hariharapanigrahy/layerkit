import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertAllSurfacesResolved,
  assertSurfacesStepComplete,
  assertValidSurfaceInventory,
  loadSurfaceInventory,
  saveSurfaceInventory,
  type SurfaceInventory,
} from '../agent/surfaces.js';

function tempProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'layerkit-surfaces-'));
  mkdirSync(join(root, 'memory', 'runbooks'), { recursive: true });
  return root;
}

const validPending: SurfaceInventory = {
  schemaVersion: 1,
  languages: [
    { id: 'node', roots: ['server/node'], status: 'pending' },
    { id: 'python', roots: ['server/python'], status: 'pending' },
  ],
};

describe('assertValidSurfaceInventory', () => {
  it('accepts a minimal valid inventory', () => {
    expect(() => assertValidSurfaceInventory(validPending)).not.toThrow();
  });

  it('rejects empty languages, bad status, missing residual/paths', () => {
    expect(() =>
      assertValidSurfaceInventory({ schemaVersion: 2 as 1, languages: validPending.languages }),
    ).toThrow(/schemaVersion/);
    expect(() =>
      assertValidSurfaceInventory({ schemaVersion: 1, languages: [] }),
    ).toThrow(/surface_inventory_empty/);
    expect(() =>
      assertValidSurfaceInventory({
        schemaVersion: 1,
        languages: [{ id: 'node', roots: ['x'], status: 'pending' as const }, { id: 'node', roots: ['y'], status: 'pending' }],
      }),
    ).toThrow(/duplicate/);
    expect(() =>
      assertValidSurfaceInventory({
        schemaVersion: 1,
        languages: [{ id: '  ', roots: ['g'], status: 'pending' }],
      }),
    ).toThrow(/language\.id/);
    expect(() =>
      assertValidSurfaceInventory({
        schemaVersion: 1,
        languages: [{ id: 'go', roots: [], status: 'pending' }],
      }),
    ).toThrow(/roots/);
    expect(() =>
      assertValidSurfaceInventory({
        schemaVersion: 1,
        languages: [{ id: 'go', roots: ['g'], status: 'bogus' as 'pending' }],
      }),
    ).toThrow(/status must be/);
    expect(() =>
      assertValidSurfaceInventory({
        schemaVersion: 1,
        languages: [{ id: 'go', roots: ['g'], status: 'residual' }],
      }),
    ).toThrow(/residual explanation/);
    expect(() =>
      assertValidSurfaceInventory({
        schemaVersion: 1,
        languages: [{ id: 'go', roots: ['g'], status: 'updated' }],
      }),
    ).toThrow(/paths/);
  });
});

describe('surfaces load/save/resolve', () => {
  it('saves and loads inventory; surfaces step allows pending', () => {
    const projectDir = tempProject();
    try {
      const path = saveSurfaceInventory(projectDir, validPending);
      expect(path).toContain('surface-inventory.json');
      const loaded = loadSurfaceInventory(projectDir);
      expect(loaded?.languages).toHaveLength(2);

      const done = assertSurfacesStepComplete(projectDir, []);
      expect(done.languages.every((l) => l.status === 'pending')).toBe(true);

      expect(() => assertAllSurfacesResolved(projectDir)).toThrow(/surfaces_incomplete/);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it('resolves inventory from evidence JSON fence and requires all resolved at handoff', () => {
    const projectDir = tempProject();
    try {
      const inv: SurfaceInventory = {
        schemaVersion: 1,
        languages: [
          {
            id: 'node',
            roots: ['server/node'],
            status: 'updated',
            paths: ['server/node/server.js'],
          },
          {
            id: 'python',
            roots: ['server/python'],
            status: 'residual',
            residual: 'SDK gap',
          },
        ],
      };
      const body = `inventory\n\`\`\`json\n${JSON.stringify(inv)}\n\`\`\`\n`;
      const resolved = assertSurfacesStepComplete(projectDir, [body]);
      expect(resolved.languages).toHaveLength(2);
      const all = assertAllSurfacesResolved(projectDir);
      expect(all.languages.every((l) => l.status !== 'pending')).toBe(true);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it('throws when inventory missing for assertAllSurfacesResolved', () => {
    const projectDir = tempProject();
    try {
      expect(() => assertAllSurfacesResolved(projectDir)).toThrow(/surface_inventory_missing/);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it('throws on invalid JSON on disk', () => {
    const projectDir = tempProject();
    try {
      writeFileSync(join(projectDir, 'memory', 'runbooks', 'surface-inventory.json'), '{not json', 'utf8');
      expect(() => loadSurfaceInventory(projectDir)).toThrow(/surface_inventory_invalid/);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it('skips bad evidence fence and requires inventory when nothing valid', () => {
    const projectDir = tempProject();
    try {
      expect(() =>
        assertSurfacesStepComplete(projectDir, [
          '```json\n{not-json languages\n```',
          '{"languages":[]}',
        ]),
      ).toThrow(/surface_inventory_required|surface_inventory_empty/);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it('accepts whole-file JSON evidence without fence', () => {
    const projectDir = tempProject();
    try {
      const inv: SurfaceInventory = {
        schemaVersion: 1,
        languages: [{ id: 'ruby', roots: ['server/ruby'], status: 'pending' }],
      };
      const done = assertSurfacesStepComplete(projectDir, [JSON.stringify(inv)]);
      expect(done.languages[0]?.id).toBe('ruby');
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
