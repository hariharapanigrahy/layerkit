/**
 * Multi-vendor track() orchestrator.
 *
 * Normative status filter:
 * - live   → only maps with status `live`
 * - dry_run / shadow → `live` + `map_complete`
 *
 * Pipeline per vendor: applyVendorMap → evaluatePrivacy → result.
 * (Flow path: executeFlow when map carries a flow; legacy linear otherwise.)
 */
import type { VendorMap } from '../domain/types.js';
import { evaluatePrivacy } from '../privacy/gate.js';
import type { PrivacyPolicy, RuntimeMode } from '../privacy/types.js';
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
  /** Default true — live requires policy */
  requirePrivacyPolicyForLive?: boolean;
  /** Sequential (default) or parallel vendor fan-out */
  vendorExecution?: 'sequential' | 'parallel';
  vendorFailurePolicy?: 'continue_all' | 'fail_fast';
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

async function runOne(
  map: MapWithFlow,
  event: DomainEvent,
  mode: TrackMode,
  opts: TrackOptions,
): Promise<VendorTrackResult> {
  // Prefer inline flow when present
  if (map.flow) {
    const flowResult = executeFlow(map.flow, event, {
      mode,
      privacyPolicy: opts.privacyPolicy ?? null,
    });
    if (flowResult.status === 'skip') {
      return {
        vendor: map.vendor,
        skipped: true,
        reason: flowResult.reasonCode ?? flowResult.reason,
        outcome: 'skipped',
        mode,
        wire: null,
        warnings: [],
      };
    }
    if (flowResult.status === 'abort' || flowResult.status === 'failure') {
      return {
        vendor: map.vendor,
        skipped: false,
        reason: flowResult.reasonCode ?? flowResult.reason,
        outcome: 'failure',
        mode,
        wire: flowResult.memory.payload,
        warnings: [],
      };
    }
    return {
      vendor: map.vendor,
      skipped: false,
      outcome: 'success',
      mode,
      wire: flowResult.memory.payload,
      httpStatus: flowResult.callLog[flowResult.callLog.length - 1]?.response.httpStatus,
      warnings: [],
    };
  }

  // Legacy linear: map → privacy
  const mapped = applyVendorMap(event, map);
  if (mapped.skipped) {
    return {
      vendor: map.vendor,
      skipped: true,
      reason: mapped.reason,
      outcome: 'skipped',
      mode,
      wire: null,
      mapResult: mapped,
    };
  }

  const policy =
    opts.privacyPolicy === undefined ? null : opts.privacyPolicy;
  // requirePrivacyPolicyForLive is enforced inside evaluatePrivacy for live+null
  const privacy = evaluatePrivacy(
    event,
    mapped.wire,
    policy,
    mode,
  );

  if (privacy.action === 'fail') {
    return {
      vendor: map.vendor,
      skipped: false,
      reason: privacy.reasonCode,
      outcome: 'failure',
      mode,
      wire: null,
      mapResult: mapped,
      warnings: privacy.warnings,
    };
  }
  if (privacy.action === 'drop') {
    return {
      vendor: map.vendor,
      skipped: true,
      reason: privacy.reasonCode,
      outcome: 'skipped',
      mode,
      wire: null,
      mapResult: mapped,
      warnings: privacy.warnings,
    };
  }

  return {
    vendor: map.vendor,
    skipped: false,
    outcome: 'success',
    mode,
    wire: privacy.payload,
    mapResult: mapped,
    warnings: privacy.warnings,
  };
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
