import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installLayerkit } from '../dist/libs/install/install.js';

const dir = mkdtempSync(join(tmpdir(), 'layerkit-smoke-cursor-'));
const home = join(dir, 'home');
mkdirSync(home);
process.env.HOME = home;
process.env.CURSOR_HOME = join(home, '.cursor');

try {
  const result = await installLayerkit({
    repoRoot: dir,
    platform: 'cursor',
    hooksEnabled: true,
    mapReminders: true,
    poc: true,
  });
  if (!result.rules?.configFiles.length) throw new Error('expected cursor rules');
  console.log('smoke:cursor ok');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
