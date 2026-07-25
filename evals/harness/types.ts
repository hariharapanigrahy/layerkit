/**
 * Eval harness types — production merge bar surface.
 */

export interface GateCheckResult {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface GateResult {
  id: string;
  ok: boolean;
  /**
   * Parsed from gate PASS/FAIL stdout lines by the runner.
   * Gate success is still defined by child exit code (0 = ok).
   */
  checks: GateCheckResult[];
  ms: number;
  error?: string;
}

/** Metadata from evals/gates/<id>/case.json */
export interface CaseMeta {
  id: string;
  suite: 'ci' | 'all' | 'nightly' | string;
  title: string;
  owners?: string[];
  featurePr?: string;
  fixtures?: string[];
  tags?: string[];
}

export interface SuitesConfig {
  ci: string[];
  all: string[];
  nightly: string[];
  [suite: string]: string[];
}

export interface TempProjectContext {
  /** Isolated repo root (mkdtemp) */
  root: string;
  /** Resolved project store directory (default root/.layerkit) */
  projectDir: string;
  store: import('../../libs/vendor-memory/store.js').VendorMemoryStore;
}
