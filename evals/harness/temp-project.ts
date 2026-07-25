/**
 * Isolated temp project for eval gates (mkdtemp + vendor memory store).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createVendorMemoryStore } from '../../libs/vendor-memory/store.js';
import type { TempProjectContext } from './types.js';

export interface WithTempProjectOpts {
  /** Init project name (default: eval) */
  name?: string;
  /** Seed POC empty vendor maps (default: false) */
  poc?: boolean;
  /** Prefix for mkdtemp (default: layerkit-eval-) */
  prefix?: string;
}

/**
 * Create an isolated temp root with VendorMemoryStore, run fn, always cleanup.
 */
export async function withTempProject(
  fn: (ctx: TempProjectContext) => void | Promise<void>,
  opts?: WithTempProjectOpts,
): Promise<void> {
  const prefix = opts?.prefix ?? 'layerkit-eval-';
  const root = mkdtempSync(join(tmpdir(), prefix));
  try {
    const store = createVendorMemoryStore(root);
    store.initProject({
      name: opts?.name ?? 'eval',
      poc: opts?.poc ?? false,
    });
    const ctx: TempProjectContext = {
      root,
      projectDir: store.projectDir,
      store,
    };
    await fn(ctx);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * Sync helper for gates that prefer non-async style.
 * Caller must call dispose() (or use try/finally).
 */
export function createTempProject(opts?: WithTempProjectOpts): TempProjectContext & {
  dispose: () => void;
} {
  const prefix = opts?.prefix ?? 'layerkit-eval-';
  const root = mkdtempSync(join(tmpdir(), prefix));
  const store = createVendorMemoryStore(root);
  store.initProject({
    name: opts?.name ?? 'eval',
    poc: opts?.poc ?? false,
  });
  return {
    root,
    projectDir: store.projectDir,
    store,
    dispose: () => {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
