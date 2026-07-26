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
    assert.match(listResult.stdout, /No vendor maps found yet/);
    assert.match(listResult.stdout, /zero maps is normal/);
    assert.match(listResult.stdout, /layerkit research openapi <file>/);
    assert.match(listResult.stdout, /proposal write map-from-openapi/);
    assert.match(listResult.stdout, /layerkit proposal apply/);

    const doctorResult = runCli(['doctor', '--project-dir', projectDir], repoRoot);
    assert.equal(doctorResult.status, 0);
    assert.match(doctorResult.stdout, /Vendor maps: 0/);
    assert.match(doctorResult.stdout, /No vendor maps found yet/);
    assert.match(doctorResult.stdout, /Next commands/);
  });

  it('prompts install first when no project exists', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'layerkit-no-project-'));
    const projectDir = join(repoRoot, '.layerkit');

    const listResult = runCli(['map', 'list', '--project-dir', projectDir], repoRoot);
    assert.equal(listResult.status, 0);
    assert.match(listResult.stdout, /No Layerkit project found yet\./);
    assert.match(listResult.stdout, /Next step: run layerkit install/);
    assert.doesNotMatch(listResult.stdout, /research openapi|proposal write|proposal apply/);

    const doctorResult = runCli(['doctor', '--project-dir', projectDir], repoRoot);
    assert.equal(doctorResult.status, 1);
    assert.match(doctorResult.stdout, /No Layerkit project at/);
    assert.match(doctorResult.stdout, /No Layerkit project found yet\./);
    assert.match(doctorResult.stdout, /Next step: run layerkit install/);
    assert.doesNotMatch(doctorResult.stdout, /No vendor maps found yet/);

    // --strict must not swallow the failed-project exit code
    const strictResult = runCli(['doctor', '--strict', '--project-dir', projectDir], repoRoot);
    assert.equal(strictResult.status, 1);
    assert.match(strictResult.stdout, /No Layerkit project at/);
    assert.match(strictResult.stdout, /Note: --strict applies with --quality/);
    assert.doesNotMatch(strictResult.stdout, /No vendor maps found yet/);
  });
});
