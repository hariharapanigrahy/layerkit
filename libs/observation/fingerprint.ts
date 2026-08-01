/**
 * wireFingerprint: SHA-256 of canonical non-PII wire JSON.
 * Does not infer PII from field names; classification belongs to policy/agent.
 */
import { createHash } from 'node:crypto';
import type { ObservationConfig, TelemetryPii } from './types.js';

const EMAIL_VALUE_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

export interface FingerprintOptions {
  telemetryPii?: TelemetryPii;
  telemetryFieldAllowlist?: string[];
  /** Extra path prefixes treated as PII (dot paths) */
  piiPaths?: string[];
}

/**
 * Compute wire fingerprint after dropping explicitly marked PII paths.
 * Returns hex sha256 of canonical JSON, or undefined if nothing remains.
 */
export function wireFingerprint(
  wire: unknown,
  opts?: FingerprintOptions | Pick<ObservationConfig, 'telemetryPii' | 'telemetryFieldAllowlist'>,
): string | undefined {
  const telemetryPii = opts?.telemetryPii ?? 'never';
  const allowlist = opts?.telemetryFieldAllowlist;
  const scrubbed = scrubWire(wire, {
    telemetryPii,
    allowlist,
    piiPaths: (opts as FingerprintOptions | undefined)?.piiPaths,
  });
  if (scrubbed === undefined || scrubbed === null) return undefined;
  if (typeof scrubbed === 'object' && !Array.isArray(scrubbed) && Object.keys(scrubbed as object).length === 0) {
    return undefined;
  }
  const canonical = canonicalize(scrubbed);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Scrub wire for audit payload inspection.
 * This is deliberately not a semantic classifier: callers must pass piiPaths
 * or telemetryFieldAllowlist from agent/user-owned policy.
 */
export function scrubWire(
  wire: unknown,
  opts: {
    telemetryPii: TelemetryPii;
    allowlist?: string[];
    piiPaths?: string[];
  },
): unknown {
  if (wire === null || wire === undefined) return wire;

  if (opts.telemetryPii === 'allowlist' && opts.allowlist?.length) {
    if (typeof wire !== 'object' || wire === null) return undefined;
    const out: Record<string, unknown> = {};
    for (const path of opts.allowlist) {
      const v = getPath(wire as Record<string, unknown>, path);
      if (v !== undefined && !looksLikePiiValue(v)) {
        setPath(out, path, v);
      }
    }
    return out;
  }

  return deepDropDeclaredPii(wire, opts.piiPaths ?? []);
}

function deepDropDeclaredPii(value: unknown, piiPaths: string[], path = ''): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    // Last-resort audit safety only; field meaning still belongs to policy/agent.
    if (EMAIL_VALUE_RE.test(value)) return undefined;
    return value;
  }
  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value
      .map((v) => deepDropDeclaredPii(v, piiPaths, path ? `${path}[]` : '[]'))
      .filter((v) => v !== undefined);
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const childPath = path ? `${path}.${k}` : k;
    if (piiPaths.some((p) => childPath === p || childPath.startsWith(p + '.'))) {
      continue;
    }
    const scrubbed = deepDropDeclaredPii(v, piiPaths, childPath);
    if (scrubbed !== undefined) {
      out[k] = scrubbed;
    }
  }
  return out;
}

function looksLikePiiValue(v: unknown): boolean {
  return typeof v === 'string' && EMAIL_VALUE_RE.test(v);
}

function getPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    if (!(p in cur) || typeof cur[p] !== 'object' || cur[p] === null) {
      cur[p] = {};
    }
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

/** Sorted-keys JSON, no whitespace. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    out[k] = sortKeys(obj[k]);
  }
  return out;
}

/**
 * Assert helper: raw email must not appear in serialized audit payload.
 */
export function auditPayloadHasRawPii(payload: unknown): boolean {
  const s = JSON.stringify(payload);
  return EMAIL_VALUE_RE.test(s);
}
