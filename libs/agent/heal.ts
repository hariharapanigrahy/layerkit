/**
 * Contract heal: OpenAPI in → drift/map update → agent-owned source edits.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { FieldMapRow, Proposal, VendorMap } from '../domain/types.js';
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
  semanticRenames: HealRenameDecision[] = [],
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
  const renameByAddedVendor = validateRenameDecisions(
    semanticRenames,
    baseline.fields ?? [],
    removed,
    added,
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
      ? findRenameSource(row.vendor, renameByAddedVendor, usedBaseline)
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
  renameByAddedVendor: Map<string, FieldMapRow>,
  usedBaseline: Set<string>,
): FieldMapRow | undefined {
  const candidate = renameByAddedVendor.get(addedVendor);
  if (!candidate || usedBaseline.has(candidate.vendor)) return undefined;
  return { ...candidate, transform: { ...candidate.transform } };
}

function validateRenameDecisions(
  decisions: HealRenameDecision[],
  baselineFields: FieldMapRow[],
  removedVendors: Set<string>,
  addedVendors: Set<string>,
): Map<string, FieldMapRow> {
  const byAddedVendor = new Map<string, FieldMapRow>();
  const baselineByVendor = new Map(baselineFields.map((row) => [row.vendor, row]));
  for (const decision of decisions) {
    if (!isConfidentRenameDecision(decision)) continue;
    if (!removedVendors.has(decision.fromVendor)) continue;
    if (!addedVendors.has(decision.toVendor)) continue;
    if (byAddedVendor.has(decision.toVendor)) continue;

    const baseline = baselineByVendor.get(decision.fromVendor);
    if (!baseline) continue;
    if (decision.domain && decision.domain !== baseline.domain) continue;
    byAddedVendor.set(decision.toVendor, baseline);
  }
  return byAddedVendor;
}

function isConfidentRenameDecision(decision: HealRenameDecision): boolean {
  const evidence = decision.evidence ?? [];
  if (!decision.fromVendor || !decision.toVendor || evidence.length === 0) return false;
  if (typeof decision.confidence === 'number') return decision.confidence >= 0.75;
  return decision.confidence === 'high';
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
  /**
   * Semantic rename decisions produced by an agent/skill from contract + code evidence.
   * Heal only checks that decisions refer to removed/added contract fields before
   * carrying the mapping forward. The agent remains responsible for meaning.
   */
  semanticRenames?: HealRenameDecision[];
}

export interface HealRenameDecision {
  fromVendor: string;
  toVendor: string;
  domain?: string;
  confidence: 'high' | 'medium' | 'low' | number;
  evidence: string[];
}

export interface HealRunResult {
  mode: 'heal' | 'first_time';
  vendor: string;
  drift: ContractDriftReport;
  pinnedOpenApiPath: string;
  proposalPath: string;
  mapApplied: boolean;
  sourceEditRequired: boolean;
  sourceEditReason: string;
  agentNextSteps: string[];
  summary: string;
}

/**
 * Run heal rails for one vendor contract update.
 *
 * This function intentionally does not patch production source code. Contract
 * meaning, data-layer mapping, nested model changes, and interface edits are
 * skill/agent work. Heal records evidence and map drift so the agent can edit
 * the real package files and let deterministic gates validate afterward.
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
  payload.fields = mergeHealFields(payload.fields ?? [], baseline, drift, opts.semanticRenames);
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

  const sourceEditRequired = drift.items.length > 0 || mode === 'first_time';
  const sourceEditReason = sourceEditRequired
    ? 'agent must inspect docs, existing interfaces, and datalayer before editing production source'
    : 'no contract drift detected';
  const agentNextSteps = [
    'Review .layerkit/out/CONTRACT_DRIFT.json and the cited contract/docs.',
    'Update existing production adapter/interface/test files directly; prefer rewrite/delete over additive files.',
    'Use TODOs only where the client interface or datalayer truly lacks the field.',
    `Run layerkit process dry-run --vendor ${vendor} --intent <primary> plus package tests.`,
  ];

  const summary = [
    mode,
    drift.summary,
    mapApplied ? 'map=applied' : 'map=proposal-only',
    sourceEditRequired ? 'source-edit=agent-required' : 'source-edit=not-needed',
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
    sourceEditRequired,
    sourceEditReason,
    agentNextSteps,
    summary,
  };
}
