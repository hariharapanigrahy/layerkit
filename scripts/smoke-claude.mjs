import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installLayerkit } from '../dist/libs/install/install.js';

const dir = mkdtempSync(join(tmpdir(), 'layerkit-smoke-claude-'));
process.env.HOME = join(dir, 'home');
mkdirSync(process.env.HOME);

try {
  await installLayerkit({
    repoRoot: dir,
    platform: 'claude',
    hooksEnabled: true,
    autoMapUpdates: true,
    poc: true,
  });
  console.log('smoke:claude ok');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
