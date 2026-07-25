/**
 * Gate: project store path resolution (CLI → env → pointer → default .layerkit).
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertEqual, assertTrue } from '../../harness/assert.js';
import {
  DEFAULT_PROJECT_DIR_NAME,
  readPathPointer,
  resolveProjectDir,
  writePathPointer,
} from '../../../libs/config/project-dir.js';
import { createVendorMemoryStore } from '../../../libs/vendor-memory/store.js';

const root = mkdtempSync(join(tmpdir(), 'layerkit-project-dir-'));
try {
  // 1) Default → {root}/.layerkit
  const def = resolveProjectDir(root, { env: {} });
  assertEqual('default is .layerkit', def, join(root, DEFAULT_PROJECT_DIR_NAME));

  // 2) CLI flag wins over everything
  const customCli = resolveProjectDir(root, {
    cliProjectDir: 'integrations/lk',
    env: { LAYERKIT_PROJECT_DIR: 'from-env' },
  });
  assertEqual('cli overrides env', customCli, join(root, 'integrations/lk'));

  // 3) Env wins over pointer
  writeFileSync(
    join(root, 'layerkit.path.json'),
    JSON.stringify({ schemaVersion: 1, projectDir: 'from-pointer' }, null, 2) + '\n',
  );
  const fromEnv = resolveProjectDir(root, {
    env: { LAYERKIT_PROJECT_DIR: 'from-env' },
  });
  assertEqual('env overrides pointer', fromEnv, join(root, 'from-env'));

  // 4) Pointer used when no CLI/env
  const fromPointer = resolveProjectDir(root, { env: {} });
  assertEqual('pointer used when no cli/env', fromPointer, join(root, 'from-pointer'));

  // 5) writePathPointer for non-default
  const ptrPath = writePathPointer(root, 'custom-store');
  assertTrue('writes pointer for non-default', ptrPath === join(root, 'layerkit.path.json'));
  const ptr = readPathPointer(root);
  assertEqual('pointer projectDir', ptr?.projectDir, 'custom-store');

  // 6) Default path: writePathPointer returns null (no force)
  const noPtr = writePathPointer(root, join(root, DEFAULT_PROJECT_DIR_NAME));
  assertTrue('no pointer write for default path', noPtr === null);

  // 7) Store uses resolved projectDir and ensureDirs creates memory/privacy/flows
  const storeRoot = mkdtempSync(join(tmpdir(), 'layerkit-store-pd-'));
  try {
    const resolved = resolveProjectDir(storeRoot, { cliProjectDir: 'my-layerkit' });
    const store = createVendorMemoryStore(storeRoot, resolved);
    assertEqual('store.projectDir matches resolve', store.projectDir, resolved);
    store.initProject({ name: 'pd-eval', poc: false });
    assertTrue('maps dir', existsSync(join(store.projectDir, 'maps')));
    assertTrue('memory dir', existsSync(join(store.projectDir, 'memory')));
    assertTrue('privacy dir', existsSync(join(store.projectDir, 'privacy')));
    assertTrue('flows dir', existsSync(join(store.projectDir, 'flows')));
    assertTrue('memory INDEX', existsSync(join(store.projectDir, 'memory', 'INDEX.md')));

    // Doctor prints projectDir
    const doc = store.doctor();
    assertTrue(
      'doctor prints projectDir',
      doc.lines.some((l) => l.startsWith('projectDir:') && l.includes('my-layerkit')),
    );
  } finally {
    rmSync(storeRoot, { recursive: true, force: true });
  }

  // 8) Absolute CLI path
  const abs = join(root, 'abs-store');
  mkdirSync(abs, { recursive: true });
  assertEqual(
    'absolute cli path',
    resolveProjectDir(root, { cliProjectDir: abs, env: {} }),
    abs,
  );

  console.log('project-dir-resolve: all checks passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
