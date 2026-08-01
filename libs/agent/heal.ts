/**
 * Contract heal: OpenAPI in → map update → direct integration edits.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { FieldMapRow, Proposal, VendorMap } from '../domain/types.js';
import {
  applyIntegratePlan,
  buildIntegratePlan,
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

function mergeHealFields(
  scaffolded: FieldMapRow[],
  baseline?: VendorMap | null,
  drift?: ContractDriftReport,
): FieldMapRow[] {
  if (!baseline) return scaffolded;

  const preservedByVendor = new Map<string, FieldMapRow>();
  for (const row of baseline.fields ?? []) {
    preservedByVendor.set(row.vendor, { ...row, transform: { ...row.transform } });
  }
  const removed = new Set(
    (drift?.items ?? [])
      .filter((i) => i.kind === 'field_removed' && i.path)
      .map((i) => i.path!),
  );
  const added = new Set(
    (drift?.items ?? [])
      .filter((i) => i.kind === 'field_added' && i.path)
      .map((i) => i.path!),
  );

  const merged: FieldMapRow[] = [];
  const usedBaseline = new Set<string>();
  for (const row of scaffolded) {
    const preserved = preservedByVendor.get(row.vendor);
    if (preserved) {
      merged.push({ ...preserved, optional: row.optional });
      usedBaseline.add(preserved.vendor);
      continue;
    }

    const renameSource = added.has(row.vendor)
      ? findRenameSource(row.vendor, baseline.fields ?? [], removed, usedBaseline)
      : undefined;
    merged.push(
      renameSource
        ? { ...renameSource, vendor: row.vendor, optional: row.optional }
        : row,
    );
    if (renameSource) usedBaseline.add(renameSource.vendor);
  }

  return merged;
}

function findRenameSource(
  addedVendor: string,
  baselineFields: FieldMapRow[],
  removedVendors: Set<string>,
  usedBaseline: Set<string>,
): FieldMapRow | undefined {
  const aliases = fieldNameAliases(addedVendor);
  const candidates = baselineFields.filter(
    (row) =>
      removedVendors.has(row.vendor) &&
      !usedBaseline.has(row.vendor) &&
      fieldNameAliases(row.vendor).some((alias) => aliases.includes(alias)),
  );
  if (candidates.length !== 1) return undefined;
  return { ...candidates[0]!, transform: { ...candidates[0]!.transform } };
}

function fieldNameAliases(field: string): string[] {
  const normalized = field.replace(/[^A-Za-z0-9]+/g, '').toLowerCase();
  const aliases = new Set<string>([normalized]);
  for (const suffix of ['id', 'identifier', 'uuid']) {
    if (normalized.endsWith(suffix) && normalized.length > suffix.length + 1) {
      aliases.add(normalized.slice(0, -suffix.length));
    }
  }
  return [...aliases].filter(Boolean);
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
  /** Write create stubs into production module (default true with applyCode) */
  applyCreates?: boolean;
  /** Write patch file bodies into production module (default true) */
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
  integrationActionCount: number;
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
  payload.fields = mergeHealFields(payload.fields ?? [], baseline, drift);
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
    // Persist map for direct integration + dry-run (proposal file remains for audit)
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
    // Use proposal payload in-memory for direct integration without saving
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

  const { plan } = buildIntegratePlan({
    repoRoot,
    scanRoot: opts.scanRoot ?? opts.moduleRoot ?? repoRoot,
    projectGenerate: generateCfg,
    maps: planMaps.filter((m) => m.vendor === vendor || (m.fields?.length ?? 0) > 0),
    vendors: [vendor],
    forceThin: opts.forceThin,
    driftByVendor,
  });

  const branchName = `layerkit/heal-${vendor}-${drift.contractDigest.slice(0, 8)}`;

  let writtenCode: string[] = [];
  let skippedCode: string[] = [];
  let codeErrors: string[] = [];
  const applyCode = opts.applyCode !== false;
  const applyCreates = opts.applyCreates ?? applyCode;
  if (plan && (applyCreates || applyCode)) {
    const result = applyIntegratePlan({
      plan,
      repoRoot,
      applyCreates: Boolean(applyCreates || applyCode),
      applyPatches: Boolean(applyCode),
      force: Boolean(opts.force ?? applyCode),
    });
    writtenCode = result.written;
    skippedCode = result.skipped;
    codeErrors = result.errors;
  }

  const summary = [
    mode,
    drift.summary,
    plan ? `integration-actions=${plan.actions.length}` : 'no integration actions (need --module-root)',
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
    integrationActionCount: plan?.actions.length ?? 0,
    writtenCode,
    skippedCode,
    codeErrors,
    branchName,
    summary,
  };
}
