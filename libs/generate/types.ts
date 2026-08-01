/** Topology of existing integration code + plan of creates/patches. */
export type IntegrationLanguage = 'java' | 'typescript' | 'unknown';

export type TopologyRole =
  | 'facade'
  | 'adapter'
  | 'registry'
  | 'router'
  | 'port'
  | 'client'
  | 'config'
  | 'test'
  | 'other';

export interface TopologyFile {
  /** Repo-relative path */
  path: string;
  role: TopologyRole;
  /** Simple class/interface name when known */
  symbol?: string;
  package?: string;
  /** Why this file was classified */
  evidence: string;
}

export interface IntegrationTopology {
  schemaVersion: 1;
  language: IntegrationLanguage;
  /** integrate when production entrypoints exist; none otherwise */
  recommendedMode: 'integrate' | 'none';
  reason: string;
  /** Absolute or repo-relative module root (src parent or configured) */
  moduleRoot: string;
  /** Best-effort base package */
  package?: string;
  /** Existing production files by role */
  entrypoints: TopologyFile[];
  /** How a senior eng would add a vendor in this tree */
  addVendorPattern: string;
  /** DI / HTTP / test signals (from filenames + content) */
  di?: string;
  http?: string;
  test?: string;
  /** Build files found (pom.xml, package.json, …) */
  buildFiles: string[];
  scannedAt: string;
  scanRoot: string;
}

export type PlanActionKind = 'create' | 'patch' | 'test' | 'skip';

export interface PlanAction {
  kind: PlanActionKind;
  /** Repo-relative target path */
  path: string;
  vendor?: string;
  reason: string;
  /**
   * Full file body for kind=create (and optional test stubs).
   * Never overwrite existing files unless apply --force.
   */
  content?: string;
  /** Text anchors / registration sites for kind=patch */
  anchors?: string[];
  /** Human/agent instructions for the edit */
  instructions: string;
}

export interface IntegrationPlan {
  schemaVersion: 1;
  mode: 'integrate';
  resolvedFrom: 'integrate' | 'topology' | 'project' | 'error';
  topology: IntegrationTopology;
  vendors: string[];
  actions: PlanAction[];
  /** Paths agents must not touch */
  denyEdit: string[];
  createdAt: string;
  /** One-line summary for CLI */
  summary: string;
}

export interface ResolveGenerateModeResult {
  mode: 'integrate';
  /** False when no production entrypoints */
  ok: boolean;
  resolvedFrom: 'integrate' | 'topology' | 'project' | 'error';
  reason: string;
  topology: IntegrationTopology;
}
