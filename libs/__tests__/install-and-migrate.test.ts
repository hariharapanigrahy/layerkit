import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { VendorMapV1, VendorMapV2 } from '../domain/types.js';
import { installLayerkit } from '../install/install.js';
import { installPlatforms, isInstallPlatform, platformDisplayName } from '../install/paths.js';
import { copySkillsTo, listPackagedSkills, SKILL_NAMES } from '../install/skills.js';
import { asV2, mapSchemaVersion, migrateMapV1toV2 } from '../vendor-memory/migrate.js';

function v1(): VendorMapV1 {
  return {
    schemaVersion: 1,
    vendor: 'vendor',
    displayName: 'Vendor',
    version: '1',
    auth: { type: 'bearer' },
    endpoint: { method: 'POST', path: '/events', baseUrl: 'https://api.vendor.com' },
    intents: { purchase: { eventName: 'Purchase', staticFields: { currency: 'USD' } }, skip: { skip: true } },
    fields: [{ domain: 'order.id', vendor: 'transaction.id' }],
    documentation: [{ title: 'Docs', url: 'https://vendor.example/docs' }],
    status: 'map_complete',
    notes: 'notes',
  };
}

describe('map migration', () => {
  it('migrates v1 maps and preserves v2 maps', () => {
    const migrated = migrateMapV1toV2(v1());
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.operations.default.endpoint.path).toBe('/events');
    expect(migrated.intents.purchase?.operationId).toBe('default');
    expect(migrated.intents.purchase?.staticFields).toEqual({ currency: 'USD' });
    expect(migrated.fields).toHaveLength(1);
    expect(mapSchemaVersion(v1())).toBe(1);
    expect(mapSchemaVersion(migrated)).toBe(2);

    const existing: VendorMapV2 = { ...migrated, schemaVersion: 2 };
    expect(asV2(existing)).toBe(existing);
    expect(asV2(v1()).schemaVersion).toBe(2);

    const sparse = migrateMapV1toV2({
      ...v1(),
      schemaVersion: undefined,
      status: undefined,
      documentation: undefined,
      notes: undefined,
      intents: undefined,
      fields: undefined,
      extensionKeys: undefined,
    });
    expect(sparse.status).toBe('skeleton');
    expect(sparse.documentation).toEqual([]);
    expect(sparse.fields).toEqual([]);
    expect(sparse.intents).toEqual({});
  });
});

describe('install paths and skills', () => {
  it('recognizes platform ids and display labels', () => {
    expect(installPlatforms).toContain('devin');
    expect(installPlatforms).toContain('windsurf');
    expect(isInstallPlatform('codex')).toBe(true);
    expect(isInstallPlatform('missing')).toBe(false);
    expect(platformDisplayName('factory-droid')).toBe('Factory Droid');
    expect(platformDisplayName('windsurf')).toBe('Windsurf');
    expect(installPlatforms.map((p) => platformDisplayName(p))).toEqual(
      expect.arrayContaining([
        'Codex',
        'Claude Code',
        'Cursor',
        'GitHub Copilot CLI',
        'OpenCode',
        'OpenHands',
        'Devin',
        'Windsurf',
        'Factory Droid',
        'Antigravity',
      ]),
    );
  });

  it('lists and refreshes packaged skills; leaves non-packaged dirs', () => {
    const root = mkdtempSync(join(tmpdir(), 'layerkit-skills-unit-'));
    try {
      expect(listPackagedSkills(join(root, 'missing'))).toEqual([]);
      const skillsRoot = join(root, 'skills');
      mkdirSync(join(skillsRoot, 'layerkit-bootstrap'), { recursive: true });
      mkdirSync(join(skillsRoot, 'layerkit-source-edit-client'), { recursive: true });
      writeFileSync(join(skillsRoot, 'layerkit-bootstrap', 'SKILL.md'), 'bootstrap-v2');
      writeFileSync(join(skillsRoot, 'layerkit-source-edit-client', 'SKILL.md'), 'source-v2');
      mkdirSync(join(skillsRoot, 'not-a-skill'), { recursive: true });

      expect(listPackagedSkills(root).sort()).toEqual(['layerkit-bootstrap', 'layerkit-source-edit-client']);
      expect(SKILL_NAMES).toContain('layerkit-source-edit-client');

      const dest = join(root, 'dest');
      mkdirSync(join(dest, 'layerkit-bootstrap'), { recursive: true });
      writeFileSync(join(dest, 'layerkit-bootstrap', 'SKILL.md'), 'stale-packaged');
      mkdirSync(join(dest, 'my-custom-skill'), { recursive: true });
      writeFileSync(join(dest, 'my-custom-skill', 'SKILL.md'), 'user-owned');

      const copied = copySkillsTo(root, dest);
      expect(copied).toHaveLength(2);
      // Packaged skills always refresh from package source of truth
      expect(readFileSync(join(dest, 'layerkit-bootstrap', 'SKILL.md'), 'utf8')).toBe('bootstrap-v2');
      expect(readFileSync(join(dest, 'layerkit-source-edit-client', 'SKILL.md'), 'utf8')).toBe(
        'source-v2',
      );
      // Non-packaged skill dirs are not deleted
      expect(readFileSync(join(dest, 'my-custom-skill', 'SKILL.md'), 'utf8')).toBe('user-owned');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not write user config unless explicitly requested', async () => {
    const root = mkdtempSync(join(tmpdir(), 'layerkit-install-config-'));
    try {
      const configPath = join(root, 'home', '.layerkit', 'config.json');
      const result = await installLayerkit({
        repoRoot: root,
        platform: 'codex',
        hooksEnabled: false,
        mapReminders: false,
        poc: false,
        configPath,
      });
      expect(result.configFile).toBe(configPath);
      expect(existsSync(configPath)).toBe(false);
      expect(result.notes.join('\n')).toContain('Skipped user config write');

      await installLayerkit({
        repoRoot: root,
        platform: 'codex',
        hooksEnabled: false,
        mapReminders: false,
        poc: false,
        configPath,
        userConfig: true,
      });
      expect(existsSync(configPath)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
