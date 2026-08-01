import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { createVendorMemoryStore } from '../../libs/vendor-memory/store.js';

function runCli(args: string[], cwd: string) {
  const cliPath = join(dirname(fileURLToPath(import.meta.url)), 'main.js');
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: 'utf8',
  });
}

describe('CLI empty-state output', () => {
  it('prints guidance for map list and doctor when no maps exist', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'layerkit-empty-state-'));
    const projectDir = join(repoRoot, '.layerkit');
    const store = createVendorMemoryStore(repoRoot, projectDir);
    store.initProject({ name: 'empty-state', poc: true });

    const listResult = runCli(['map', 'list', '--project-dir', projectDir], repoRoot);
    assert.equal(listResult.status, 0);
    assert.match(listResult.stdout, /No vendor maps yet/);
    assert.match(listResult.stdout, /start from a customer contract/);
    assert.match(listResult.stdout, /layerkit heal run --vendor <v> --openapi <file>/);
    assert.match(listResult.stdout, /layerkit agent next/);

    const doctorResult = runCli(['doctor', '--project-dir', projectDir], repoRoot);
    assert.equal(doctorResult.status, 0);
    assert.match(doctorResult.stdout, /Vendor maps: 0/);
    assert.match(doctorResult.stdout, /No vendor maps yet/);
    assert.match(doctorResult.stdout, /start from a customer contract/);
  });

  it('prompts install first when no project exists', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'layerkit-no-project-'));
    const projectDir = join(repoRoot, '.layerkit');

    const listResult = runCli(['map', 'list', '--project-dir', projectDir], repoRoot);
    assert.equal(listResult.status, 0);
    assert.match(listResult.stdout, /No Layerkit project found yet\./);
    assert.match(listResult.stdout, /Next step: run layerkit install/);
    assert.doesNotMatch(listResult.stdout, /proposal write|proposal apply/);

    const doctorResult = runCli(['doctor', '--project-dir', projectDir], repoRoot);
    assert.equal(doctorResult.status, 1);
    assert.match(doctorResult.stdout, /No Layerkit project at/);
    assert.match(doctorResult.stdout, /No Layerkit project found yet\./);
    assert.match(doctorResult.stdout, /Next step: run layerkit install/);
    assert.doesNotMatch(doctorResult.stdout, /No vendor maps yet/);

    // --strict must not swallow the failed-project exit code
    const strictResult = runCli(['doctor', '--strict', '--project-dir', projectDir], repoRoot);
    assert.equal(strictResult.status, 1);
    assert.match(strictResult.stdout, /No Layerkit project at/);
    assert.match(strictResult.stdout, /Note: --strict applies with --quality/);
    assert.doesNotMatch(strictResult.stdout, /No vendor maps yet/);
  });

  it('fails map show --path when the requested map file is missing', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'layerkit-missing-map-path-'));
    const projectDir = join(repoRoot, '.layerkit');
    const store = createVendorMemoryStore(repoRoot, projectDir);
    store.initProject({ name: 'missing-map-path', poc: true });

    const result = runCli(['map', 'show', 'vendor', '--path', '--project-dir', projectDir], repoRoot);

    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /No map for vendor at .*\.layerkit\/maps\/vendor\.json/);
    assert.match(result.stderr, /Use map list; author via proposal pipeline/);
  });
});
