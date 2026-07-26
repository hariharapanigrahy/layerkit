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
import { hasTimeoutBudget, runWithTimeout } from './timeout.js';

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
  /**
   * Wall-clock budget (ms) for the entire track() call.
   * On expiry: diagnostics include `timeout_overall`; results collected so far
   * are returned; vendors not yet finished are marked failure with reason `timeout`.
   */
  timeoutMs?: number;
  /**
   * Per-vendor budget (ms) for a single runOne() call (Promise.race via runWithTimeout).
   * On expiry: VendorTrackResult outcome `failure`, reason `timeout`, skipped false.
   */
  vendorTimeoutMs?: number;
  /**
   * Declarative routing policy (or load from projectDir when `true` / policy id string).
   * When set, use `trackRouted` semantics: expand + filter vendors before map apply.
   */
  routing?: import('../routing/types.js').RoutingPolicy | string | true;
  /**
   * When routing.requireRouteMatch and a base/expanded intent has zero plan entries,
   * fail the whole track with diagnostics (default false — soft skip).
   */
  failOnNoRoute?: boolean;
}

export interface VendorTrackResult {
  vendor: string;
  skipped: boolean;
  reason?: string;
  outcome: 'success' | 'failure' | 'skipped';
  mode: TrackMode;
  /** Intent actually applied (may differ from base after expansion) */
  intent?: string;
  operationId?: string;
  httpStatus?: number;
  errorClass?: string;
  auditId?: string;
  /** Final wire after privacy (when allowed) */
  wire?: Record<string, unknown> | null;
  mapResult?: MapResult;
  warnings?: string[];
  /** Routing rule ids (expansion + route) that selected this vendor/intent */
  ruleIds?: string[];
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
  /** Present when routing was evaluated */
  plan?: import('../routing/types.js').RoutePlan;
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
        ruleIds: result.ruleIds,
      },
      result.wire ?? undefined,
    );
  }

  result.intent = event.intent;
  return result;
}

/** Failure result when a vendor (or pending vendor) hits a timeout budget. */
function timeoutVendorResult(vendor: string, mode: TrackMode): VendorTrackResult {
  return {
    vendor,
    skipped: false,
    reason: 'timeout',
    outcome: 'failure',
    mode,
    errorClass: 'timeout',
  };
}

function emitTimeoutAudit(
  bus: ObservationBus | undefined,
  map: MapWithFlow | { vendor: string; version?: string },
  event: DomainEvent,
  durationMs?: number,
): void {
  if (!bus) return;
  bus.emitAudit({
    vendor: map.vendor,
    intent: event.intent,
    eventId: event.eventId,
    stage: 'orchestrate',
    outcome: 'failure',
    reasonCode: 'timeout',
    durationMs,
    mapVersion: 'version' in map ? map.version : undefined,
  });
}

/**
 * Run one vendor with optional per-vendor budget (`vendorTimeoutMs`).
 * Uses runWithTimeout so late completion cannot hang track or leak rejections.
 */
async function runOneWithVendorTimeout(
  map: MapWithFlow,
  event: DomainEvent,
  mode: TrackMode,
  opts: TrackOptions,
  bus?: ObservationBus,
): Promise<VendorTrackResult> {
  const work = runOne(map, event, mode, opts, bus);
  if (!hasTimeoutBudget(opts.vendorTimeoutMs)) {
    return work;
  }
  const raced = await runWithTimeout(work, opts.vendorTimeoutMs, map.vendor);
  if (!raced.ok) {
    const result = timeoutVendorResult(map.vendor, mode);
    emitTimeoutAudit(bus, map, event, opts.vendorTimeoutMs);
    return result;
  }
  return raced.value;
}

/**
 * Fan-out domain event across vendor maps with status filter + privacy gate.
 *
 * Timeouts (optional):
 * - `vendorTimeoutMs` — Promise.race around each runOne (via runWithTimeout)
 * - `timeoutMs` — wall clock for the whole fan-out; pending vendors → failure/timeout
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
  const finished = new Set<string>();
  /** Once true, late vendor completions are ignored (overall timeout won). */
  let closed = false;

  // Default processorsDir from projectDir when not set
  const runOpts: TrackOptions = {
    ...opts,
    processorsDir:
      opts.processorsDir ??
      (opts.projectDir ? `${opts.projectDir}/processors` : undefined),
  };

  const record = (r: VendorTrackResult): void => {
    if (closed) return;
    finished.add(r.vendor);
    results.push(r);
  };

  const runAll = async (): Promise<void> => {
    if (exec === 'parallel') {
      await Promise.all(
        selected.map(async (m) => {
          const r = await runOneWithVendorTimeout(
            m as MapWithFlow,
            event,
            mode,
            runOpts,
            bus,
          );
          record(r);
        }),
      );
    } else {
      for (const m of selected) {
        if (closed) break;
        const r = await runOneWithVendorTimeout(
          m as MapWithFlow,
          event,
          mode,
          runOpts,
          bus,
        );
        record(r);
        if (failPolicy === 'fail_fast' && r.outcome === 'failure') break;
      }
    }
  };

  let overallTimedOut = false;

  if (hasTimeoutBudget(opts.timeoutMs)) {
    const raced = await runWithTimeout(runAll(), opts.timeoutMs, 'track');
    if (!raced.ok) {
      overallTimedOut = true;
      closed = true;
      // Mark vendors not yet finished as timeout failures (do not omit).
      for (const m of selected) {
        if (finished.has(m.vendor)) continue;
        const tr = timeoutVendorResult(m.vendor, mode);
        results.push(tr);
        finished.add(m.vendor);
        emitTimeoutAudit(bus, m as MapWithFlow, event, opts.timeoutMs);
      }
    }
  } else {
    await runAll();
  }

  const emptyDiagnostics =
    results.length === 0
      ? buildEmptyTrackDiagnostics(maps, mode, allowed, filteredOut)
      : undefined;

  const diagnostics: string[] | undefined = overallTimedOut
    ? [
        'timeout_overall',
        `timeoutMs=${opts.timeoutMs}`,
        `finished=${[...finished].length}/${selected.length}`,
        ...(emptyDiagnostics ?? []),
      ]
    : emptyDiagnostics;

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

/**
 * Track with declarative routing (P0–P4): expand intents → vendor sets → map/privacy per entry.
 * Prefer this over app-level if/else or combinatorial tag managers.
 */
export async function trackRouted(
  event: DomainEvent,
  maps: VendorMap[],
  opts: TrackOptions & {
    routing: import('../routing/types.js').RoutingPolicy | string | true;
  },
): Promise<TrackResult> {
  const { evaluateRouting } = await import('../routing/evaluate.js');
  const { loadRoutingPolicy } = await import('../routing/load.js');
  const { createObservationBus } = await import('../observation/sinks.js');

  let policy: import('../routing/types.js').RoutingPolicy | null = null;
  if (opts.routing === true) {
    if (!opts.projectDir) {
      throw new Error('trackRouted: routing=true requires projectDir to load routing.json');
    }
    policy = loadRoutingPolicy(opts.projectDir);
  } else if (typeof opts.routing === 'string') {
    if (!opts.projectDir) {
      throw new Error('trackRouted: routing id requires projectDir');
    }
    policy = loadRoutingPolicy(opts.projectDir, opts.routing);
  } else {
    policy = opts.routing;
  }
  if (!policy) {
    throw new Error('trackRouted: routing policy not found');
  }

  const knownVendors = maps.map((m) => m.vendor);
  const plan = evaluateRouting(event, policy, { knownVendors });

  const bus =
    opts.observation === false
      ? undefined
      : opts.projectDir
        ? createObservationBus({
            projectDir: opts.projectDir,
            config:
              opts.observation &&
              typeof opts.observation === 'object' &&
              'schemaVersion' in opts.observation
                ? opts.observation
                : undefined,
          })
        : undefined;

  if (bus) {
    bus.emitAudit({
      vendor: '_routing',
      intent: event.intent,
      eventId: event.eventId,
      stage: 'route',
      outcome: plan.entries.length ? 'success' : 'skipped',
      reasonCode: plan.entries.length ? undefined : 'empty_plan',
      ruleIds: plan.entries.flatMap((e) => e.ruleIds).slice(0, 32),
    });
  }

  if (
    opts.failOnNoRoute ||
    (policy.requireRouteMatch &&
      plan.diagnostics.some((d) => d.code === 'no_route_match'))
  ) {
    if (plan.entries.length === 0) {
      return {
        eventId: event.eventId,
        results: [],
        plan,
        diagnostics: [
          'routing_no_entries',
          ...plan.diagnostics.map((d) => `${d.code}:${d.message}`),
        ],
      };
    }
  }

  const mapByVendor = new Map(maps.map((m) => [m.vendor, m]));
  const results: VendorTrackResult[] = [];
  const mode: TrackMode = opts.mode ?? 'live';
  const failPolicy = opts.vendorFailurePolicy ?? 'continue_all';

  for (const entry of plan.entries) {
    const map = mapByVendor.get(entry.vendor);
    if (!map) {
      results.push({
        vendor: entry.vendor,
        intent: entry.intent,
        skipped: true,
        reason: 'map_not_loaded',
        outcome: 'skipped',
        mode,
        ruleIds: entry.ruleIds,
      });
      continue;
    }
    // Status filter per map
    const allowed = new Set(opts.includeStatuses ?? defaultStatusesForMode(mode));
    if (!allowed.has(map.status ?? 'skeleton')) {
      results.push({
        vendor: entry.vendor,
        intent: entry.intent,
        skipped: true,
        reason: `status_not_eligible:${map.status ?? 'skeleton'}`,
        outcome: 'skipped',
        mode,
        ruleIds: entry.ruleIds,
      });
      continue;
    }

    const r = await runOneWithVendorTimeout(
      map as MapWithFlow,
      entry.event,
      mode,
      {
        ...opts,
        processorsDir:
          opts.processorsDir ??
          (opts.projectDir ? `${opts.projectDir}/processors` : undefined),
      },
      bus,
    );
    r.ruleIds = entry.ruleIds;
    r.intent = entry.intent;
    results.push(r);
    if (failPolicy === 'fail_fast' && r.outcome === 'failure') break;
  }

  return {
    eventId: event.eventId,
    results,
    plan,
    ...(results.length === 0
      ? {
          diagnostics: [
            'routing_zero_results',
            ...plan.diagnostics.map((d) => `${d.code}:${d.message}`),
          ],
        }
      : plan.diagnostics.length
        ? { diagnostics: plan.diagnostics.map((d) => `${d.code}:${d.message}`) }
        : {}),
  };
}

/**
 * Convenience: if opts.routing is set, delegate to trackRouted; else classic track().
 */
export async function trackWithOptionalRouting(
  event: DomainEvent,
  maps: VendorMap[],
  opts: TrackOptions = {},
): Promise<TrackResult> {
  if (opts.routing !== undefined && opts.routing !== null) {
    return trackRouted(event, maps, {
      ...opts,
      routing: opts.routing as import('../routing/types.js').RoutingPolicy | string | true,
    });
  }
  return track(event, maps, opts);
}
