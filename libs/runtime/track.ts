/**
 * Multi-vendor track() orchestrator.
 *
 * Normative status filter:
 * - live   → only maps with status `live`
 * - dry_run / shadow → `live` + `map_complete`
 *
 * Pipeline per vendor:
 * - flow (inline or flowRef from projectDir): executeFlow → evaluatePrivacy
 * - legacy: applyVendorMap → evaluatePrivacy
 *
 * Production contracts:
 * - Empty eligible maps → diagnostics (never silent "success")
 * - privacyPolicy from opts or projectDir/privacy/*.json
 * - optional observation bus for audit
 */
import type { VendorMap } from '../domain/types.js';
import { evaluatePrivacy } from '../privacy/gate.js';
import { loadPrivacyPolicy } from '../privacy/load.js';
import type { PrivacyEvent, PrivacyPolicy, PrivacyResult, RuntimeMode } from '../privacy/types.js';
import { executeFlow } from '../flow/engine.js';
import type { IntegrationFlow } from '../flow/types.js';
import {
  createObservationBus,
  type ObservationBus,
} from '../observation/sinks.js';
import type { ObservationConfig } from '../observation/types.js';
import { applyVendorMap, type DomainEvent, type MapResult } from '../vendor-memory/map-engine.js';
import { resolveMapFlow } from './load-flow.js';

export type TrackMode = RuntimeMode;

export interface FilteredMapInfo {
  vendor: string;
  status: string;
  reason: string;
}

export interface TrackOptions {
  mode?: TrackMode;
  /** Override status filter; default depends on mode */
  includeStatuses?: Array<'live' | 'map_complete' | 'skeleton' | 'deprecated'>;
  /**
   * Explicit privacy policy. When omitted and `projectDir` is set, load from disk.
   * Pass `null` to force no policy (dry_run warns; live fails closed).
   */
  privacyPolicy?: PrivacyPolicy | null;
  /**
   * Project store root — loads privacy/*.json, flows/*.json, default observation file sink.
   */
  projectDir?: string;
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
  /**
   * Observation bus or auto-create from projectDir (file audit under audit/).
   * Pass `false` to disable. Default: auto when projectDir set.
   */
  observation?: ObservationBus | ObservationConfig | false;
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
  /** Maps excluded by status filter (not run) */
  filteredOut?: FilteredMapInfo[];
  /**
   * Populated when zero vendors produced results (no maps or all filtered).
   * Production apps must treat empty results as a diagnosable condition.
   */
  diagnostics?: string[];
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

function privacyOpts(opts: TrackOptions): { requirePrivacyPolicyForLive: boolean } {
  return {
    requirePrivacyPolicyForLive: opts.requirePrivacyPolicyForLive !== false,
  };
}

function resolvePolicyForMap(
  map: MapWithFlow,
  opts: TrackOptions,
): PrivacyPolicy | null {
  if (opts.privacyPolicy !== undefined) {
    return opts.privacyPolicy;
  }
  if (opts.projectDir) {
    return loadPrivacyPolicy({
      projectDir: opts.projectDir,
      policyId: map.privacyPolicyId,
      vendor: map.vendor,
    });
  }
  return null;
}

function resolveObservation(opts: TrackOptions): ObservationBus | undefined {
  if (opts.observation === false) return undefined;
  if (opts.observation && typeof opts.observation === 'object' && 'emitAudit' in opts.observation) {
    return opts.observation as ObservationBus;
  }
  if (opts.projectDir) {
    const config =
      opts.observation && typeof opts.observation === 'object' && 'schemaVersion' in opts.observation
        ? (opts.observation as ObservationConfig)
        : undefined;
    return createObservationBus({ projectDir: opts.projectDir, config });
  }
  return undefined;
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
  bus?: ObservationBus,
): Promise<VendorTrackResult> {
  const t0 = Date.now();
  const policy = resolvePolicyForMap(map, opts);
  const pOpts = privacyOpts(opts);
  const base = { vendor: map.vendor, mode };
  const flow = resolveMapFlow(map, opts.projectDir);

  let result: VendorTrackResult;

  if (flow) {
    const flowResult = executeFlow(flow, event, {
      mode,
      privacyPolicy: policy,
    });
    if (flowResult.status === 'skip') {
      result = {
        ...base,
        skipped: true,
        reason: flowResult.reasonCode ?? flowResult.reason,
        outcome: 'skipped',
        wire: null,
        warnings: [],
      };
    } else if (flowResult.status === 'abort' || flowResult.status === 'failure') {
      result = {
        ...base,
        skipped: false,
        reason: flowResult.reasonCode ?? flowResult.reason,
        outcome: 'failure',
        wire: flowResult.memory.payload,
        warnings: [],
      };
    } else {
      const privacy = evaluatePrivacy(
        event as PrivacyEvent,
        flowResult.memory.payload,
        policy,
        mode,
        pOpts,
      );
      const lastHttp =
        flowResult.callLog[flowResult.callLog.length - 1]?.response.httpStatus;
      result = fromPrivacy(
        {
          ...base,
          httpStatus: privacy.action === 'allow' ? lastHttp : undefined,
        },
        privacy,
      );
    }
  } else {
    // Legacy linear: map → privacy
    const mapped = applyVendorMap(event, map, {
      processorsDir: opts.processorsDir,
    });
    if (mapped.skipped) {
      result = {
        ...base,
        skipped: true,
        reason: mapped.reason,
        outcome: 'skipped',
        wire: null,
        mapResult: mapped,
        warnings: mapped.missingDomainPaths?.length
          ? [`missing_domain_paths:${mapped.missingDomainPaths.join(',')}`]
          : undefined,
      };
    } else {
      const privacy = evaluatePrivacy(
        event as PrivacyEvent,
        mapped.wire,
        policy,
        mode,
        pOpts,
      );
      result = fromPrivacy({ ...base, mapResult: mapped }, privacy);
      if (mapped.missingDomainPaths?.length) {
        result.warnings = [
          ...(result.warnings ?? []),
          `missing_domain_paths:${mapped.missingDomainPaths.join(',')}`,
        ];
      }
    }
  }

  if (bus) {
    const durationMs = Date.now() - t0;
    const stage =
      result.outcome === 'skipped'
        ? 'skip'
        : result.mapResult
          ? 'map'
          : 'privacy';
    bus.emitAudit(
      {
        vendor: map.vendor,
        intent: event.intent,
        eventId: event.eventId,
        stage: result.outcome === 'skipped' ? 'skip' : stage,
        outcome: result.outcome,
        reasonCode: result.reason,
        durationMs,
        mapVersion: map.version,
      },
      result.wire ?? undefined,
    );
  }

  return result;
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
  const filteredOut: FilteredMapInfo[] = maps
    .filter((m) => !allowed.has(mapStatus(m)))
    .map((m) => ({
      vendor: m.vendor,
      status: mapStatus(m),
      reason: `status_not_eligible_for_mode_${mode}`,
    }));

  const failPolicy = opts.vendorFailurePolicy ?? 'continue_all';
  const exec = opts.vendorExecution ?? 'sequential';
  const bus = resolveObservation(opts);
  const results: VendorTrackResult[] = [];

  // Default processorsDir from projectDir when not set
  const runOpts: TrackOptions = {
    ...opts,
    processorsDir:
      opts.processorsDir ??
      (opts.projectDir ? `${opts.projectDir}/processors` : undefined),
  };

  if (exec === 'parallel') {
    const settled = await Promise.all(
      selected.map((m) => runOne(m as MapWithFlow, event, mode, runOpts, bus)),
    );
    results.push(...settled);
  } else {
    for (const m of selected) {
      const r = await runOne(m as MapWithFlow, event, mode, runOpts, bus);
      results.push(r);
      if (failPolicy === 'fail_fast' && r.outcome === 'failure') break;
    }
  }

  const diagnostics =
    results.length === 0
      ? buildEmptyTrackDiagnostics(maps, mode, allowed, filteredOut)
      : undefined;

  return {
    eventId: event.eventId,
    results,
    ...(filteredOut.length ? { filteredOut } : {}),
    ...(diagnostics?.length ? { diagnostics } : {}),
  };
}

function buildEmptyTrackDiagnostics(
  maps: VendorMap[],
  mode: TrackMode,
  allowed: Set<string>,
  filteredOut: FilteredMapInfo[],
): string[] {
  if (!maps.length) {
    return [
      'no_vendor_maps: pass maps from your project store (createVendorMemoryStore + listMaps), or author via proposal pipeline.',
    ];
  }
  const statuses = maps.map((m) => `${m.vendor}=${mapStatus(m)}`).join(', ');
  return [
    `no_eligible_maps: mode=${mode} requires status in [${[...allowed].join(', ')}]. Found: ${statuses}.`,
    filteredOut.length
      ? `filtered_out: ${filteredOut.map((f) => `${f.vendor}(${f.status})`).join(', ')}`
      : 'all maps excluded by status filter',
    'next: finish map to map_complete, dry-run, then layerkit promote --vendor <id> for live',
  ];
}
