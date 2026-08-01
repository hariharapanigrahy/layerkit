/**
 * Deterministic fix-loop helpers for agent-authored patches.
 * The agent decides patch semantics from evidence; these helpers only apply
 * explicit patch objects and verify dry-run output.
 */
import type { Proposal, VendorMap, VendorMapV1 } from '../domain/types.js';
import { isVendorMapV1 } from '../domain/types.js';

/** Patch fixture shape for endpoint path correction. */
export interface MapPathFixPatch {
  /** Dot path into map payload, e.g. "endpoint.path" */
  field: string;
  /** Optional expected wrong value (asserted when present) */
  from?: string;
  /** Corrected value from docs */
  to: string;
  /** Why the fix is applied (for audit / citations) */
  reason?: string;
  /** Excerpt from vendor doc used as evidence */
  evidenceExcerpt?: string;
}

function setByDotPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    if (cur[p] == null || typeof cur[p] !== 'object') cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

function getByDotPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const p of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/**
 * Apply a deterministic path (or nested field) fix to a vendor map clone.
 * Dot paths support array indices (e.g. `fields.0.vendor`).
 */
export function applyMapPathFix(map: VendorMap, patch: MapPathFixPatch): VendorMap {
  const clone = structuredClone(map) as VendorMap;
  const field = patch.field || 'endpoint.path';

  if (patch.from !== undefined) {
    const current = getByDotPath(clone, field);
    if (current !== patch.from) {
      throw new Error(
        `fix-loop patch from mismatch: expected ${JSON.stringify(patch.from)}, got ${JSON.stringify(current)} at ${field}`,
      );
    }
  }

  setByDotPath(clone as unknown as Record<string, unknown>, field, patch.to);
  return clone;
}

/**
 * Apply an ordered sequence of map field patches. Each step clones; original is unchanged.
 * Empty patches array returns a clone of the input map.
 */
export function applyMapPatches(map: VendorMap, patches: MapPathFixPatch[]): VendorMap {
  let current = structuredClone(map) as VendorMap;
  for (const patch of patches) {
    current = applyMapPathFix(current, patch);
  }
  return current;
}

/** One step of a multi-step fix-loop simulation. */
export interface FixLoopStepResult {
  /** 0-based index of the applied patch */
  index: number;
  patch: MapPathFixPatch;
  /** Map state after this patch */
  map: VendorMap;
}

/**
 * Run sequential patches and return every intermediate map (after each step) plus final.
 * Deterministic pure-TS stand-in for "agent dry-run fails → patch → re-run".
 */
export function runSequentialMapFixes(
  map: VendorMap,
  patches: MapPathFixPatch[],
): { steps: FixLoopStepResult[]; final: VendorMap } {
  const steps: FixLoopStepResult[] = [];
  let current = structuredClone(map) as VendorMap;
  for (let i = 0; i < patches.length; i++) {
    const patch = patches[i]!;
    current = applyMapPathFix(current, patch);
    steps.push({ index: i, patch, map: current });
  }
  return { steps, final: current };
}

/** Expected wire shape for pure dry-run checks (no network). */
export interface WireExpectation {
  /** When true (default), result must not be skipped */
  notSkipped?: boolean;
  /** Expected wire.event_name */
  eventName?: string;
  /** Exact equality checks for wire fields (dot paths supported) */
  fields?: Record<string, unknown>;
  /** Keys that must exist on wire (top-level or nested via dot path) */
  requiredKeys?: string[];
  /** Keys that must NOT exist on wire */
  forbiddenKeys?: string[];
}

export interface DryRunCheckResult {
  ok: boolean;
  failures: string[];
}

/**
 * Evaluate applyVendorMap output against an expected wire shape.
 * Used by multi-step fix-loop gates to assert intermediate fails and final green.
 */
export function evaluateDryRunWire(
  result: { skipped: boolean; reason?: string; wire: Record<string, unknown> | null },
  expectation: WireExpectation,
): DryRunCheckResult {
  const failures: string[] = [];
  const notSkipped = expectation.notSkipped !== false;

  if (notSkipped && result.skipped) {
    failures.push(`map apply skipped: ${result.reason ?? 'unknown'}`);
  }
  if (!result.skipped && result.wire == null) {
    failures.push('map apply returned null wire without skip');
  }

  const wire = result.wire ?? {};

  if (expectation.eventName !== undefined) {
    if (wire.event_name !== expectation.eventName) {
      failures.push(
        `event_name: expected ${JSON.stringify(expectation.eventName)}, got ${JSON.stringify(wire.event_name)}`,
      );
    }
  }

  if (expectation.fields) {
    for (const [path, expected] of Object.entries(expectation.fields)) {
      const actual = getByDotPath(wire, path);
      if (actual !== expected) {
        failures.push(
          `field ${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
        );
      }
    }
  }

  for (const key of expectation.requiredKeys ?? []) {
    if (getByDotPath(wire, key) === undefined) {
      failures.push(`missing required wire key: ${key}`);
    }
  }

  for (const key of expectation.forbiddenKeys ?? []) {
    if (getByDotPath(wire, key) !== undefined) {
      failures.push(`forbidden wire key present: ${key}`);
    }
  }

  return { ok: failures.length === 0, failures };
}

/**
 * Apply fix patch to a vendor_map proposal payload; returns a new proposal.
 * Optionally appends a citation from the patch evidence.
 */
export function applyProposalMapFix(
  proposal: Proposal,
  patch: MapPathFixPatch,
  opts?: { addCitation?: boolean; sourceUrl?: string; sourceTitle?: string },
): Proposal {
  if (proposal.kind !== 'vendor_map') {
    throw new Error(`applyProposalMapFix expects kind vendor_map, got ${proposal.kind}`);
  }
  const payload = proposal.payload;
  if (!payload || typeof payload !== 'object') {
    throw new Error('proposal.payload required');
  }
  const fixedMap = applyMapPathFix(payload as VendorMap, patch);
  const next: Proposal = {
    ...proposal,
    payload: fixedMap,
  };

  if (opts?.addCitation !== false && (patch.evidenceExcerpt || opts?.sourceUrl)) {
    const sources = [...(proposal.sources ?? [])];
    sources.push({
      title: opts?.sourceTitle ?? 'Vendor doc fix-loop evidence',
      url: opts?.sourceUrl ?? 'https://docs.example-acme.test/events',
      excerpt: patch.evidenceExcerpt ?? patch.reason ?? `Correct ${patch.field} to ${patch.to}`,
    });
    next.sources = sources;
  }

  return next;
}

/**
 * Apply an ordered sequence of patches to a vendor_map proposal.
 * Citations from each patch with evidence are appended (when enabled).
 */
export function applyProposalMapFixes(
  proposal: Proposal,
  patches: MapPathFixPatch[],
  opts?: { addCitation?: boolean; sourceUrl?: string; sourceTitle?: string },
): Proposal {
  let current = proposal;
  for (const patch of patches) {
    current = applyProposalMapFix(current, patch, opts);
  }
  return current;
}

/** Type guard helper for tests that assert v1 shape after fix. */
export function asV1Map(map: VendorMap): VendorMapV1 {
  if (!isVendorMapV1(map)) {
    throw new Error('expected VendorMapV1');
  }
  return map;
}
