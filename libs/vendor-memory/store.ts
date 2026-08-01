import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
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

interface TransactionSnapshot {
  path: string;
  backupPath: string;
  existed: boolean;
}

interface ApplyTransaction {
  id: string;
  journalPath: string;
  files: TransactionSnapshot[];
}

/**
 * Local project store for vendor maps and proposals.
 * Store root is the resolved projectDir (default: {repoRoot}/.layerkit).
 */
export class VendorMemoryStore {
  readonly projectDir: string;
  private corruptArtifacts: Array<{ path: string; error: string }> = [];

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
      .map((f) => this.readJson<VendorMap>(join(dir, f)))
      .filter((m): m is VendorMap => Boolean(m));
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
      .map((f) => this.readJson<Proposal>(join(dir, f)))
      .filter((proposal): proposal is Proposal => proposal !== null);
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
   * draft|pending → pending. Ensures maker is set and structural errors are fixed before review.
   */
  submitProposal(proposal: Proposal, maker?: Identity): Proposal {
    const next: Proposal = {
      ...proposal,
      maker: maker ?? proposal.maker ?? { type: 'agent', id: 'unknown' },
      status: 'pending',
      checks: proposal.checks ?? [],
    };
    if ((next.schemaVersion ?? 1) === 2 && !next.maker) {
      throw new Error('submit_requires_maker: v2 proposals need maker on submit');
    }
    const review = this.reviewProposal(next);
    if (!review.valid) {
      throw new Error(`submit_invalid: ${review.errors.join('; ')}`);
    }
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
    this.assertRoleGranted(opts.by, opts.role, opts.dev);

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

    this.assertRoleGranted(opts.by, opts.role, false);

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

    const tx = this.beginApplyTransaction(proposal);
    try {
      const result = this.applyByKind(proposal);
      const applied: Proposal = { ...proposal, status: 'applied' };
      this.saveProposal(applied);
      this.completeApplyTransaction(tx);
      proposal.status = 'applied';
      return result;
    } catch (err) {
      this.rollbackApplyTransaction(tx, err);
      throw err;
    }
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
    let errors = 0;
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
    if (process.env.LAYERKIT_ALLOW_HALLUCINATION === '1') {
      lines.push(
        '  ✗ hallucination break-glass is enabled via LAYERKIT_ALLOW_HALLUCINATION=1',
      );
      errors += 1;
    }
    if (mc.allowSelfApprove) {
      lines.push('  ⚠ self-approve enabled (doctor warn)');
    }
    const maps = this.listMaps();
    lines.push(`Vendor maps: ${maps.length}`);
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
    for (const c of this.corruptArtifacts) {
      lines.push(`  ✗ corrupt_json: ${c.path} — ${c.error}`);
      errors += 1;
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

  private assertRoleGranted(by: Identity, role: CheckerRole, dev?: boolean): void {
    const project = this.loadProject();
    const reviewers = project?.security?.reviewers;
    if (!reviewers || reviewers.length === 0) {
      if (dev === true) return;
      throw new Error('role_allowlist_empty: configure project.security.reviewers or use --dev locally');
    }
    const entry = reviewers.find((r) => r.id === by.id);
    if (!entry) {
      throw new Error(`role_not_granted: ${by.id} is not in project.security.reviewers`);
    }
    if (!entry.roles.includes(role) && !entry.roles.includes('admin')) {
      throw new Error(`role_not_granted: ${by.id} lacks role ${role}`);
    }
  }

  private beginApplyTransaction(proposal: Proposal): ApplyTransaction {
    this.ensureDirs();
    const id = `${proposal.id}-${Date.now()}-${process.pid}`;
    const journalPath = join(this.projectDir, 'sessions', `apply-${id}.json`);
    const files = this.applyTransactionTargets(proposal).map((path) => {
      const backupPath = `${path}.${id}.bak`;
      const existed = existsSync(path);
      if (existed) copyFileSync(path, backupPath);
      return { path, backupPath, existed };
    });
    this.writeJson(journalPath, {
      id,
      proposalId: proposal.id,
      status: 'started',
      files: files.map(({ path, backupPath, existed }) => ({ path, backupPath, existed })),
      startedAt: new Date().toISOString(),
    });
    return { id, journalPath, files };
  }

  private completeApplyTransaction(tx: ApplyTransaction): void {
    this.writeJson(tx.journalPath, {
      id: tx.id,
      status: 'committed',
      committedAt: new Date().toISOString(),
      files: tx.files.map(({ path, existed }) => ({ path, existed })),
    });
    this.cleanupBackups(tx);
  }

  private rollbackApplyTransaction(tx: ApplyTransaction, err: unknown): void {
    for (const file of tx.files) {
      if (file.existed) {
        copyFileSync(file.backupPath, file.path);
      } else if (existsSync(file.path)) {
        unlinkSync(file.path);
      }
    }
    this.writeJson(tx.journalPath, {
      id: tx.id,
      status: 'rolled_back',
      rolledBackAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
      files: tx.files.map(({ path, existed }) => ({ path, existed })),
    });
    this.cleanupBackups(tx);
  }

  private cleanupBackups(tx: ApplyTransaction): void {
    for (const file of tx.files) {
      if (existsSync(file.backupPath)) unlinkSync(file.backupPath);
    }
  }

  private applyTransactionTargets(proposal: Proposal): string[] {
    const targets = new Set<string>([
      join(this.projectDir, 'proposals', `${proposal.id}.json`),
    ]);
    const p = proposal.payload as Record<string, unknown>;
    if (proposal.kind === 'vendor_map') {
      const map = proposal.payload as VendorMap;
      if (map.vendor) targets.add(join(this.projectDir, 'maps', `${map.vendor}.json`));
    }
    if (proposal.kind === 'field_row' || proposal.kind === 'intent_wire' || proposal.kind === 'auth') {
      const vendor =
        proposal.vendor ??
        (typeof p.mapVendor === 'string' ? p.mapVendor : undefined) ??
        (typeof p.vendorMap === 'string' ? p.vendorMap : undefined) ??
        (typeof p.vendor === 'string' ? p.vendor : undefined);
      if (vendor) targets.add(join(this.projectDir, 'maps', `${vendor}.json`));
    }
    if (proposal.kind === 'domain_spec') {
      targets.add(join(this.projectDir, 'domain.json'));
    }
    return [...targets];
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

  private writeJson(path: string, data: unknown): void {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
    renameSync(tmp, path);
  }

  private readJson<T>(path: string): T | null {
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as T;
    } catch (err) {
      this.corruptArtifacts.push({
        path,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }
}

/**
 * Create a store for repoRoot.
 * @param projectDir - optional resolved absolute store root (from resolveProjectDir with CLI/env)
 */
export function createVendorMemoryStore(repoRoot: string, projectDir?: string): VendorMemoryStore {
  return new VendorMemoryStore(repoRoot, projectDir);
}
