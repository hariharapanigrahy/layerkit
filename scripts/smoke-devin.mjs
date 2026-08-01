import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installLayerkit } from '../dist/libs/install/install.js';

const dir = mkdtempSync(join(tmpdir(), 'layerkit-smoke-devin-'));
process.env.HOME = join(dir, 'home');
mkdirSync(process.env.HOME);

try {
  await installLayerkit({
    repoRoot: dir,
    platform: 'devin',
    hooksEnabled: false,
    mapReminders: false,
    poc: true,
  });
  console.log('smoke:devin ok');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
