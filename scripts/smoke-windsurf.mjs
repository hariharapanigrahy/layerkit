import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installLayerkit } from '../dist/libs/install/install.js';

const dir = mkdtempSync(join(tmpdir(), 'layerkit-smoke-windsurf-'));
process.env.HOME = join(dir, 'home');
mkdirSync(process.env.HOME);

try {
  await installLayerkit({
    repoRoot: dir,
    platform: 'windsurf',
    hooksEnabled: true,
    mapReminders: true,
    poc: true,
  });
  console.log('smoke:windsurf ok');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
