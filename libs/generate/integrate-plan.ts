/**
 * Build IntegrationPlans from topology + vendor maps.
 * Plans are agent-facing context; semantic source edits are skill-owned.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { GenerateConfig, VendorMap } from '../domain/types.js';
import type { StyleProfile } from '../agent/style-profile.js';
import { scanIntegrationTopology } from './scan-topology.js';
import type {
  IntegrationPlan,
  IntegrationTopology,
  PlanAction,
  ResolveGenerateModeResult,
} from './types.js';

export interface BuildIntegratePlanOptions {
  repoRoot: string;
  /** Scan root (defaults to moduleRoot or repoRoot) */
  scanRoot?: string;
  projectGenerate?: GenerateConfig;
  maps: VendorMap[];
  /** Limit plan to these vendors (default: all filled maps) */
  vendors?: string[];
  style?: StyleProfile | Partial<StyleProfile>;
  mode?: string;
  denyEdit?: string[];
  /** Build a plan even if topology has few entrypoints */
  forceThin?: boolean;
  /**
   * Optional drift notes by vendor id (from contract heal).
   * Injected into patch/create instructions when present.
   */
  driftByVendor?: Record<
    string,
    { summary: string; severity: string; items: Array<{ kind: string; severity: string; detail: string; path?: string }> }
  >;
}

/** Require production entrypoints unless forceThin. */
export function resolveGenerateMode(opts: {
  mode?: string;
  projectMode?: string;
  topology: IntegrationTopology;
  forceThin?: boolean;
}): ResolveGenerateModeResult {
  if (opts.topology.recommendedMode === 'integrate') {
    return {
      mode: 'integrate',
      ok: true,
      resolvedFrom: 'topology',
      reason: opts.topology.reason,
      topology: opts.topology,
    };
  }

  if (opts.forceThin) {
    return {
      mode: 'integrate',
      ok: true,
      resolvedFrom: 'integrate',
      reason: 'Thin topology — confirm --module-root and entrypoints.',
      topology: opts.topology,
    };
  }

  return {
    mode: 'integrate',
    ok: false,
    resolvedFrom: 'error',
    reason: `${opts.topology.reason} Use --module-root <production-module>.`,
    topology: opts.topology,
  };
}

/**
 * Scan + build integrate plan for filled vendor maps.
 */
export function buildIntegratePlan(opts: BuildIntegratePlanOptions): {
  resolution: ResolveGenerateModeResult;
  plan: IntegrationPlan | null;
} {
  const repoRoot = resolve(opts.repoRoot);
  const moduleRootCfg = opts.projectGenerate?.moduleRoot;
  const scanRoot = resolve(opts.scanRoot ?? (moduleRootCfg ? join(repoRoot, moduleRootCfg) : repoRoot));

  const topology = scanIntegrationTopology({
    root: scanRoot,
    moduleRoot: moduleRootCfg ? resolve(repoRoot, moduleRootCfg) : undefined,
  });

  // Prefer configured package / style package over inferred
  if (opts.projectGenerate?.package?.trim()) {
    topology.package = opts.projectGenerate.package.trim();
  } else if (opts.style?.package && looksLikePackage(opts.style.package)) {
    topology.package = extractPackageToken(opts.style.package);
  }

  const resolution = resolveGenerateMode({
    mode: opts.mode,
    projectMode: opts.projectGenerate?.mode,
    topology,
    forceThin: opts.forceThin,
  });

  if (!resolution.ok) {
    return { resolution, plan: null };
  }

  const filled = opts.maps.filter((m) => m.fields.length || Object.keys(m.intents).length);
  let targets = filled;
  if (opts.vendors?.length) {
    const set = new Set(opts.vendors);
    targets = filled.filter((m) => set.has(m.vendor));
  }

  const denyEdit = [
    ...(opts.projectGenerate?.denyEdit ?? []),
    ...(opts.denyEdit ?? []),
    '**/.env*',
    '**/secrets/**',
    '**/*.pem',
    '**/*keystore*',
  ];

  const actions: PlanAction[] = [];
  if (targets.length === 0) {
    actions.push({
      kind: 'skip',
      path: '(none)',
      reason: 'No filled vendor maps — agent must research/apply maps before integrate',
      instructions:
        'Use layerkit-research-vendor to author/apply a cited map proposal, then re-run layerkit generate.',
    });
  } else {
    for (const map of targets) {
      actions.push(
        ...planActionsForVendor(map, topology, repoRoot, opts.driftByVendor?.[map.vendor]),
      );
    }
  }

  // Registry / router patches once per plan
  const registry = topology.entrypoints.find((e) => e.role === 'registry');
  if (registry && targets.length) {
    actions.push({
      kind: 'patch',
      path: toRepoRel(repoRoot, scanRoot, registry.path),
      reason: 'Register new vendor adapter(s) in existing registry',
      anchors: [registry.symbol ?? 'register', 'put', 'Map'].filter(Boolean),
      instructions: [
        `Open ${registry.path}.`,
        `Register vendors: ${targets.map((m) => m.vendor).join(', ')}.`,
        `Follow existing registration style (${topology.di ?? 'same as siblings'}).`,
        'Do not create a second registry or parallel facade.',
      ].join(' '),
    });
  }

  const router = topology.entrypoints.find((e) => e.role === 'router');
  if (router && targets.length) {
    actions.push({
      kind: 'patch',
      path: toRepoRel(repoRoot, scanRoot, router.path),
      reason: 'Wire intents to vendors if routing is code-driven',
      anchors: [router.symbol ?? 'route', 'dispatch'],
      instructions: [
        `Open ${router.path}.`,
        'Only add routes for intents present on the vendor maps.',
        'Match existing routing table / switch style.',
      ].join(' '),
    });
  }

  const facade = topology.entrypoints.find((e) => e.role === 'facade' || e.role === 'client');
  if (facade) {
    actions.push({
      kind: 'skip',
      path: toRepoRel(repoRoot, scanRoot, facade.path),
      reason: 'Preserve existing facade entry API',
      instructions:
        'Do not generate a parallel DataLayerClient. Extend adapters/registry only unless facade lacks a needed extension point (then minimal patch).',
    });
  }

  const plan: IntegrationPlan = {
    schemaVersion: 1,
    mode: 'integrate',
    resolvedFrom: resolution.resolvedFrom,
    topology,
    vendors: targets.map((m) => m.vendor),
    actions,
    denyEdit,
    createdAt: new Date().toISOString(),
    summary:
      targets.length === 0
        ? 'Integrate mode: no filled maps yet'
        : `Integrate ${targets.length} vendor(s) into ${topology.moduleRoot} (${actions.filter((a) => a.kind === 'create').length} create, ${actions.filter((a) => a.kind === 'patch').length} patch)`,
  };

  return { resolution, plan };
}

type DriftNotes = {
  summary: string;
  severity: string;
  items: Array<{ kind: string; severity: string; detail: string; path?: string }>;
};

function planActionsForVendor(
  map: VendorMap,
  topology: IntegrationTopology,
  repoRoot: string,
  drift?: DriftNotes,
): PlanAction[] {
  const actions: PlanAction[] = [];
  const vendor = map.vendor;
  const pascal = toPascal(vendor);
  const driftBlock = formatDriftInstructions(drift);
  const existingAdapter = topology.entrypoints.find(
    (e) =>
      e.role === 'adapter' &&
      (e.path.toLowerCase().includes(vendor.toLowerCase()) ||
        (e.symbol && e.symbol.toLowerCase().includes(vendor.toLowerCase().replace(/_/g, '')))),
  );

  if (existingAdapter) {
    actions.push({
      kind: 'patch',
      path: existingAdapter.path,
      vendor,
      reason: drift
        ? `Heal adapter for ${vendor}: ${drift.summary}`
        : `Update existing adapter for ${vendor} from applied map`,
      anchors: [existingAdapter.symbol ?? pascal, 'send', 'map', 'buildRequest', 'buildPayload'].filter(
        Boolean,
      ),
      instructions: [
        `Update ${existingAdapter.path} to match applied map for ${vendor}.`,
        `Endpoint: ${map.endpoint?.method ?? '?'} ${map.endpoint?.baseUrl ?? ''}${map.endpoint?.path ?? ''}`,
        `Intents: ${Object.keys(map.intents ?? {}).join(', ') || '(none)'}`,
        `Fields: ${(map.fields ?? []).map((f) => f.vendor).join(', ') || '(none)'}`,
        driftBlock,
        `Pattern: ${topology.addVendorPattern}`,
        'The AI agent must inspect the existing interface/datalayer and edit this file directly; this plan does not synthesize mapper code.',
      ]
        .filter(Boolean)
        .join(' '),
    });
  } else {
    const sibling = topology.entrypoints.find((e) => e.role === 'adapter');
    const adapterPath = guessNewAdapterPath(topology, vendor, pascal, sibling);

    actions.push({
      kind: 'create',
      path: adapterPath,
      vendor,
      reason: drift
        ? `New adapter for ${vendor} after contract update: ${drift.summary}`
        : `New adapter for ${vendor} beside existing integration code`,
      instructions: [
        `Create ${adapterPath} implementing the same interface/pattern as sibling adapters.`,
        sibling ? `Mirror structure of ${sibling.path}.` : 'Use VendorPort/Adapter style from topology.',
        `Wire endpoint ${map.endpoint?.method ?? 'POST'} ${map.endpoint?.path ?? ''}.`,
        driftBlock,
        'Register in registry (see patch action).',
        'Do not use a generated stub as production code; author the adapter from the real client patterns.',
      ]
        .filter(Boolean)
        .join(' '),
    });
  }

  const testPath = guessTestPath(topology, vendor, pascal);
  actions.push({
    kind: 'test',
    path: testPath,
    vendor,
    reason: `Tests for ${vendor} matching existing test stack`,
    instructions: [
      `Add tests at ${testPath} (or next to existing vendor tests).`,
      `Stack: ${topology.test ?? 'match project'}.`,
      drift
        ? `Cover new/changed fields from contract drift (severity=${drift.severity}).`
        : 'Cover map field projection + error mapping; mock HTTP.',
    ].join(' '),
  });

  void repoRoot;
  return actions;
}

function formatDriftInstructions(drift?: DriftNotes): string {
  if (!drift?.items?.length) return '';
  const lines = drift.items
    .slice(0, 20)
    .map((i) => `${i.severity}:${i.kind}${i.path ? `:${i.path}` : ''}`)
    .join('; ');
  return `Contract drift (${drift.severity}): ${lines}`;
}

function guessNewAdapterPath(
  topology: IntegrationTopology,
  vendor: string,
  pascal: string,
  sibling?: { path: string },
): string {
  if (sibling) {
    const dir = sibling.path.includes('/')
      ? sibling.path.slice(0, sibling.path.lastIndexOf('/'))
      : '';
    const ext = sibling.path.endsWith('.ts') ? '.ts' : '.java';
    const name =
      ext === '.ts' ? `${vendor.replace(/_/g, '-')}Adapter${ext}` : `${pascal}Adapter${ext}`;
    return dir ? `${dir}/${name}` : name;
  }
  const pkgPath = (topology.package ?? 'com.example.integrations').replace(/\./g, '/');
  if (topology.language === 'typescript') {
    return `src/${vendor}/adapter.ts`;
  }
  // moduleRoot-relative preferred in apply; store repo-relative-ish path
  const mod = topology.moduleRoot;
  const base = mod.includes('src/main/java')
    ? join(mod, pkgPath, 'vendor')
    : join(mod, 'src/main/java', pkgPath, 'vendor');
  // Use forward slashes for plan portability
  return `${toPosix(relative(topology.scanRoot, base))}/${pascal}Adapter.java`.replace(
    /^\.\//,
    '',
  );
}

function guessTestPath(
  topology: IntegrationTopology,
  vendor: string,
  pascal: string,
): string {
  const siblingTest = topology.entrypoints.find((e) => e.role === 'test');
  if (siblingTest) {
    const dir = siblingTest.path.includes('/')
      ? siblingTest.path.slice(0, siblingTest.path.lastIndexOf('/'))
      : '';
    const ext = siblingTest.path.endsWith('.ts') ? '.ts' : '.java';
    const name = ext === '.ts' ? `${vendor}.test${ext}` : `${pascal}AdapterTest${ext}`;
    return dir ? `${dir}/${name}` : name;
  }
  const pkgPath = (topology.package ?? 'com.example.integrations').replace(/\./g, '/');
  if (topology.language === 'typescript') return `src/${vendor}/adapter.test.ts`;
  return `src/test/java/${pkgPath}/vendor/${pascal}AdapterTest.java`;
}

/**
 * Format plan as agent-facing markdown.
 */
export function formatIntegratePlanMarkdown(plan: IntegrationPlan): string {
  const lines: string[] = [
    '# Layerkit integration plan',
    '',
    plan.summary,
    '',
    `Resolved from: \`${plan.resolvedFrom}\` → **integrate**`,
    `Module: \`${plan.topology.moduleRoot}\``,
    `Language: ${plan.topology.language}`,
    `Package: ${plan.topology.package ?? '(infer from siblings)'}`,
    `Add-vendor pattern: ${plan.topology.addVendorPattern}`,
    '',
    '## Topology entrypoints',
    '',
  ];
  if (!plan.topology.entrypoints.length) {
    lines.push('_None classified — confirm moduleRoot and re-scan._', '');
  } else {
    for (const e of plan.topology.entrypoints.slice(0, 40)) {
      lines.push(`- **${e.role}** \`${e.path}\`${e.symbol ? ` (\`${e.symbol}\`)` : ''} — ${e.evidence}`);
    }
    lines.push('');
  }
  lines.push('## Actions', '');
  for (const [i, a] of plan.actions.entries()) {
    lines.push(`### ${i + 1}. ${a.kind.toUpperCase()} \`${a.path}\``);
    if (a.vendor) lines.push(`- vendor: \`${a.vendor}\``);
    lines.push(`- reason: ${a.reason}`);
    if (a.anchors?.length) lines.push(`- anchors: ${a.anchors.join(', ')}`);
    lines.push(`- instructions: ${a.instructions}`);
    lines.push('');
  }
  lines.push('## Deny edit', '');
  for (const d of plan.denyEdit) lines.push(`- ${d}`);
  lines.push(
    '',
    '## Rules',
    '',
    '- Modify **production** datalayer code listed in this plan.',
    '- Maps/processors stay under `{projectDir}`; code stays in the app module.',
    '- No invented endpoints/fields — only applied map evidence.',
    '- Prefer create adapter + patch registry over new facade.',
    '',
  );
  return lines.join('\n');
}

/**
 * Persist plan JSON + markdown under projectDir/out/
 */
export function writeIntegratePlanArtifacts(
  projectDir: string,
  plan: IntegrationPlan,
): { jsonPath: string; mdPath: string } {
  const outDir = join(projectDir, 'out');
  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, 'integrate-plan.json');
  const mdPath = join(outDir, 'INTEGRATE.md');
  writeFileSync(jsonPath, JSON.stringify(plan, null, 2) + '\n', 'utf8');
  writeFileSync(mdPath, formatIntegratePlanMarkdown(plan), 'utf8');
  return { jsonPath, mdPath };
}

export function loadIntegratePlan(projectDir: string): IntegrationPlan | null {
  const p = join(projectDir, 'out', 'integrate-plan.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as IntegrationPlan;
  } catch {
    return null;
  }
}

function toRepoRel(repoRoot: string, scanRoot: string, pathFromScan: string): string {
  const abs = resolve(scanRoot, pathFromScan);
  try {
    return relative(repoRoot, abs).split(sep).join('/') || pathFromScan;
  } catch {
    return pathFromScan;
  }
}

function toPascal(vendor: string): string {
  return vendor
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
    .join('');
}

function looksLikePackage(s: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)+/.test(s.trim());
}

function extractPackageToken(s: string): string {
  const m = s.trim().match(
    /\b([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)+)\b/,
  );
  return m?.[1] ?? s.trim();
}

function toPosix(p: string): string {
  return p.split(sep).join('/');
}
