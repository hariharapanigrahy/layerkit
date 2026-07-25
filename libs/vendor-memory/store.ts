import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveProjectDir } from '../config/project-dir.js';
import { buildPocVendorMaps, COMMERCE_DOMAIN } from '../domain/commerce.js';
import type { DomainSpec, LayerProject, Proposal, VendorMap } from '../domain/types.js';
import { validateProposal, validateVendorMap } from '../proposal/validate.js';
import { mapSchemaVersion } from './migrate.js';

const STORE_SUBDIRS = [
  'maps',
  'processors',
  'proposals',
  'out',
  'sessions',
  'memory',
  'privacy',
  'flows',
  'audit',
  'dlq',
  'idempotency',
] as const;

const MEMORY_INDEX_SKELETON = `# Layerkit memory index

Canonical markdown memory stack for this project.

## Entries

_None yet. Use \`layerkit memory append\` or agent skills to record research/approvals._
`;

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
      languages: ['java'],
      javaPackage: 'io.layerkit.commerce',
      domain: COMMERCE_DOMAIN,
      vendors: opts.poc ? buildPocVendorMaps().map((m) => m.vendor) : [],
      dataLayerVersionId: `${opts.name}@0.1.0`,
    };
    this.writeJson(join(this.projectDir, 'project.json'), project);
    this.writeJson(join(this.projectDir, 'domain.json'), COMMERCE_DOMAIN);
    this.ensureMemoryIndex();
    if (opts.poc) {
      for (const m of buildPocVendorMaps()) {
        this.saveMap(m);
      }
    }
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

  reviewProposal(proposal: Proposal): { valid: boolean; errors: string[]; warnings: string[] } {
    const issues = validateProposal(proposal);
    return {
      valid: issues.every((i) => i.level !== 'error'),
      errors: issues.filter((i) => i.level === 'error').map((i) => i.message),
      warnings: issues.filter((i) => i.level === 'warn').map((i) => i.message),
    };
  }

  applyProposal(proposal: Proposal): { kind: string; target: string } {
    const review = this.reviewProposal(proposal);
    if (!review.valid) {
      throw new Error(`Invalid proposal:\n${review.errors.map((e) => `- ${e}`).join('\n')}`);
    }
    if (proposal.kind === 'vendor_map') {
      const map = proposal.payload as VendorMap;
      this.saveMap(map);
      proposal.status = 'applied';
      this.saveProposal(proposal);
      return { kind: 'vendor_map', target: map.vendor };
    }
    if (proposal.kind === 'processor') {
      const id = proposal.processorId ?? proposal.id;
      this.writeJson(
        join(this.projectDir, 'processors', `${id.replace(/\./g, '_')}.json`),
        proposal.payload,
      );
      proposal.status = 'applied';
      this.saveProposal(proposal);
      return { kind: 'processor', target: id };
    }
    throw new Error(`Apply not implemented for kind=${proposal.kind}`);
  }

  doctor(): { ok: boolean; lines: string[] } {
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
    const maps = this.listMaps();
    lines.push(`Vendor maps: ${maps.length}`);
    let errors = 0;
    const domain = this.loadDomain() ?? undefined;
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
    }
    lines.push(errors ? `Doctor found ${errors} error(s)` : 'Doctor OK');
    return { ok: errors === 0, lines };
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
