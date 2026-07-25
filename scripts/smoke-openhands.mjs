import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installLayerkit } from '../dist/libs/install/install.js';

const dir = mkdtempSync(join(tmpdir(), 'layerkit-smoke-openhands-'));
process.env.HOME = join(dir, 'home');
mkdirSync(process.env.HOME);

try {
  const result = await installLayerkit({
    repoRoot: dir,
    platform: 'openhands',
    hooksEnabled: true,
    autoMapUpdates: true,
    poc: true,
  });
  if (!result.skills.some((s) => s.includes('.agents'))) throw new Error('openhands skills should be repo-local');
  console.log('smoke:openhands ok');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
