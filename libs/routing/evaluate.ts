/**
 * evaluateRouting: expand intents + select vendor sets (deterministic, no LLM).
 */
import type { DomainEvent } from '../domain/event.js';
import { evalCondition } from '../privacy/conditions.js';
import type {
  EvaluateRoutingOpts,
  ExpansionRule,
  RoutePlan,
  RoutePlanDiagnostic,
  RoutePlanEntry,
  RouteRule,
  RoutingPolicy,
  VendorSet,
} from './types.js';
import { assertValidRoutingPolicy } from './validate.js';

const DEFAULT_MAX_DEPTH = 3;

interface WorkingEvent {
  event: DomainEvent;
  expansionId?: string;
  ruleIds: string[];
  depth: number;
}

function setById(policy: RoutingPolicy): Map<string, VendorSet> {
  return new Map(policy.vendorSets.map((s) => [s.id, s]));
}

function routeMatches(rule: RouteRule, event: DomainEvent): boolean {
  if (rule.intent != null && rule.intent !== '' && event.intent !== rule.intent) {
    return false;
  }
  if (rule.when && !evalCondition(rule.when, event)) {
    return false;
  }
  return true;
}

function expansionMatches(rule: ExpansionRule, event: DomainEvent): boolean {
  if (!rule.when) return true;
  return evalCondition(rule.when, event);
}

function cloneEvent(event: DomainEvent, intent: string): DomainEvent {
  return { ...event, intent };
}

function resolveVendorsForSet(
  set: VendorSet,
  known: Set<string> | undefined,
  filterUnknown: boolean,
  diagnostics: RoutePlanDiagnostic[],
  routeId: string | undefined,
  intent: string,
): string[] {
  const out: string[] = [];
  for (const vendor of set.vendors) {
    if (filterUnknown && known && !known.has(vendor)) {
      diagnostics.push({
        code: 'unknown_vendor',
        message: `vendor "${vendor}" in set ${set.id} not in known maps — skipped`,
        routeId,
        intent,
      });
      continue;
    }
    out.push(vendor);
  }
  return out;
}

/**
 * Expand base event into one or more events (intents), then route each to vendors.
 */
export function evaluateRouting(
  baseEvent: DomainEvent,
  policy: RoutingPolicy,
  opts: EvaluateRoutingOpts = {},
): RoutePlan {
  assertValidRoutingPolicy(policy);

  const diagnostics: RoutePlanDiagnostic[] = [];
  const sets = setById(policy);
  const known = opts.knownVendors ? new Set(opts.knownVendors) : undefined;
  const filterUnknown = opts.filterUnknownVendors !== false;
  const maxDepth = policy.maxExpansionDepth ?? DEFAULT_MAX_DEPTH;

  // --- P1: expansions ---
  // Start with base; expansions that match the *original* base event may emit more intents.
  // Nested expansion: expansions that match an expanded event (same base fields, new intent).
  const working: WorkingEvent[] = [];
  const expandedIntents = new Set<string>([baseEvent.intent]);
  const seenEmit = new Set<string>();

  let includeBase = true;
  for (const exp of policy.expansions ?? []) {
    if (expansionMatches(exp, baseEvent) && exp.keepBaseIntent === false) {
      includeBase = false;
    }
  }
  if (includeBase) {
    working.push({ event: baseEvent, ruleIds: [], depth: 0 });
  }

  // Always evaluate expansions from base once, and from each emitted intent event
  const expandFrom: WorkingEvent[] = [{ event: baseEvent, ruleIds: [], depth: 0 }];

  for (let qi = 0; qi < expandFrom.length; qi++) {
    const item = expandFrom[qi]!;
    if (item.depth >= maxDepth) {
      continue;
    }
    for (const exp of policy.expansions ?? []) {
      const root = { ...baseEvent, intent: item.event.intent } as DomainEvent;
      if (!expansionMatches(exp, root)) continue;
      for (const em of exp.emit) {
        const key = `${item.depth}:${exp.id}:${em.intent}`;
        if (seenEmit.has(key)) continue;
        seenEmit.add(key);
        if (item.depth + 1 > maxDepth) {
          diagnostics.push({
            code: 'expansion_depth_capped',
            message: `skipped emit intent=${em.intent}; maxExpansionDepth=${maxDepth}`,
            expansionId: exp.id,
            intent: em.intent,
          });
          continue;
        }
        expandedIntents.add(em.intent);
        const child: WorkingEvent = {
          event: cloneEvent(baseEvent, em.intent),
          expansionId: exp.id,
          ruleIds: [...item.ruleIds, exp.id],
          depth: item.depth + 1,
        };
        working.push(child);
        expandFrom.push(child);
      }
    }
  }

  if (!includeBase && working.length === 0) {
    diagnostics.push({
      code: 'expansion_dropped_base_empty',
      message: 'keepBaseIntent=false but no expansions emitted; restoring base intent',
    });
    working.push({ event: baseEvent, ruleIds: [], depth: 0 });
    expandedIntents.add(baseEvent.intent);
  }

  // --- P0: routes ---
  const routes = [...policy.routes].sort(
    (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
  );

  const entries: RoutePlanEntry[] = [];
  const entryKey = new Set<string>();

  for (const item of working) {
    let matched = false;

    for (const route of routes) {
      if (!routeMatches(route, item.event)) continue;
      matched = true;
      const set = sets.get(route.to);
      if (!set) {
        diagnostics.push({
          code: 'route_set_missing',
          message: `route ${route.id} references missing set ${route.to}`,
          routeId: route.id,
          intent: item.event.intent,
        });
        if (route.stop) break;
        continue;
      }
      const vendors = resolveVendorsForSet(
        set,
        known,
        filterUnknown,
        diagnostics,
        route.id,
        item.event.intent,
      );
      for (const vendor of vendors) {
        const k = `${vendor}::${item.event.intent}`;
        if (entryKey.has(k)) continue;
        entryKey.add(k);
        entries.push({
          vendor,
          intent: item.event.intent,
          ruleIds: [...item.ruleIds, route.id],
          expansionId: item.expansionId,
          event: item.event,
        });
      }
      if (route.stop) break;
    }

    if (!matched && policy.defaultVendorSet) {
      const set = sets.get(policy.defaultVendorSet);
      if (!set) {
        diagnostics.push({
          code: 'default_set_missing',
          message: `defaultVendorSet ${policy.defaultVendorSet} missing`,
          intent: item.event.intent,
        });
      } else {
        matched = true;
        const vendors = resolveVendorsForSet(
          set,
          known,
          filterUnknown,
          diagnostics,
          `default:${policy.defaultVendorSet}`,
          item.event.intent,
        );
        for (const vendor of vendors) {
          const k = `${vendor}::${item.event.intent}`;
          if (entryKey.has(k)) continue;
          entryKey.add(k);
          entries.push({
            vendor,
            intent: item.event.intent,
            ruleIds: [...item.ruleIds, `default:${policy.defaultVendorSet}`],
            expansionId: item.expansionId,
            event: item.event,
          });
        }
      }
    }

    if (!matched) {
      diagnostics.push({
        code: 'no_route_match',
        message: `no route matched intent=${item.event.intent}${
          policy.requireRouteMatch ? ' (requireRouteMatch)' : ''
        }`,
        intent: item.event.intent,
        expansionId: item.expansionId,
      });
    }
  }

  return {
    eventId: baseEvent.eventId,
    baseIntent: baseEvent.intent,
    expandedIntents: [...expandedIntents],
    entries,
    diagnostics,
  };
}
