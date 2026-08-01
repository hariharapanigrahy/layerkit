/**
 * Contract heal: OpenAPI in → map update → integrate plan → PR package / code apply.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import type { FieldMapRow, Proposal, VendorMap } from '../domain/types.js';
import {
  applyIntegratePlan,
  buildIntegratePlan,
  writeIntegratePlanArtifacts,
  type IntegrationPlan,
} from '../generate/index.js';
import { scaffoldVendorMapFromOpenApi } from '../proposal/scaffold.js';
import { validateProposal } from '../proposal/validate.js';
import {
  diffOpenApiAgainstMap,
  pinContractEvidence,
  formatContractUpdateMarkdown,
  type ContractDriftReport,
} from '../research/index.js';
import { createVendorMemoryStore } from '../vendor-memory/store.js';
import { loadDomainBinding } from './domain-binding.js';
import { setPipelineMode } from './pipeline.js';

function mergeHealFields(scaffolded: FieldMapRow[], baseline?: VendorMap | null): FieldMapRow[] {
  if (!baseline) return scaffolded;

  const preservedByVendor = new Map<string, FieldMapRow>();
  for (const row of baseline.fields ?? []) {
    preservedByVendor.set(row.vendor, { ...row, transform: { ...row.transform } });
  }

  const merged: FieldMapRow[] = [];
  const seen = new Set<string>();
  for (const row of scaffolded) {
    const preserved = preservedByVendor.get(row.vendor);
    merged.push(preserved ? { ...preserved } : row);
    seen.add(row.vendor);
  }

  for (const row of baseline.fields ?? []) {
    if (!seen.has(row.vendor)) {
      merged.push({ ...row, transform: { ...row.transform } });
    }
  }

  return merged;
}

export interface HealRunOptions {
  repoRoot: string;
  projectDir: string;
  vendor: string;
  openapiPath: string;
  docUrls?: string[];
  moduleRoot?: string;
  agentId?: string;
  /** Apply map into project store (default true) */
  applyMap?: boolean;
  /** Write create stubs into production module (default false) */
  applyCreates?: boolean;
  /** Write patch file bodies into production module (default false; needs --force for overwrite) */
  applyCode?: boolean;
  force?: boolean;
  forceThin?: boolean;
  scanRoot?: string;
}

export interface HealRunResult {
  mode: 'heal' | 'first_time';
  vendor: string;
  drift: ContractDriftReport;
  pinnedOpenApiPath: string;
  proposalPath: string;
  mapApplied: boolean;
  integrateMdPath: string | null;
  integrateJsonPath: string | null;
  plan: IntegrationPlan | null;
  prDir: string;
  prBodyPath: string;
  manifestPath: string;
  writtenCode: string[];
  skippedCode: string[];
  codeErrors: string[];
  branchName: string;
  summary: string;
}

/**
 * Run full heal pipeline for one vendor contract update.
 */
export function runHeal(opts: HealRunOptions): HealRunResult {
  const repoRoot = resolve(opts.repoRoot);
  const projectDir = resolve(opts.projectDir);
  const vendor = opts.vendor.trim();
  if (!vendor) throw new Error('heal requires --vendor');
  if (!opts.openapiPath) throw new Error('heal requires --openapi');

  const store = createVendorMemoryStore(repoRoot, projectDir);
  store.ensureDirs();

  const pin = pinContractEvidence({
    projectDir,
    vendor,
    openapiPath: opts.openapiPath,
    docUrls: opts.docUrls,
  });
  const openapiRaw = readFileSync(pin.pinnedOpenApiPath, 'utf8');
  const baseline = store.loadMap(vendor);
  const drift = diffOpenApiAgainstMap(vendor, openapiRaw, baseline);
  const mode: 'heal' | 'first_time' = baseline ? 'heal' : 'first_time';

  setPipelineMode(projectDir, mode === 'heal' ? 'heal' : 'full', {
    vendor,
    note: `digest=${drift.contractDigest}`,
  });

  writeFileSync(
    join(projectDir, 'out', 'CONTRACT_DRIFT.json'),
    JSON.stringify(drift, null, 2) + '\n',
    'utf8',
  );
  writeFileSync(
    join(projectDir, 'out', 'CONTRACT_UPDATE.md'),
    formatContractUpdateMarkdown({
      vendor,
      drift,
      pinnedOpenApiPath: pin.pinnedOpenApiPath,
      moduleRoot: opts.moduleRoot,
      mode,
    }),
    'utf8',
  );

  const convention = loadDomainBinding(projectDir);
  const proposal = scaffoldVendorMapFromOpenApi({
    vendor,
    openapiContent: openapiRaw,
    openapiRef: pin.pinnedOpenApiPath,
    agentId: opts.agentId ?? 'heal',
    convention,
  });
  // Bump map version from OpenAPI when present
  const payload = proposal.payload as VendorMap;
  payload.fields = mergeHealFields(payload.fields ?? [], baseline);
  if (drift.openapiVersion) {
    (payload as { version?: string }).version = drift.openapiVersion;
  }
  if (baseline && 'displayName' in baseline && baseline.displayName) {
    (payload as { displayName?: string }).displayName = baseline.displayName;
  }
  proposal.status = 'validated';
  proposal.changeLog = `Heal from contract digest ${drift.contractDigest}: ${drift.summary}`;

  const issues = validateProposal(proposal);
  const errors = issues.filter((i) => i.level === 'error');
  if (errors.length) {
    const msgs = errors.map((i) => i.message).join('; ');
    throw new Error(`heal map proposal invalid: ${msgs}`);
  }

  const proposalPath = join(projectDir, 'out', 'contracts', vendor, 'heal-proposal.json');
  mkdirSync(dirname(proposalPath), { recursive: true });
  writeFileSync(proposalPath, JSON.stringify(proposal, null, 2) + '\n', 'utf8');

  const applyMap = opts.applyMap !== false;
  let mapApplied = false;
  if (applyMap) {
    // Persist map for integrate plan + dry-run (proposal file remains for audit)
    store.saveMap(payload);
    const applied: Proposal = {
      ...proposal,
      status: 'applied',
      changeLog: `${proposal.changeLog ?? ''} applied by heal`,
    };
    store.saveProposal(applied);
    mapApplied = true;
  }

  const maps = store.listMaps();
  const healMap = maps.find((m) => m.vendor === vendor);
  if (!healMap && !applyMap) {
    // Use proposal payload in-memory for plan without saving
  }
  const planMaps = healMap ? maps : [...maps.filter((m) => m.vendor !== vendor), payload];

  const project = store.loadProject();
  const generateCfg = {
    ...project?.generate,
    ...(opts.moduleRoot ? { moduleRoot: opts.moduleRoot } : {}),
    mode: 'integrate' as const,
  };

  const driftByVendor = {
    [vendor]: {
      summary: drift.summary,
      severity: drift.severity,
      items: drift.items.map((i) => ({
        kind: i.kind,
        severity: i.severity,
        detail: i.detail,
        path: i.path,
      })),
    },
  };

  const { resolution, plan } = buildIntegratePlan({
    repoRoot,
    scanRoot: opts.scanRoot ?? opts.moduleRoot ?? repoRoot,
    projectGenerate: generateCfg,
    maps: planMaps.filter((m) => m.vendor === vendor || (m.fields?.length ?? 0) > 0),
    vendors: [vendor],
    forceThin: opts.forceThin,
    driftByVendor,
  });

  let integrateMdPath: string | null = null;
  let integrateJsonPath: string | null = null;
  if (resolution.ok && plan) {
    const arts = writeIntegratePlanArtifacts(projectDir, plan);
    integrateMdPath = arts.mdPath;
    integrateJsonPath = arts.jsonPath;
  }

  const branchName = `layerkit/heal-${vendor}-${drift.contractDigest.slice(0, 8)}`;
  const prDir = join(projectDir, 'out', 'pr', `${vendor}-${drift.contractDigest.slice(0, 8)}`);
  mkdirSync(prDir, { recursive: true });

  const fileEntries: Array<{ path: string; kind: string; absProposed: string }> = [];
  if (plan) {
    for (const action of plan.actions) {
      if (!action.content) continue;
      if (action.kind !== 'create' && action.kind !== 'patch' && action.kind !== 'test') continue;
      const rel = action.path.replace(/^\.\//, '');
      const dest = join(prDir, 'files', rel);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, action.content, 'utf8');
      fileEntries.push({ path: rel, kind: action.kind, absProposed: dest });
    }
  }

  // Include updated map JSON in PR package
  const mapRel = join('.layerkit', 'maps', `${vendor}.json`);
  const mapDest = join(prDir, 'files', mapRel);
  mkdirSync(dirname(mapDest), { recursive: true });
  writeFileSync(mapDest, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  fileEntries.push({ path: mapRel, kind: 'map', absProposed: mapDest });

  const manifest = {
    vendor,
    mode,
    branchName,
    contractDigest: drift.contractDigest,
    severity: drift.severity,
    driftSummary: drift.summary,
    driftItems: drift.items,
    files: fileEntries.map((f) => ({ path: f.path, kind: f.kind })),
    openapi: pin.pinnedOpenApiPath,
    proposalPath,
    createdAt: new Date().toISOString(),
  };
  const manifestPath = join(prDir, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  const prBodyPath = join(prDir, 'PR.md');
  writeFileSync(
    prBodyPath,
    formatHealPrMarkdown({
      vendor,
      mode,
      drift,
      branchName,
      fileEntries,
      moduleRoot: opts.moduleRoot,
      planOk: Boolean(plan),
    }),
    'utf8',
  );

  const applyScript = join(prDir, 'apply-to-repo.sh');
  writeFileSync(
    applyScript,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'ROOT="${1:-.}"',
      `PR_FILES="$(cd "$(dirname "$0")" && pwd)/files"`,
      'cp -R "$PR_FILES"/. "$ROOT"/',
      'echo "Applied heal files into $ROOT"',
      '',
    ].join('\n'),
    'utf8',
  );

  let writtenCode: string[] = [];
  let skippedCode: string[] = [];
  let codeErrors: string[] = [];
  if (plan && (opts.applyCreates || opts.applyCode)) {
    const result = applyIntegratePlan({
      plan,
      repoRoot,
      applyCreates: Boolean(opts.applyCreates || opts.applyCode),
      applyPatches: Boolean(opts.applyCode),
      force: Boolean(opts.force ?? opts.applyCode),
    });
    writtenCode = result.written;
    skippedCode = result.skipped;
    codeErrors = result.errors;
  }

  const summary = [
    mode,
    drift.summary,
    plan ? `plan actions=${plan.actions.length}` : 'no integrate plan (need --module-root)',
    `pr=${prDir}`,
    mapApplied ? 'map=applied' : 'map=proposal-only',
    writtenCode.length ? `code-written=${writtenCode.length}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    mode,
    vendor,
    drift,
    pinnedOpenApiPath: pin.pinnedOpenApiPath,
    proposalPath,
    mapApplied,
    integrateMdPath,
    integrateJsonPath,
    plan,
    prDir,
    prBodyPath,
    manifestPath,
    writtenCode,
    skippedCode,
    codeErrors,
    branchName,
    summary,
  };
}

function formatHealPrMarkdown(opts: {
  vendor: string;
  mode: string;
  drift: ContractDriftReport;
  branchName: string;
  fileEntries: Array<{ path: string; kind: string }>;
  moduleRoot?: string;
  planOk: boolean;
}): string {
  const { vendor, mode, drift, branchName, fileEntries, moduleRoot, planOk } = opts;
  const lines = [
    `# Heal PR — ${vendor}`,
    '',
    `**Mode:** ${mode}  `,
    `**Severity:** ${drift.severity}  `,
    `**Digest:** \`${drift.contractDigest}\``,
    '',
    drift.summary,
    '',
    '## Contract drift',
    '',
  ];
  if (!drift.items.length) {
    lines.push('_No structural drift items._', '');
  } else {
    for (const it of drift.items) {
      lines.push(`- **${it.severity}** \`${it.kind}\`${it.path ? ` (\`${it.path}\`)` : ''}: ${it.detail}`);
    }
    lines.push('');
  }
  lines.push('## Files', '');
  for (const f of fileEntries) {
    lines.push(`- \`${f.path}\` (${f.kind})`);
  }
  lines.push('');
  lines.push('## Create branch + PR', '');
  lines.push('```bash');
  lines.push(`git checkout -b ${branchName}`);
  lines.push(`bash ${moduleRoot ? '' : ''}out/pr/${vendor}-${drift.contractDigest.slice(0, 8)}/apply-to-repo.sh .`);
  lines.push('# or: cp -R out/pr/.../files/. .');
  lines.push('git add -A');
  lines.push(`git commit -m "fix(${vendor}): heal integration from contract ${drift.contractDigest.slice(0, 8)}"`);
  lines.push(`gh pr create --title "fix(${vendor}): API contract heal" --body-file out/pr/${vendor}-${drift.contractDigest.slice(0, 8)}/PR.md`);
  lines.push('```');
  lines.push('');
  if (!planOk) {
    lines.push('> Integrate plan missing — re-run with `--module-root` pointing at production adapters.');
    lines.push('');
  }
  lines.push('## Checks', '');
  lines.push('```bash');
  lines.push(`layerkit process dry-run --vendor ${vendor} --intent <primary>`);
  lines.push('layerkit doctor --quality --strict');
  lines.push(`layerkit promote --vendor ${vendor}`);
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

/** Resolve module path for display. */
export function healPrRelative(projectDir: string, abs: string): string {
  try {
    return relative(projectDir, abs);
  } catch {
    return abs;
  }
}
