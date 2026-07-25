/**
 * Customer-owned domain↔wire binding convention.
 *
 * Domain operations are a generic product concept; how an org encodes them in
 * OpenAPI (x-domain-op, x-*-domain-op, operationId only, …) is project config —
 * never hardcoded per vendor or per customer in Layerkit core.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ParsedOpenApi, ParsedOpenApiOperation } from '../research/types.js';

/** Relative path under projectDir for the convention file. */
export const DOMAIN_BINDING_REL = join('memory', 'runbooks', 'domain-binding.json');

export type DomainIntentSource =
  | 'openapi_extension'
  | 'operationId'
  | 'path_method'
  | 'unresolved';

export interface DomainBindingConvention {
  schemaVersion: 1;
  /**
   * Exact OpenAPI extension keys to treat as domain intent when present
   * (e.g. "x-domain-op"). Empty by default — org fills when they use extensions.
   */
  openapiExtensionKeys: string[];
  /**
   * When true (default), also accept any extension key matching x-*-domain-op
   * (case-insensitive on the domain-op suffix). Product-prefix agnostic.
   */
  acceptXStarDomainOp: boolean;
  /** Fallback order when extension missing. Default: operationId then path_method. */
  intentFrom: Array<'openapi_extension' | 'operationId' | 'path_method'>;
  notes?: string;
}

export const DEFAULT_DOMAIN_BINDING: DomainBindingConvention = {
  schemaVersion: 1,
  openapiExtensionKeys: [],
  acceptXStarDomainOp: true,
  intentFrom: ['openapi_extension', 'operationId', 'path_method'],
  notes:
    'Customer-owned. Set openapiExtensionKeys if your org uses a fixed x-* key. ' +
    'acceptXStarDomainOp matches any x-*-domain-op without coding per company.',
};

export interface ResolvedDomainIntent {
  /** Domain intent id when resolved; empty when unresolved */
  intentId: string;
  source: DomainIntentSource;
  /** Evidence excerpt for citations */
  evidence: string;
  operation: {
    method: string;
    path: string;
    operationId?: string;
  };
}

function isXStarDomainOpKey(key: string): boolean {
  // x-domain-op OR x-<anything>-domain-op
  return /^x-([a-z0-9]+-)*domain-op$/i.test(key) || /^x-domain-op$/i.test(key);
}

/**
 * Pick domain intent string from one operation using convention (no invent).
 */
export function resolveIntentForOperation(
  op: ParsedOpenApiOperation,
  convention: DomainBindingConvention = DEFAULT_DOMAIN_BINDING,
): ResolvedDomainIntent {
  const base = {
    operation: {
      method: op.method,
      path: op.path,
      operationId: op.operationId,
    },
  };

  const order = convention.intentFrom?.length
    ? convention.intentFrom
    : DEFAULT_DOMAIN_BINDING.intentFrom;

  for (const step of order) {
    if (step === 'openapi_extension' && op.extensions) {
      // Exact keys first
      for (const key of convention.openapiExtensionKeys ?? []) {
        const v = op.extensions[key];
        if (v?.trim()) {
          return {
            ...base,
            intentId: v.trim(),
            source: 'openapi_extension',
            evidence: `${key}=${v.trim()}`,
          };
        }
      }
      // Generic x-*-domain-op
      if (convention.acceptXStarDomainOp !== false) {
        for (const [k, v] of Object.entries(op.extensions)) {
          if (isXStarDomainOpKey(k) && v?.trim()) {
            return {
              ...base,
              intentId: v.trim(),
              source: 'openapi_extension',
              evidence: `${k}=${v.trim()}`,
            };
          }
        }
      }
    }

    if (step === 'operationId' && op.operationId?.trim()) {
      return {
        ...base,
        intentId: op.operationId.trim(),
        source: 'operationId',
        evidence: `operationId=${op.operationId.trim()}`,
      };
    }

    if (step === 'path_method') {
      const id = `${op.method.toLowerCase()}_${op.path.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
      return {
        ...base,
        intentId: id,
        source: 'path_method',
        evidence: `${op.method} ${op.path}`,
      };
    }
  }

  return {
    ...base,
    intentId: '',
    source: 'unresolved',
    evidence: `${op.method} ${op.path} (no intent source matched)`,
  };
}

/** Resolve all operations in a parsed OpenAPI document. */
export function resolveIntentsFromOpenApi(
  parsed: ParsedOpenApi,
  convention: DomainBindingConvention = DEFAULT_DOMAIN_BINDING,
): ResolvedDomainIntent[] {
  return parsed.operations.map((op) => resolveIntentForOperation(op, convention));
}

export function domainBindingPath(projectDir: string): string {
  return join(projectDir, DOMAIN_BINDING_REL);
}

export function loadDomainBinding(projectDir: string): DomainBindingConvention {
  const path = domainBindingPath(projectDir);
  if (!existsSync(path)) return { ...DEFAULT_DOMAIN_BINDING };
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<DomainBindingConvention>;
    return {
      schemaVersion: 1,
      openapiExtensionKeys: Array.isArray(raw.openapiExtensionKeys)
        ? raw.openapiExtensionKeys.filter((x) => typeof x === 'string')
        : [],
      acceptXStarDomainOp: raw.acceptXStarDomainOp !== false,
      intentFrom:
        Array.isArray(raw.intentFrom) && raw.intentFrom.length
          ? (raw.intentFrom as DomainBindingConvention['intentFrom'])
          : [...DEFAULT_DOMAIN_BINDING.intentFrom],
      notes: typeof raw.notes === 'string' ? raw.notes : DEFAULT_DOMAIN_BINDING.notes,
    };
  } catch {
    return { ...DEFAULT_DOMAIN_BINDING };
  }
}

export function writeDomainBinding(
  projectDir: string,
  convention: DomainBindingConvention = DEFAULT_DOMAIN_BINDING,
): string {
  const path = domainBindingPath(projectDir);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(convention, null, 2) + '\n', 'utf8');
  return path;
}

export function formatDomainBindingMarkdown(c: DomainBindingConvention): string {
  return [
    '# Domain binding convention',
    '',
    'Customer-owned. Controls how wire operations bind to domain intents.',
    'No vendor-specific logic in Layerkit core.',
    '',
    '```json',
    JSON.stringify(c, null, 2),
    '```',
    '',
  ].join('\n');
}
