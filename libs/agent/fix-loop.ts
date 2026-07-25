/**
 * Deterministic fix-loop helpers for agent process-quality evals.
 * Pure TS simulation of "agent reads doc → patches wrong map path" — no LLM.
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

export interface PathMismatch {
  mismatch: boolean;
  mapPath?: string;
  /** Path extracted from doc (e.g. /events) */
  suggestedPath?: string;
  detail?: string;
}

/**
 * Extract first HTTP path-looking token from a doc excerpt.
 * Matches patterns like `POST /events`, path: `/v1/events`, `path `/events``.
 */
export function extractPathFromDocExcerpt(doc: string): string | undefined {
  // Prefer explicit "path: /..." or "path `/...`"
  const labeled =
    doc.match(/\bpath\s*[:=]\s*[`"]?(\/[A-Za-z0-9_{}\-./]+)[`"]?/i) ??
    doc.match(/\bendpoint\s*[:=]\s*[`"]?(\/[A-Za-z0-9_{}\-./]+)[`"]?/i);
  if (labeled?.[1]) return labeled[1];

  // METHOD /path
  const methodPath = doc.match(
    /\b(?:GET|POST|PUT|PATCH|DELETE)\s+([`"]?)(\/[A-Za-z0-9_{}\-./]+)\1/i,
  );
  if (methodPath?.[2]) return methodPath[2];

  // bare `/something` after "correct" / "use" wording
  const bare = doc.match(
    /\b(?:use|correct|actual|endpoint)\b[^/\n]*(\/[A-Za-z0-9_{}\-./]+)/i,
  );
  if (bare?.[1]) return bare[1];

  return undefined;
}

function getEndpointPath(map: VendorMap): string | undefined {
  if (isVendorMapV1(map)) {
    return map.endpoint?.path;
  }
  // v2: first operation path or legacy mirror
  if (map.endpoint?.path) return map.endpoint.path;
  const ops = Object.values(map.operations ?? {});
  return ops[0]?.endpoint?.path;
}

/**
 * Compare map endpoint path against a doc excerpt; report mismatch + suggested path.
 */
export function detectPathMismatch(map: VendorMap, docExcerpt: string): PathMismatch {
  const mapPath = getEndpointPath(map);
  const suggestedPath = extractPathFromDocExcerpt(docExcerpt);
  if (!mapPath) {
    return {
      mismatch: true,
      mapPath,
      suggestedPath,
      detail: 'map has no endpoint path',
    };
  }
  if (!suggestedPath) {
    return {
      mismatch: false,
      mapPath,
      suggestedPath: undefined,
      detail: 'doc excerpt has no extractable path',
    };
  }
  const mismatch = mapPath !== suggestedPath;
  return {
    mismatch,
    mapPath,
    suggestedPath,
    detail: mismatch
      ? `map path "${mapPath}" differs from doc path "${suggestedPath}"`
      : 'paths match',
  };
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
 * Convenience: build a path patch from map + doc when mismatch detected.
 */
export function pathFixFromDoc(map: VendorMap, docExcerpt: string): MapPathFixPatch | null {
  const det = detectPathMismatch(map, docExcerpt);
  if (!det.mismatch || !det.suggestedPath || !det.mapPath) return null;
  return {
    field: 'endpoint.path',
    from: det.mapPath,
    to: det.suggestedPath,
    reason: det.detail,
    evidenceExcerpt: docExcerpt.slice(0, 240),
  };
}

/** Type guard helper for tests that assert v1 shape after fix. */
export function asV1Map(map: VendorMap): VendorMapV1 {
  if (!isVendorMapV1(map)) {
    throw new Error('expected VendorMapV1');
  }
  return map;
}
