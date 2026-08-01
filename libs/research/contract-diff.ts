/** Compare OpenAPI evidence against an applied VendorMap. Deterministic, no network. */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import type { VendorMap } from '../domain/types.js';
import { isVendorMapV2 } from '../domain/types.js';
import { parseOpenAPI } from './parse-openapi.js';
import type { ParsedOpenApi } from './types.js';

export type DriftSeverity = 'none' | 'additive' | 'breaking' | 'ambiguous';

export type DriftItemKind =
  | 'operation_added'
  | 'operation_removed'
  | 'field_added'
  | 'field_removed'
  | 'field_required_changed'
  | 'endpoint_changed'
  | 'version_changed'
  | 'no_baseline_map'
  | 'auth_hint';

export interface ContractDriftItem {
  kind: DriftItemKind;
  /** additive = safe expand; breaking = remove/require change; info = note only */
  severity: 'additive' | 'breaking' | 'info';
  detail: string;
  path?: string;
}

export interface ContractDriftReport {
  vendor: string;
  hasExistingMap: boolean;
  openapiTitle?: string;
  openapiVersion?: string;
  mapVersion?: string;
  /** sha256 of openapi body (content pin) */
  contractDigest: string;
  items: ContractDriftItem[];
  severity: DriftSeverity;
  summary: string;
}

export interface PinContractResult {
  /** Absolute path to pinned openapi snapshot */
  pinnedOpenApiPath: string;
  digest: string;
  contractDir: string;
}

function opKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

function mapEndpointKeys(map: VendorMap): Set<string> {
  const keys = new Set<string>();
  if (isVendorMapV2(map)) {
    for (const op of Object.values(map.operations ?? {})) {
      if (op?.endpoint?.method && op.endpoint.path) {
        keys.add(opKey(op.endpoint.method, op.endpoint.path));
      }
    }
    if (map.endpoint?.method && map.endpoint.path) {
      keys.add(opKey(map.endpoint.method, map.endpoint.path));
    }
  } else if (map.endpoint?.method && map.endpoint.path) {
    keys.add(opKey(map.endpoint.method, map.endpoint.path));
  }
  return keys;
}

interface MapFieldPresence {
  required: boolean;
}

function mapVendorFieldNames(map: VendorMap): Map<string, MapFieldPresence> {
  const names = new Map<string, MapFieldPresence>();
  const add = (vendor: string, optional?: boolean): void => {
    const prev = names.get(vendor);
    names.set(vendor, { required: Boolean(prev?.required) || optional !== true });
  };
  for (const row of map.fields ?? []) {
    if (row.vendor) add(row.vendor, row.optional);
  }
  if (isVendorMapV2(map)) {
    for (const binding of Object.values(map.intents ?? {})) {
      for (const row of binding.fields ?? []) {
        if (row.vendor) add(row.vendor, row.optional);
      }
    }
  }
  return names;
}

function openApiFieldNames(oa: ParsedOpenApi): Map<string, boolean> {
  /** name → required */
  const fields = new Map<string, boolean>();
  for (const op of oa.operations) {
    for (const f of op.bodyFields ?? []) {
      const prev = fields.get(f.name);
      fields.set(f.name, Boolean(prev) || Boolean(f.required));
    }
  }
  return fields;
}

function rollupSeverity(items: ContractDriftItem[]): DriftSeverity {
  if (items.length === 0) return 'none';
  if (items.some((i) => i.severity === 'breaking')) return 'breaking';
  if (items.some((i) => i.severity === 'additive')) return 'additive';
  if (items.some((i) => i.kind === 'no_baseline_map')) return 'ambiguous';
  return 'none';
}

/** Diff OpenAPI against an optional applied map. */
export function diffOpenApiAgainstMap(
  vendor: string,
  openapiRaw: string,
  map: VendorMap | null,
): ContractDriftReport {
  const digest = createHash('sha256').update(openapiRaw, 'utf8').digest('hex').slice(0, 16);
  const oa = parseOpenAPI(openapiRaw);
  const items: ContractDriftItem[] = [];

  if (!map) {
    items.push({
      kind: 'no_baseline_map',
      severity: 'info',
      detail: `No applied map for ${vendor}`,
    });
    const severity = rollupSeverity(items);
    return {
      vendor,
      hasExistingMap: false,
      openapiTitle: oa.title,
      openapiVersion: oa.version,
      contractDigest: digest,
      items,
      severity,
      summary: `First-time contract for ${vendor}: ${oa.operations.length} ops in OpenAPI (no map baseline)`,
    };
  }

  if (oa.version && map.version && oa.version !== map.version) {
    items.push({
      kind: 'version_changed',
      severity: 'info',
      detail: `OpenAPI info.version ${oa.version} vs map.version ${map.version}`,
    });
  }

  const mapOps = mapEndpointKeys(map);
  const oaOps = new Set(oa.operations.map((o) => opKey(o.method, o.path)));

  for (const k of oaOps) {
    if (!mapOps.has(k)) {
      items.push({
        kind: 'operation_added',
        severity: 'additive',
        detail: `OpenAPI has operation not in map: ${k}`,
        path: k,
      });
    }
  }
  for (const k of mapOps) {
    if (!oaOps.has(k) && !k.includes('REPLACE')) {
      items.push({
        kind: 'operation_removed',
        severity: 'breaking',
        detail: `Map endpoint missing from new OpenAPI: ${k}`,
        path: k,
      });
    }
  }

  // Single-endpoint maps: surface path change when exactly one op each side
  if (mapOps.size === 1 && oaOps.size === 1) {
    const [m] = [...mapOps];
    const [o] = [...oaOps];
    if (m && o && m !== o) {
      items.push({
        kind: 'endpoint_changed',
        severity: 'breaking',
        detail: `Primary endpoint changed: map ${m} → openapi ${o}`,
        path: o,
      });
    }
  }

  const mapFields = mapVendorFieldNames(map);
  const oaFields = openApiFieldNames(oa);

  for (const [name, required] of oaFields) {
    const mapped = mapFields.get(name);
    if (!mapped) {
      items.push({
        kind: 'field_added',
        severity: required ? 'breaking' : 'additive',
        detail: required
          ? `New required body field in OpenAPI (not in map): ${name}`
          : `New optional body field in OpenAPI (not in map): ${name}`,
        path: name,
      });
    } else if (mapped.required !== required) {
      items.push({
        kind: 'field_required_changed',
        severity: required ? 'breaking' : 'additive',
        detail: required
          ? `Body field became required in OpenAPI: ${name}`
          : `Body field became optional in OpenAPI: ${name}`,
        path: name,
      });
    }
  }
  for (const name of mapFields.keys()) {
    if (!oaFields.has(name) && !name.includes('REPLACE') && !name.startsWith('__')) {
      items.push({
        kind: 'field_removed',
        severity: 'breaking',
        detail: `Map vendor field not present in new OpenAPI body schemas: ${name}`,
        path: name,
      });
    }
  }

  if (oa.securitySchemes.length === 0 && map.auth?.type) {
    items.push({
      kind: 'auth_hint',
      severity: 'info',
      detail: `OpenAPI has no securitySchemes; map auth remains ${map.auth.type} (re-verify from docs)`,
    });
  }

  const severity = rollupSeverity(items);
  const breaking = items.filter((i) => i.severity === 'breaking').length;
  const additive = items.filter((i) => i.severity === 'additive').length;
  const summary =
    items.length === 0
      ? `No structural drift for ${vendor} (ops/fields align with OpenAPI)`
      : `Drift for ${vendor}: ${breaking} breaking, ${additive} additive, ${items.length} total`;

  return {
    vendor,
    hasExistingMap: true,
    openapiTitle: oa.title,
    openapiVersion: oa.version,
    mapVersion: map.version,
    contractDigest: digest,
    items,
    severity,
    summary,
  };
}

/** Pin OpenAPI under projectDir/out/contracts/<vendor>/. */
export function pinContractEvidence(opts: {
  projectDir: string;
  vendor: string;
  openapiPath: string;
  docUrls?: string[];
}): PinContractResult {
  const abs = resolve(opts.openapiPath);
  if (!existsSync(abs)) {
    throw new Error(`OpenAPI file not found: ${abs}`);
  }
  const raw = readFileSync(abs, 'utf8');
  const digest = createHash('sha256').update(raw, 'utf8').digest('hex').slice(0, 16);
  const contractDir = join(opts.projectDir, 'out', 'contracts', opts.vendor);
  mkdirSync(contractDir, { recursive: true });
  const pinnedOpenApiPath = join(contractDir, 'openapi.json');
  // Prefer parse-normalize when JSON; else raw copy
  try {
    const parsed = JSON.parse(raw) as unknown;
    writeFileSync(pinnedOpenApiPath, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
  } catch {
    copyFileSync(abs, pinnedOpenApiPath);
  }
  const meta = {
    vendor: opts.vendor,
    pinnedAt: new Date().toISOString(),
    sourcePath: abs,
    sourceBaseName: basename(abs),
    digest,
    docs: (opts.docUrls ?? []).map((url) => ({ title: 'doc', url })),
  };
  writeFileSync(join(contractDir, 'sources.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8');
  return { pinnedOpenApiPath, digest, contractDir };
}

/** Markdown runbook for contract update. */
export function formatContractUpdateMarkdown(opts: {
  vendor: string;
  drift: ContractDriftReport;
  pinnedOpenApiPath: string;
  sheetPath?: string;
  moduleRoot?: string;
  mode: 'heal' | 'first_time';
}): string {
  const { vendor, drift, pinnedOpenApiPath, sheetPath, moduleRoot, mode } = opts;
  const lines: string[] = [
    `# Contract update — \`${vendor}\``,
    '',
    `**Mode:** ${mode}`,
    '',
    drift.summary,
    '',
    `- Severity: **${drift.severity}**`,
    `- Contract digest: \`${drift.contractDigest}\``,
    `- Pinned OpenAPI: \`${pinnedOpenApiPath}\``,
    sheetPath ? `- Answer sheet: \`${sheetPath}\`` : '',
    drift.openapiVersion ? `- OpenAPI version: ${drift.openapiVersion}` : '',
    drift.mapVersion ? `- Map version: ${drift.mapVersion}` : '',
    '',
    '## Drift items',
    '',
  ].filter(Boolean);

  if (drift.items.length === 0) {
    lines.push('_None — re-validate dry-run and module tests._');
  } else {
    for (const it of drift.items) {
      lines.push(`- **${it.severity}** \`${it.kind}\`${it.path ? ` (${it.path})` : ''}: ${it.detail}`);
    }
  }

  lines.push('');
  lines.push('## Next');
  lines.push('');
  lines.push('```bash');
  lines.push(
    moduleRoot
      ? `layerkit heal run --vendor ${vendor} --openapi ${pinnedOpenApiPath} --module-root ${moduleRoot}`
      : `layerkit heal run --vendor ${vendor} --openapi ${pinnedOpenApiPath} --module-root <production-module>`,
  );
  lines.push(`layerkit process dry-run --vendor ${vendor} --intent <primary>`);
  lines.push('layerkit doctor --quality --strict');
  lines.push('```');
  lines.push('');
  lines.push('## Rules');
  lines.push('');
  lines.push('- Evidence only — sources[] from pinned contract / customer docs');
  lines.push('- Breaking severity → human/checker before promote');
  lines.push('- Do not invent fields missing from OpenAPI');
  lines.push('- No LLM on track()');
  lines.push('');

  return lines.join('\n');
}
