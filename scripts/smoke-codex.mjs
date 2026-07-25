import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
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
  // No vendor catalog: install does not seed vendor maps (agent-as-developer).
  if (result.vendorSlots !== 0) {
    throw new Error(`expected 0 catalog maps, got ${result.vendorSlots}`);
  }
  if (!result.skillCount || result.skillCount < 1) {
    throw new Error(`expected skills installed, got ${result.skillCount}`);
  }
  console.log('smoke:codex ok', result.skillCount, 'skills', 'maps:', result.vendorSlots);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
