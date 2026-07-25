/**
 * Isolated temp project for eval gates (mkdtemp + vendor memory store).
 * Always cleans up on success, thrown errors, and process.exit (exit hook).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createVendorMemoryStore } from '../../libs/vendor-memory/store.js';
import type { TempProjectContext } from './types.js';

export interface WithTempProjectOpts {
  /** Init project name (default: eval) */
  name?: string;
  /**
   * Seed POC empty vendor maps (default: false).
   * Use `poc: true` when the gate should exercise apply-over-install-poc (e.g. sample-meta-map-apply).
   */
  poc?: boolean;
  /** Prefix for mkdtemp (default: layerkit-eval-) */
  prefix?: string;
}

function removeTempRoot(root: string): void {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

/**
 * Create an isolated temp root with VendorMemoryStore, run fn, always cleanup.
 * Registers an `exit` listener so cleanup still runs if something calls process.exit.
 */
export async function withTempProject(
  fn: (ctx: TempProjectContext) => void | Promise<void>,
  opts?: WithTempProjectOpts,
): Promise<void> {
  const prefix = opts?.prefix ?? 'layerkit-eval-';
  const root = mkdtempSync(join(tmpdir(), prefix));
  const onExit = (): void => {
    removeTempRoot(root);
  };
  process.once('exit', onExit);
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
    process.removeListener('exit', onExit);
    removeTempRoot(root);
  }
}

/**
 * Sync helper for gates that prefer non-async style.
 * Caller must call dispose() (or use try/finally). Also registers exit cleanup.
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
  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    process.removeListener('exit', onExit);
    removeTempRoot(root);
  };
  const onExit = (): void => {
    dispose();
  };
  process.once('exit', onExit);
  return {
    root,
    projectDir: store.projectDir,
    store,
    dispose,
  };
}
