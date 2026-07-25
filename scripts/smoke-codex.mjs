import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installLayerkit } from '../dist/libs/install/install.js';

const dir = mkdtempSync(join(tmpdir(), 'layerkit-smoke-codex-'));
const home = join(dir, 'home');
mkdirSync(home);
process.env.HOME = home;

try {
  const result = await installLayerkit({
    repoRoot: dir,
    platform: 'codex',
    hooksEnabled: true,
    autoMapUpdates: true,
    poc: true,
  });
  if (result.platform !== 'codex') throw new Error('platform');
  if (!result.projectDir || !existsSync(result.projectDir)) {
    throw new Error(`expected project store at projectDir, got ${result.projectDir}`);
  }
  if (!result.skillCount || result.skillCount < 1) {
    throw new Error(`expected skills installed, got ${result.skillCount}`);
  }
  // Install must not seed vendor maps — agents author them per project.
  console.log('smoke:codex ok', result.skillCount, 'skills', 'store:', result.projectDir);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
