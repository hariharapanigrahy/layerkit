/**
 * Multi-vendor track() orchestrator.
 *
 * Normative status filter:
 * - live   → only maps with status `live`
 * - dry_run / shadow → `live` + `map_complete`
 *
 * Pipeline per vendor:
 * - legacy: applyVendorMap → evaluatePrivacy
 * - flow:   executeFlow → evaluatePrivacy (always; injects gate if flow had no privacy node)
 */
import type { VendorMap } from '../domain/types.js';
import { evaluatePrivacy } from '../privacy/gate.js';
import type { PrivacyEvent, PrivacyPolicy, PrivacyResult, RuntimeMode } from '../privacy/types.js';
import { executeFlow } from '../flow/engine.js';
import type { IntegrationFlow } from '../flow/types.js';
import { applyVendorMap, type DomainEvent, type MapResult } from '../vendor-memory/map-engine.js';

export type TrackMode = RuntimeMode;

export interface TrackOptions {
  mode?: TrackMode;
  /** Override status filter; default depends on mode */
  includeStatuses?: Array<'live' | 'map_complete' | 'skeleton' | 'deprecated'>;
  /** Privacy policy (null/undefined → gate missing-policy posture) */
  privacyPolicy?: PrivacyPolicy | null;
  /**
   * Default true — live mode requires an applied privacy policy.
   * When false, live + missing policy allows with warn `privacy_policy_missing`
   * (same posture as dry_run).
   */
  requirePrivacyPolicyForLive?: boolean;
  /** Sequential (default) or parallel vendor fan-out */
  vendorExecution?: 'sequential' | 'parallel';
  vendorFailurePolicy?: 'continue_all' | 'fail_fast';
  /** Load agent processors from this directory during map apply */
  processorsDir?: string;
}

export interface VendorTrackResult {
  vendor: string;
  skipped: boolean;
  reason?: string;
  outcome: 'success' | 'failure' | 'skipped';
  mode: TrackMode;
  operationId?: string;
  httpStatus?: number;
  errorClass?: string;
  auditId?: string;
  /** Final wire after privacy (when allowed) */
  wire?: Record<string, unknown> | null;
  mapResult?: MapResult;
  warnings?: string[];
}

export interface TrackResult {
  eventId?: string;
  results: VendorTrackResult[];
}

export function defaultStatusesForMode(
  mode: TrackMode,
): Array<'live' | 'map_complete'> {
  if (mode === 'live') return ['live'];
  return ['live', 'map_complete'];
}

/** Maps that may carry optional flow (v2-shaped without requiring domain union yet). */
type MapWithFlow = VendorMap & {
  flow?: IntegrationFlow;
  flowRef?: string;
  privacyPolicyId?: string;
};

function mapStatus(map: VendorMap): string {
  return map.status ?? 'skeleton';
}

function resolvePolicy(opts: TrackOptions): PrivacyPolicy | null {
  return opts.privacyPolicy === undefined ? null : opts.privacyPolicy;
}

function privacyOpts(opts: TrackOptions): { requirePrivacyPolicyForLive: boolean } {
  return {
    requirePrivacyPolicyForLive: opts.requirePrivacyPolicyForLive !== false,
  };
}

/** Map a PrivacyResult onto a VendorTrackResult (shared by linear + flow paths). */
function fromPrivacy(
  base: Omit<VendorTrackResult, 'skipped' | 'outcome' | 'reason' | 'wire' | 'warnings'> & {
    mapResult?: MapResult;
    httpStatus?: number;
  },
  privacy: PrivacyResult,
): VendorTrackResult {
  if (privacy.action === 'fail') {
    return {
      ...base,
      skipped: false,
      reason: privacy.reasonCode,
      outcome: 'failure',
      wire: null,
      warnings: privacy.warnings,
    };
  }
  if (privacy.action === 'drop') {
    return {
      ...base,
      skipped: true,
      reason: privacy.reasonCode,
      outcome: 'skipped',
      wire: null,
      warnings: privacy.warnings,
    };
  }
  return {
    ...base,
    skipped: false,
    outcome: 'success',
    wire: privacy.payload,
    warnings: privacy.warnings,
  };
}

async function runOne(
  map: MapWithFlow,
  event: DomainEvent,
  mode: TrackMode,
  opts: TrackOptions,
): Promise<VendorTrackResult> {
  const policy = resolvePolicy(opts);
  const pOpts = privacyOpts(opts);
  const base = { vendor: map.vendor, mode };

  // Prefer inline flow when present
  if (map.flow) {
    const flowResult = executeFlow(map.flow, event, {
      mode,
      privacyPolicy: policy,
    });
    if (flowResult.status === 'skip') {
      return {
        ...base,
        skipped: true,
        reason: flowResult.reasonCode ?? flowResult.reason,
        outcome: 'skipped',
        wire: null,
        warnings: [],
      };
    }
    if (flowResult.status === 'abort' || flowResult.status === 'failure') {
      return {
        ...base,
        skipped: false,
        reason: flowResult.reasonCode ?? flowResult.reason,
        outcome: 'failure',
        wire: flowResult.memory.payload,
        warnings: [],
      };
    }

    // Always inject privacy after successful flow (covers graphs with no privacy node).
    // Design: privacy before egress; track is the last gate before vendor result.
    const privacy = evaluatePrivacy(
      event as PrivacyEvent,
      flowResult.memory.payload,
      policy,
      mode,
      pOpts,
    );
    const lastHttp =
      flowResult.callLog[flowResult.callLog.length - 1]?.response.httpStatus;
    return fromPrivacy(
      {
        ...base,
        httpStatus: privacy.action === 'allow' ? lastHttp : undefined,
      },
      privacy,
    );
  }

  // Legacy linear: map → privacy
  const mapped = applyVendorMap(event, map, {
    processorsDir: opts.processorsDir,
  });
  if (mapped.skipped) {
    return {
      ...base,
      skipped: true,
      reason: mapped.reason,
      outcome: 'skipped',
      wire: null,
      mapResult: mapped,
    };
  }

  const privacy = evaluatePrivacy(
    event as PrivacyEvent,
    mapped.wire,
    policy,
    mode,
    pOpts,
  );

  return fromPrivacy({ ...base, mapResult: mapped }, privacy);
}

/**
 * Fan-out domain event across vendor maps with status filter + privacy gate.
 */
export async function track(
  event: DomainEvent,
  maps: VendorMap[],
  opts: TrackOptions = {},
): Promise<TrackResult> {
  const mode: TrackMode = opts.mode ?? 'live';
  const allowed = new Set<string>(opts.includeStatuses ?? defaultStatusesForMode(mode));
  const selected = maps.filter((m) => allowed.has(mapStatus(m)));

  const failPolicy = opts.vendorFailurePolicy ?? 'continue_all';
  const exec = opts.vendorExecution ?? 'sequential';
  const results: VendorTrackResult[] = [];

  if (exec === 'parallel') {
    const settled = await Promise.all(selected.map((m) => runOne(m as MapWithFlow, event, mode, opts)));
    results.push(...settled);
  } else {
    for (const m of selected) {
      const r = await runOne(m as MapWithFlow, event, mode, opts);
      results.push(r);
      if (failPolicy === 'fail_fast' && r.outcome === 'failure') break;
    }
  }

  return {
    eventId: event.eventId,
    results,
  };
}
