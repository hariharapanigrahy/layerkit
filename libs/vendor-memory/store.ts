import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_MAKER_CHECKER,
  layerkitConfigPath,
  type MakerCheckerConfig,
  type LayerkitConfig,
} from '../config/layerkit-config.js';
import { resolveProjectDir } from '../config/project-dir.js';
import {
  formatSecretFindings,
  scanJsonForSecrets,
  type SecretFinding,
} from '../doctor/secret-scan.js';
import {
  isVendorMapV1,
  type AuthSpec,
  type CheckRecord,
  type DomainSpec,
  type FieldMapRow,
  type Identity,
  type IntentBinding,
  type IntentWire,
  type LayerProject,
  type Proposal,
  type VendorMap,
} from '../domain/types.js';
import {
  detectHallucinationIssues,
  hasHallucinationErrors,
} from '../hallucination/index.js';
import { validateProposal, validateVendorMap } from '../proposal/validate.js';
import { mapSchemaVersion, migrateMapV1toV2 } from './migrate.js';

const EMPTY_CUSTOMER_DOMAIN: DomainSpec = {
  id: 'customer',
  version: '0.0.0',
  description: 'Empty customer domain. Agent must discover events and fields from client code.',
  intents: [],
  fields: [],
};

/** Read user config without creating ~/.layerkit (eval-safe). */
function readUserMakerChecker(): MakerCheckerConfig {
  try {
    const path = layerkitConfigPath();
    if (!existsSync(path)) return { ...DEFAULT_MAKER_CHECKER };
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<LayerkitConfig>;
    return {
      ...DEFAULT_MAKER_CHECKER,
      ...parsed.makerChecker,
    };
  } catch {
    return { ...DEFAULT_MAKER_CHECKER };
  }
}

const STORE_SUBDIRS = [
  'maps',
  'proposals',
  'out',
  'sessions',
  'memory',
] as const;

const MEMORY_INDEX_SKELETON = `# Layerkit memory index

Canonical markdown memory stack for this project.

## Entries

_None yet. Use \`layerkit memory append\` or agent skills to record research/approvals._
`;

const LEGACY_APPLY_STATUSES = new Set(['pending', 'validated', 'approved']);
const STRICT_APPLY_STATUS = 'ready_to_apply';

export type CheckerRole = CheckRecord['role'];

export interface ApproveOpts {
  by: Identity;
  role: CheckerRole;
  comment?: string;
  /** Dev-only escape hatch for self-approve (see design selfApproveEffective). */
  dev?: boolean;
}

export interface RejectOpts {
  by: Identity;
  role: CheckerRole;
  comment?: string;
}

/**
 * Local project store for vendor maps and proposals.
 * Store root is the resolved projectDir (default: {repoRoot}/.layerkit).
 */
export class VendorMemoryStore {
  readonly projectDir: string;

  /**
   * @param repoRoot - repository root
   * @param projectDir - optional resolved store root; when omitted, uses resolveProjectDir(repoRoot)
   */
  constructor(
    readonly repoRoot: string,
    projectDir?: string,
  ) {
    this.projectDir = projectDir ?? resolveProjectDir(repoRoot);
  }

  ensureDirs(): void {
    for (const d of STORE_SUBDIRS) {
      mkdirSync(join(this.projectDir, d), { recursive: true });
    }
  }

  initProject(opts: { name: string; poc: boolean }): void {
    this.ensureDirs();
    const project: LayerProject = {
      name: opts.name,
      version: '0.1.0',
      languages: [],
      domain: EMPTY_CUSTOMER_DOMAIN,
      vendors: [],
      dataLayerVersionId: `${opts.name}@0.1.0`,
    };
    this.writeJson(join(this.projectDir, 'project.json'), project);
    this.writeJson(join(this.projectDir, 'domain.json'), EMPTY_CUSTOMER_DOMAIN);
    this.ensureMemoryIndex();
    void opts.poc;
  }

  ensureMemoryIndex(): void {
    const indexPath = join(this.projectDir, 'memory', 'INDEX.md');
    if (!existsSync(indexPath)) {
      mkdirSync(join(this.projectDir, 'memory'), { recursive: true });
      writeFileSync(indexPath, MEMORY_INDEX_SKELETON, 'utf8');
    }
  }

  loadProject(): LayerProject | null {
    return this.readJson(join(this.projectDir, 'project.json'));
  }

  saveProject(project: LayerProject): void {
    this.ensureDirs();
    this.writeJson(join(this.projectDir, 'project.json'), project);
  }

  loadDomain(): DomainSpec | null {
    return this.readJson(join(this.projectDir, 'domain.json'));
  }

  listMaps(): VendorMap[] {
    const dir = join(this.projectDir, 'maps');
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => this.readJson<VendorMap>(join(dir, f))!);
  }

  loadMap(vendor: string): VendorMap | null {
    return this.readJson(join(this.projectDir, 'maps', `${vendor}.json`));
  }

  saveMap(map: VendorMap): void {
    this.ensureDirs();
    this.writeJson(join(this.projectDir, 'maps', `${map.vendor}.json`), map);
  }

  saveProposal(proposal: Proposal): string {
    this.ensureDirs();
    const path = join(this.projectDir, 'proposals', `${proposal.id}.json`);
    this.writeJson(path, proposal);
    return path;
  }

  loadProposal(id: string): Proposal | null {
    return this.readJson(join(this.projectDir, 'proposals', `${id}.json`));
  }

  listProposals(): Proposal[] {
    const dir = join(this.projectDir, 'proposals');
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => this.readJson<Proposal>(join(dir, f))!)
      .filter(Boolean);
  }

  /** Rewrite v1 maps to v2 on disk. */
  migrateMaps(vendor?: string): { migrated: string[]; skipped: string[] } {
    const maps = vendor
      ? ([this.loadMap(vendor)].filter(Boolean) as VendorMap[])
      : this.listMaps();
    if (vendor && maps.length === 0) {
      throw new Error(`No map for vendor: ${vendor}`);
    }
    const migrated: string[] = [];
    const skipped: string[] = [];
    for (const m of maps) {
      if (!isVendorMapV1(m)) {
        skipped.push(m.vendor);
        continue;
      }
      this.saveMap(migrateMapV1toV2(m));
      migrated.push(m.vendor);
    }
    return { migrated, skipped };
  }

  reviewProposal(proposal: Proposal): { valid: boolean; errors: string[]; warnings: string[] } {
    const issues = validateProposal(proposal);
    return {
      valid: issues.every((i) => i.level !== 'error'),
      errors: issues.filter((i) => i.level === 'error').map((i) => i.message),
      warnings: issues.filter((i) => i.level === 'warn').map((i) => i.message),
    };
  }

  /** Effective maker-checker config: project overrides user (~/.layerkit) defaults. */
  getMakerCheckerConfig(): MakerCheckerConfig {
    const user = readUserMakerChecker();
    const project = this.loadProject()?.makerChecker;
    return {
      ...DEFAULT_MAKER_CHECKER,
      ...user,
      ...project,
    };
  }

  /** True when apply may bypass ready_to_apply (opt-in; default false = strict). */
  isLegacyApplyEnabled(): boolean {
    return this.getMakerCheckerConfig().legacyApplyWithoutApprove === true;
  }

  /**
   * Guard before apply. Strict mode requires `ready_to_apply`.
   * Legacy accepts pending|validated|approved|ready_to_apply and emits LEGACY_APPLY warn
   * when status is not already ready_to_apply.
   */
  assertApplyAllowed(proposal: Proposal): void {
    const status = proposal.status;
    const legacy = this.isLegacyApplyEnabled();

    if (status === STRICT_APPLY_STATUS) {
      return;
    }

    if (legacy && LEGACY_APPLY_STATUSES.has(status)) {
      console.error('LEGACY_APPLY: maker-checker bypass active');
      return;
    }

    if (legacy) {
      throw new Error(
        `apply_not_allowed: status=${status} (legacy accepts pending|validated|approved|ready_to_apply)`,
      );
    }

    throw new Error(
      `apply_not_allowed: status=${status}; strict maker-checker requires ready_to_apply ` +
        `(submit → validate → approve first, or set makerChecker.legacyApplyWithoutApprove=true)`,
    );
  }

  /**
   * draft|pending → pending. Ensures maker is set (v2 requires it for non-draft).
   */
  submitProposal(proposal: Proposal, maker?: Identity): Proposal {
    const review = this.reviewProposal({
      ...proposal,
      maker: maker ?? proposal.maker,
      status: proposal.status === 'draft' ? 'pending' : proposal.status,
    });
    // Allow submit of draft without full structural validity for later validate,
    // but still require id/kind basics via validate when not draft.
    const next: Proposal = {
      ...proposal,
      maker: maker ?? proposal.maker ?? { type: 'agent', id: 'unknown' },
      status: 'pending',
      checks: proposal.checks ?? [],
    };
    if ((next.schemaVersion ?? 1) === 2 && !next.maker) {
      throw new Error('submit_requires_maker: v2 proposals need maker on submit');
    }
    // Soft: if already has structural errors, still allow submit (validate step is separate)
    void review;
    this.saveProposal(next);
    return next;
  }

  approveProposal(id: string, opts: ApproveOpts): Proposal {
    const proposal = this.loadProposal(id);
    if (!proposal) throw new Error(`proposal_not_found: ${id}`);

    const terminal = new Set(['applied', 'promoted', 'rejected', 'superseded', 'ready_to_apply']);
    if (terminal.has(proposal.status) || proposal.status === 'approved') {
      throw new Error(`conflict_already_decided: status=${proposal.status}`);
    }

    const cfg = this.getMakerCheckerConfig();
    this.assertRoleGranted(opts.by, opts.role);

    const makerId = proposal.maker?.id;
    const selfApprove = this.isSelfApproveEffective(cfg, opts.dev);
    if (
      cfg.requireDistinctChecker !== false &&
      !selfApprove &&
      makerId &&
      opts.by.id === makerId
    ) {
      throw new Error(
        'self_approve_denied: checker must be distinct from maker ' +
          '(set makerChecker.allowSelfApprove=true to override)',
      );
    }

    const check: CheckRecord = {
      at: new Date().toISOString(),
      by: opts.by,
      role: opts.role,
      decision: 'approve',
      comment: opts.comment,
    };
    const checks = [...(proposal.checks ?? []), check];
    const needsPrivacy = proposal.requiresPrivacyReview === true;

    let status = proposal.status;

    if (proposal.status === 'validated' || proposal.status === 'pending') {
      // pending may be approved only after structural OK; enforce validated path preferred
      if (proposal.status === 'pending') {
        const review = this.reviewProposal(proposal);
        if (!review.valid) {
          throw new Error(`approve_requires_valid: ${review.errors.join('; ')}`);
        }
      }
      if (opts.role === 'privacy_reviewer' && needsPrivacy) {
        // privacy reviewer approving from validated goes straight to ready when privacy is the only hold
        status = 'ready_to_apply';
      } else if (opts.role === 'checker' || opts.role === 'admin') {
        if (needsPrivacy) {
          status = 'privacy_hold';
        } else {
          // approved → immediate ready_to_apply per design
          status = 'ready_to_apply';
        }
      } else if (opts.role === 'privacy_reviewer') {
        throw new Error('role_not_applicable: privacy_reviewer acts on privacy_hold');
      }
    } else if (proposal.status === 'privacy_hold') {
      if (opts.role !== 'privacy_reviewer' && opts.role !== 'admin') {
        throw new Error('role_not_granted: privacy_hold requires privacy_reviewer or admin');
      }
      status = 'ready_to_apply';
    } else {
      throw new Error(`approve_invalid_status: cannot approve from status=${proposal.status}`);
    }

    const next: Proposal = { ...proposal, status, checks };
    this.saveProposal(next);
    return next;
  }

  rejectProposal(id: string, opts: RejectOpts): Proposal {
    const proposal = this.loadProposal(id);
    if (!proposal) throw new Error(`proposal_not_found: ${id}`);

    if (proposal.status === 'applied' || proposal.status === 'promoted' || proposal.status === 'rejected') {
      throw new Error(`conflict_already_decided: status=${proposal.status}`);
    }

    this.assertRoleGranted(opts.by, opts.role);

    const check: CheckRecord = {
      at: new Date().toISOString(),
      by: opts.by,
      role: opts.role,
      decision: 'reject',
      comment: opts.comment,
    };
    const next: Proposal = {
      ...proposal,
      status: 'rejected',
      checks: [...(proposal.checks ?? []), check],
    };
    this.saveProposal(next);
    return next;
  }

  applyProposal(proposal: Proposal): { kind: string; target: string } {
    this.assertApplyAllowed(proposal);

    const review = this.reviewProposal(proposal);
    if (!review.valid) {
      throw new Error(`Invalid proposal:\n${review.errors.map((e) => `- ${e}`).join('\n')}`);
    }

    // Fail-closed invent gate before any store mutation.
    // Break-glass (not for production): LAYERKIT_ALLOW_HALLUCINATION=1
    if (process.env.LAYERKIT_ALLOW_HALLUCINATION !== '1') {
      const guard = detectHallucinationIssues(proposal);
      if (hasHallucinationErrors(guard)) {
        const codes = [
          ...new Set(guard.issues.filter((i) => i.level === 'error').map((i) => i.code)),
        ].join(', ');
        throw new Error(`hallucination_blocked: ${codes}`);
      }
    }

    const result = this.applyByKind(proposal);
    proposal.status = 'applied';
    this.saveProposal(proposal);
    return result;
  }

  doctor(): { ok: boolean; lines: string[]; secretFindings?: SecretFinding[] } {
    const lines: string[] = [];
    lines.push(`projectDir: ${this.projectDir}`);
    const project = this.loadProject();
    if (!project) {
      return {
        ok: false,
        lines: [
          ...lines,
          `No Layerkit project at ${this.projectDir} — run layerkit install`,
        ],
      };
    }
    lines.push(`Project: ${project.name}`);
    lines.push(`Languages: ${project.languages.join(', ')}`);
    const mc = this.getMakerCheckerConfig();
    const legacyOn = mc.legacyApplyWithoutApprove === true;
    const modeLabel = legacyOn
      ? 'LEGACY (apply without approve)'
      : 'STRICT (requires ready_to_apply)';
    lines.push(`makerChecker: mode=${modeLabel}`);
    lines.push(
      `  legacyApplyWithoutApprove=${legacyOn} ` +
        `requireDistinct=${mc.requireDistinctChecker} ` +
        `allowSelfApprove=${mc.allowSelfApprove}`,
    );
    if (legacyOn) {
      lines.push(
        '  ⚠ legacyApplyWithoutApprove=true — pending/validated/approved apply bypasses checker ' +
          '(set makerChecker.legacyApplyWithoutApprove=false for strict)',
      );
    }
    if (mc.allowSelfApprove) {
      lines.push('  ⚠ self-approve enabled (doctor warn)');
    }
    const maps = this.listMaps();
    lines.push(`Vendor maps: ${maps.length}`);
    let errors = 0;
    const domain = this.loadDomain() ?? undefined;
    const allSecretFindings: SecretFinding[] = [];
    for (const m of maps) {
      const issues = validateVendorMap(m, domain);
      const errs = issues.filter((i) => i.level === 'error');
      const ver = mapSchemaVersion(m);
      if (errs.length) {
        errors += errs.length;
        lines.push(`  ✗ ${m.vendor} (v${ver}): ${errs.map((e) => e.message).join('; ')}`);
      } else {
        lines.push(`  ✓ ${m.vendor} (v${ver}, ${m.status ?? '?'})`);
      }
      const secrets = scanJsonForSecrets(m, '');
      allSecretFindings.push(...secrets.map((f) => ({ ...f, path: `map:${m.vendor}/${f.path}` })));
      lines.push(...formatSecretFindings(secrets, `map:${m.vendor}`));
      errors += secrets.filter((f) => f.level === 'error').length;
    }
    const proposals = this.listProposals();
    if (proposals.length) lines.push(`Proposals: ${proposals.length}`);
    for (const p of proposals) {
      const secrets = scanJsonForSecrets(p, '');
      allSecretFindings.push(
        ...secrets.map((f) => ({ ...f, path: `proposal:${p.id}/${f.path}` })),
      );
      lines.push(...formatSecretFindings(secrets, `proposal:${p.id}`));
      errors += secrets.filter((f) => f.level === 'error').length;
    }
    const secretErrors = allSecretFindings.filter((f) => f.level === 'error').length;
    const secretWarns = allSecretFindings.filter((f) => f.level === 'warn').length;
    if (secretErrors || secretWarns) {
      lines.push(
        `Secret scan: ${secretErrors} error(s), ${secretWarns} warning(s) (prefer SecretRef over inline tokens)`,
      );
    }
    lines.push(errors ? `Doctor found ${errors} error(s)` : 'Doctor OK');
    return { ok: errors === 0, lines, secretFindings: allSecretFindings };
  }

  private isSelfApproveEffective(cfg: MakerCheckerConfig, dev?: boolean): boolean {
    // Env alone NEVER enables self-approve when config is false.
    if (cfg.allowSelfApprove === true) {
      return process.env.LAYERKIT_ALLOW_SELF_APPROVE !== '0';
    }
    // Dev escape: --dev + env=1
    if (dev === true && process.env.LAYERKIT_ALLOW_SELF_APPROVE === '1') {
      return true;
    }
    return false;
  }

  private assertRoleGranted(by: Identity, role: CheckerRole): void {
    const project = this.loadProject();
    const reviewers = project?.security?.reviewers;
    if (!reviewers || reviewers.length === 0) {
      // No project reviewers configured — allow claimed role (POC / early projects)
      return;
    }
    const entry = reviewers.find((r) => r.id === by.id);
    if (!entry) {
      throw new Error(`role_not_granted: ${by.id} is not in project.security.reviewers`);
    }
    if (!entry.roles.includes(role) && !entry.roles.includes('admin')) {
      throw new Error(`role_not_granted: ${by.id} lacks role ${role}`);
    }
  }

  private applyByKind(proposal: Proposal): { kind: string; target: string } {
    switch (proposal.kind) {
      case 'vendor_map':
        return this.applyVendorMapProposal(proposal);
      case 'field_row':
        return this.applyFieldRowKind(proposal);
      case 'intent_wire':
        return this.applyIntentWireKind(proposal);
      case 'auth':
        return this.applyAuthKind(proposal);
      case 'domain_spec':
        return this.applyDomainSpecKind(proposal);
      case 'java_artifact':
        return this.applyJavaArtifactKind(proposal);
      default:
        throw new Error(`Apply not implemented for kind=${String((proposal as Proposal).kind)}`);
    }
  }

  private applyVendorMapProposal(proposal: Proposal): { kind: string; target: string } {
    const map = proposal.payload as VendorMap;
    this.saveMap(map);
    return { kind: 'vendor_map', target: map.vendor };
  }

  /**
   * Payload shapes:
   * - FieldMapRow (domain + vendor path + transform); map vendor from proposal.vendor
   * - { mapVendor|vendorMap, field: FieldMapRow }
   * - { field: FieldMapRow } with proposal.vendor
   * Upsert into map.fields by domain + vendor path.
   */
  private applyFieldRowKind(proposal: Proposal): { kind: string; target: string } {
    const p = proposal.payload as Record<string, unknown>;
    let row: FieldMapRow;
    let mapVendor: string | undefined = proposal.vendor;

    if (p.field && typeof p.field === 'object') {
      row = p.field as FieldMapRow;
      if (typeof p.mapVendor === 'string') mapVendor = p.mapVendor;
      else if (typeof p.vendorMap === 'string') mapVendor = p.vendorMap;
      else if (typeof p.vendor === 'string' && p.vendor !== row.vendor) mapVendor = p.vendor;
    } else {
      // Payload is the FieldMapRow itself (domain/vendor/transform)
      row = p as unknown as FieldMapRow;
    }

    if (!mapVendor) {
      throw new Error('field_row requires proposal.vendor (map id); payload.vendor is the field path');
    }
    if (!row.domain || !row.vendor) {
      throw new Error('field_row payload needs domain and vendor paths');
    }

    const map = this.loadMap(mapVendor);
    if (!map) throw new Error(`field_row: no map for vendor=${mapVendor}`);

    const fields = [...(map.fields ?? [])];
    const idx = fields.findIndex((f) => f.domain === row.domain && f.vendor === row.vendor);
    if (idx >= 0) fields[idx] = row;
    else fields.push(row);
    this.saveMap({ ...map, fields });
    return { kind: 'field_row', target: `${mapVendor}:${row.domain}` };
  }

  /**
   * Payload: { vendor?, intent: string, wire: IntentWire|IntentBinding } or
   * { intent, ...wire fields }.
   */
  private applyIntentWireKind(proposal: Proposal): { kind: string; target: string } {
    const p = proposal.payload as Record<string, unknown>;
    const vendor = proposal.vendor ?? (typeof p.vendor === 'string' ? p.vendor : undefined);
    if (!vendor) throw new Error('intent_wire requires vendor on proposal or payload');
    const intent = typeof p.intent === 'string' ? p.intent : undefined;
    if (!intent) throw new Error('intent_wire payload needs intent key');

    let wire: IntentWire | IntentBinding;
    if (p.wire && typeof p.wire === 'object') {
      wire = p.wire as IntentWire | IntentBinding;
    } else {
      const { vendor: _v, intent: _i, ...rest } = p;
      wire = rest as IntentWire | IntentBinding;
    }

    const map = this.loadMap(vendor);
    if (!map) throw new Error(`intent_wire: no map for vendor=${vendor}`);
    const intents = { ...(map.intents ?? {}), [intent]: wire } as VendorMap['intents'];
    this.saveMap({ ...map, intents } as VendorMap);
    return { kind: 'intent_wire', target: `${vendor}:${intent}` };
  }

  /** Payload: AuthSpec or { vendor?, auth: AuthSpec }. */
  private applyAuthKind(proposal: Proposal): { kind: string; target: string } {
    const p = proposal.payload as Record<string, unknown>;
    const vendor = proposal.vendor ?? (typeof p.vendor === 'string' ? p.vendor : undefined);
    if (!vendor) throw new Error('auth requires vendor on proposal or payload');
    const auth = (p.auth && typeof p.auth === 'object' ? p.auth : p) as AuthSpec;
    if (!auth.type) throw new Error('auth payload needs type');

    const map = this.loadMap(vendor);
    if (!map) throw new Error(`auth: no map for vendor=${vendor}`);
    this.saveMap({ ...map, auth });
    return { kind: 'auth', target: vendor };
  }

  /** Payload: DomainSpec & { merge?: boolean } */
  private applyDomainSpecKind(proposal: Proposal): { kind: string; target: string } {
    const p = proposal.payload as DomainSpec & { merge?: boolean };
    const { merge, ...domainRaw } = p as DomainSpec & { merge?: boolean };
    const domain = domainRaw as DomainSpec;
    if (merge) {
      const existing = this.loadDomain();
      if (existing) {
        const fieldsByPath = new Map(existing.fields.map((f) => [f.path, f]));
        for (const f of domain.fields ?? []) fieldsByPath.set(f.path, f);
        const intentsById = new Map(existing.intents.map((i) => [i.id, i]));
        for (const i of domain.intents ?? []) intentsById.set(i.id, i);
        const merged: DomainSpec = {
          ...existing,
          ...domain,
          fields: [...fieldsByPath.values()],
          intents: [...intentsById.values()],
        };
        this.writeJson(join(this.projectDir, 'domain.json'), merged);
        return { kind: 'domain_spec', target: merged.id };
      }
    }
    this.writeJson(join(this.projectDir, 'domain.json'), domain);
    return { kind: 'domain_spec', target: domain.id ?? 'domain' };
  }

  /**
   * Payload: { files: Array<{ path: string; content: string }> } or single { path, content }.
   * Paths are relative under out/java/.
   */
  private applyJavaArtifactKind(proposal: Proposal): { kind: string; target: string } {
    const p = proposal.payload as {
      files?: Array<{ path: string; content: string }>;
      path?: string;
      content?: string;
    };
    const files =
      p.files ??
      (p.path != null && p.content != null ? [{ path: p.path, content: p.content }] : []);
    if (!files.length) throw new Error('java_artifact payload needs files[] or path+content');

    const base = join(this.projectDir, 'out', 'java');
    for (const f of files) {
      if (!f.path || f.content == null) throw new Error('java_artifact file needs path and content');
      // Prevent path escape
      const rel = f.path.replace(/^\/+/, '').replace(/\.\./g, '');
      const abs = join(base, rel);
      mkdirSync(join(abs, '..'), { recursive: true });
      writeFileSync(abs, f.content, 'utf8');
    }
    return { kind: 'java_artifact', target: files[0]!.path };
  }

  private writeJson(path: string, data: unknown): void {
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
  }

  private readJson<T>(path: string): T | null {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  }
}

/**
 * Create a store for repoRoot.
 * @param projectDir - optional resolved absolute store root (from resolveProjectDir with CLI/env)
 */
export function createVendorMemoryStore(repoRoot: string, projectDir?: string): VendorMemoryStore {
  return new VendorMemoryStore(repoRoot, projectDir);
}
