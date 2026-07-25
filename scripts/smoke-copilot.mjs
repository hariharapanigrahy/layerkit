import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installLayerkit } from '../dist/libs/install/install.js';

const dir = mkdtempSync(join(tmpdir(), 'layerkit-smoke-copilot-'));
process.env.HOME = join(dir, 'home');
process.env.COPILOT_HOME = join(dir, 'home', '.copilot');
mkdirSync(process.env.HOME);

try {
  await installLayerkit({
    repoRoot: dir,
    platform: 'copilot',
    hooksEnabled: true,
    autoMapUpdates: true,
    poc: true,
  });
  console.log('smoke:copilot ok');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
