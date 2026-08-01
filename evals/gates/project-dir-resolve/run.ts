/**
 * Gate: project store path resolution (CLI → env → pointer → default .layerkit).
 * Also asserts installLayerkit honors projectDir (Issue 1 fix).
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
import { installLayerkit } from '../../../libs/install/install.js';
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

  // 7) Store uses resolved projectDir and ensureDirs creates agent-tooling dirs
  const storeRoot = mkdtempSync(join(tmpdir(), 'layerkit-store-pd-'));
  try {
    const resolved = resolveProjectDir(storeRoot, { cliProjectDir: 'my-layerkit' });
    const store = createVendorMemoryStore(storeRoot, resolved);
    assertEqual('store.projectDir matches resolve', store.projectDir, resolved);
    store.initProject({ name: 'pd-eval', poc: false });
    assertTrue('maps dir', existsSync(join(store.projectDir, 'maps')));
    assertTrue('memory dir', existsSync(join(store.projectDir, 'memory')));
    assertTrue('proposals dir', existsSync(join(store.projectDir, 'proposals')));
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

  // 9) installLayerkit honors projectDir (does not fall back to .layerkit)
  const installRoot = mkdtempSync(join(tmpdir(), 'layerkit-install-pd-'));
  try {
    const customPd = join(installRoot, 'custom-pd');
    const configPath = join(installRoot, 'home', '.layerkit', 'config.json');
    const result = await installLayerkit({
      repoRoot: installRoot,
      platform: 'openhands',
      hooksEnabled: false,
      autoMapUpdates: false,
      poc: false,
      name: 'pd-install-eval',
      projectDir: customPd,
      configPath,
    });
    assertEqual('install result.projectDir', result.projectDir, customPd);
    assertEqual('install result.configFile', result.configFile, configPath);
    assertTrue(
      'install wrote project.json under custom-pd',
      existsSync(join(customPd, 'project.json')),
    );
    assertTrue(
      'install did not create default .layerkit project',
      !existsSync(join(installRoot, DEFAULT_PROJECT_DIR_NAME, 'project.json')),
    );
    const installPtr = readPathPointer(installRoot);
    assertTrue('install wrote path pointer for non-default', installPtr !== null);
    assertTrue(
      'pointer points at custom-pd',
      installPtr?.projectDir === 'custom-pd' || installPtr?.projectDir === customPd,
    );
  } finally {
    rmSync(installRoot, { recursive: true, force: true });
  }

  console.log('project-dir-resolve: all checks passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
