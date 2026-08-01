/**
 * Build and apply IntegrationPlans from topology + vendor maps.
 * Creates next to existing adapters; patches are instructional with optional --apply for creates.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
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
   * Injected into patch/create instructions and patch content when present.
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
      reason: 'No filled vendor maps — research/apply maps before integrate',
      instructions:
        'Run layerkit research fill --vendor … --openapi … → proposal apply, then re-run layerkit generate.',
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
  const pkg = topology.package ?? 'com.example.integrations';
  const driftBlock = formatDriftInstructions(drift);
  const existingAdapter = topology.entrypoints.find(
    (e) =>
      e.role === 'adapter' &&
      (e.path.toLowerCase().includes(vendor.toLowerCase()) ||
        (e.symbol && e.symbol.toLowerCase().includes(vendor.toLowerCase().replace(/_/g, '')))),
  );

  if (existingAdapter) {
    const absExisting = resolve(topology.scanRoot, existingAdapter.path);
    let existingSrc: string | undefined;
    try {
      if (existsSync(absExisting)) existingSrc = readFileSync(absExisting, 'utf8');
    } catch {
      existingSrc = undefined;
    }
    const content =
      topology.language === 'typescript'
        ? tsAdapterStub(vendor, map, existingAdapter.path, drift)
        : javaAdapterFromExistingOrStub(
            pkg,
            pascal,
            vendor,
            map,
            topology,
            existingAdapter,
            existingSrc,
            drift,
          );

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
      content,
      instructions: [
        `Update ${existingAdapter.path} to match applied map for ${vendor}.`,
        `Endpoint: ${map.endpoint?.method ?? '?'} ${map.endpoint?.baseUrl ?? ''}${map.endpoint?.path ?? ''}`,
        `Intents: ${Object.keys(map.intents ?? {}).join(', ') || '(none)'}`,
        `Fields: ${(map.fields ?? []).map((f) => f.vendor).join(', ') || '(none)'}`,
        driftBlock,
        `Pattern: ${topology.addVendorPattern}`,
        content
          ? 'Proposed full file body is in plan action content (also under out/pr/…).'
          : 'Implement field projection like sibling adapters.',
      ]
        .filter(Boolean)
        .join(' '),
    });
  } else {
    const sibling = topology.entrypoints.find((e) => e.role === 'adapter');
    const adapterPath = guessNewAdapterPath(topology, vendor, pascal, sibling);
    const content =
      topology.language === 'typescript'
        ? tsAdapterStub(vendor, map, sibling?.path, drift)
        : javaAdapterStub(pkg, pascal, vendor, map, topology, sibling, drift);

    actions.push({
      kind: 'create',
      path: adapterPath,
      vendor,
      reason: drift
        ? `New adapter for ${vendor} after contract update: ${drift.summary}`
        : `New adapter for ${vendor} beside existing integration code`,
      content,
      instructions: [
        `Create ${adapterPath} implementing the same interface/pattern as sibling adapters.`,
        sibling ? `Mirror structure of ${sibling.path}.` : 'Use VendorPort/Adapter style from topology.',
        `Wire endpoint ${map.endpoint?.method ?? 'POST'} ${map.endpoint?.path ?? ''}.`,
        driftBlock,
        'Register in registry (see patch action).',
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
    content:
      topology.language === 'typescript'
        ? undefined
        : javaTestStub(pkg, pascal, vendor, topology, map),
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

function fieldMappingLines(map: VendorMap, drift?: DriftNotes): string {
  const changed = new Set(
    (drift?.items ?? [])
      .filter((i) => i.path && (i.kind === 'field_added' || i.kind === 'field_removed' || i.kind === 'field_required_changed'))
      .map((i) => i.path!),
  );
  return (map.fields ?? [])
    .map((f) => {
      const mark = changed.has(f.vendor) ? ' // contract-change' : '';
      return `    // ${f.domain} -> ${f.vendor}${f.optional ? ' (optional)' : ''}${mark}`;
    })
    .join('\n');
}

function javaAdapterStub(
  pkg: string,
  pascal: string,
  vendor: string,
  map: VendorMap,
  topology: IntegrationTopology,
  sibling?: { path: string; symbol?: string },
  drift?: DriftNotes,
): string {
  const iface =
    topology.entrypoints.find((e) => e.role === 'port')?.symbol ??
    topology.entrypoints.find((e) => e.role === 'adapter' && /interface/i.test(e.evidence))
      ?.symbol ??
    'VendorAdapter';
  const method = map.endpoint?.method ?? 'POST';
  const path = map.endpoint?.path ?? '/';
  const baseUrl = map.endpoint?.baseUrl ?? '';
  const mappings = fieldMappingLines(map, drift);
  const driftNote = drift ? ` * Drift: ${drift.summary}\n` : '';
  return `package ${pkg}.vendor;

/**
 * Layerkit integrate: ${vendor}.
 * Sibling: ${sibling?.path ?? '(none)'}
 * Endpoint: ${method} ${baseUrl}${path}
 * Intents: ${Object.keys(map.intents ?? {}).join(', ') || 'none'}
${driftNote} * HTTP: ${topology.http ?? 'project default'}; DI: ${topology.di ?? 'project default'}.
 */
public class ${pascal}Adapter implements ${iface} {
  public static final String VENDOR_ID = "${vendor}";
  public static final String ENDPOINT = "${method} ${baseUrl}${path}";

  // TODO: inject HTTP client / config like sibling adapters

  public String vendorId() {
    return VENDOR_ID;
  }

  /**
   * Map domain event fields to vendor payload (applied map rows only).
   */
  public java.util.Map<String, Object> buildPayload(java.util.Map<String, Object> domain) {
    java.util.Map<String, Object> body = new java.util.LinkedHashMap<>();
${mappings || '    // (no field rows on map)'}
    // TODO: put domain values into body keys above; do not invent keys
    return body;
  }

  public void send(String intent, String jsonBody) throws Exception {
    // TODO: POST ENDPOINT with jsonBody using project HTTP client
  }
}
`;
}

/** Prefer regenerating adapter body from map; keep package/imports hints from existing source. */
function javaAdapterFromExistingOrStub(
  pkg: string,
  pascal: string,
  vendor: string,
  map: VendorMap,
  topology: IntegrationTopology,
  existing: { path: string; symbol?: string },
  existingSrc: string | undefined,
  drift?: DriftNotes,
): string {
  const base = javaAdapterStub(pkg, pascal, vendor, map, topology, existing, drift);
  if (!existingSrc) return base;
  // Preserve OkHttp (or similar) dependency pattern when sibling uses it
  if (/OkHttpClient/i.test(existingSrc) && !/OkHttpClient/i.test(base)) {
    return base
      .replace(
        'public class ',
        'import okhttp3.OkHttpClient;\n\npublic class ',
      )
      .replace(
        '// TODO: inject HTTP client / config like sibling adapters',
        'private final OkHttpClient http;\n\n  public ' +
          pascal +
          'Adapter(OkHttpClient http) {\n    this.http = http;\n  }',
      );
  }
  return base;
}

function javaTestStub(
  pkg: string,
  pascal: string,
  vendor: string,
  topology: IntegrationTopology,
  map?: VendorMap,
): string {
  const fieldCount = map?.fields?.length ?? 0;
  return `package ${pkg}.vendor;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Layerkit integrate tests for ${vendor}.
 * Stack: ${topology.test ?? 'JUnit 5'}
 * Map fields: ${fieldCount}
 */
class ${pascal}AdapterTest {
  @Test
  void vendorId_isStable() {
    ${pascal}Adapter adapter = new ${pascal}Adapter${/OkHttp/i.test(topology.http ?? '') ? '(null)' : '()'};
    assertEquals("${vendor}", adapter.vendorId());
  }

  @Test
  void buildPayload_hasMapKeys() {
    ${pascal}Adapter adapter = new ${pascal}Adapter${/OkHttp/i.test(topology.http ?? '') ? '(null)' : '()'};
    java.util.Map<String, Object> body = adapter.buildPayload(java.util.Map.of());
    assertNotNull(body);
  }
}
`;
}

function tsAdapterStub(
  vendor: string,
  map: VendorMap,
  siblingPath?: string,
  drift?: DriftNotes,
): string {
  const fields = (map.fields ?? [])
    .map((f) => `  // ${f.domain} -> ${f.vendor}`)
    .join('\n');
  const driftLine = drift ? `// Drift: ${drift.summary}\n` : '';
  return `/**
 * Layerkit integrate: ${vendor} adapter.
 * Sibling: ${siblingPath ?? '(none)'}
 * Endpoint: ${map.endpoint?.method ?? 'POST'} ${map.endpoint?.path ?? ''}
 */
${driftLine}export const vendorId = ${JSON.stringify(vendor)} as const;

export function buildPayload(domain: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
${fields || '  // no fields'}
  return body;
}

export async function send(/* event, ctx */): Promise<void> {
  // TODO: implement with existing HTTP client
  throw new Error('Not implemented: ${vendor}');
}
`;
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

export interface ApplyIntegratePlanResult {
  written: string[];
  skipped: string[];
  errors: string[];
}

export interface ApplyIntegratePlanOptions {
  plan: IntegrationPlan;
  repoRoot: string;
  /** Write create/test content when missing */
  applyCreates?: boolean;
  /** Write patch actions that include proposed content */
  applyPatches?: boolean;
  /** Allow overwriting existing files */
  force?: boolean;
}

/**
 * Apply create/test writes; optionally patch writes when action.content is set.
 */
export function applyIntegratePlan(opts: ApplyIntegratePlanOptions): ApplyIntegratePlanResult {
  const written: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];
  const wantCreate = Boolean(opts.applyCreates);
  const wantPatch = Boolean(opts.applyPatches);
  if (!wantCreate && !wantPatch) {
    return {
      written,
      skipped: opts.plan.actions.map((a) => a.path),
      errors: [],
    };
  }
  const root = resolve(opts.repoRoot);
  for (const action of opts.plan.actions) {
    const isCreate = action.kind === 'create' || action.kind === 'test';
    const isPatch = action.kind === 'patch';
    if (isCreate && !wantCreate) {
      skipped.push(`skip-create:${action.path}`);
      continue;
    }
    if (isPatch && !wantPatch) {
      skipped.push(`skip-patch:${action.path}`);
      continue;
    }
    if (!isCreate && !isPatch) {
      skipped.push(`${action.kind}:${action.path}`);
      continue;
    }
    if (!action.content) {
      skipped.push(`no-content:${action.path}`);
      continue;
    }
    if (isDenied(action.path, opts.plan.denyEdit)) {
      errors.push(`denyEdit blocked: ${action.path}`);
      continue;
    }
    const abs = resolvePlanPath(root, opts.plan.topology, action.path);
    if (existsSync(abs) && !opts.force) {
      skipped.push(`exists:${action.path}`);
      continue;
    }
    try {
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, action.content, 'utf8');
      written.push(abs);
    } catch (e) {
      errors.push(`${action.path}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { written, skipped, errors };
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

function resolvePlanPath(
  repoRoot: string,
  topology: IntegrationTopology,
  planPath: string,
): string {
  if (planPath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(planPath)) return planPath;
  // Prefer relative to scanRoot, then moduleRoot, then repoRoot
  const candidates = [
    join(topology.scanRoot, planPath),
    join(topology.moduleRoot, planPath),
    join(repoRoot, planPath),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  // Default write under scanRoot
  return join(topology.scanRoot, planPath);
}

function toRepoRel(repoRoot: string, scanRoot: string, pathFromScan: string): string {
  const abs = resolve(scanRoot, pathFromScan);
  try {
    return relative(repoRoot, abs).split(sep).join('/') || pathFromScan;
  } catch {
    return pathFromScan;
  }
}

function isDenied(path: string, deny: string[]): boolean {
  const norm = path.replace(/\\/g, '/');
  for (const d of deny) {
    const raw = d.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
    try {
      if (new RegExp(raw, 'i').test(norm)) return true;
    } catch {
      if (norm.includes(d)) return true;
    }
  }
  return false;
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
