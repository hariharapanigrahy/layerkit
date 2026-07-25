import type { DomainEvent } from '../domain/event.js';
import type { VendorMap } from '../domain/types.js';

/** Re-export DomainEvent from domain for one minor version of import compatibility. */
export type { DomainEvent } from '../domain/event.js';

export interface MapResult {
  vendor: string;
  skipped: boolean;
  reason?: string;
  wire: Record<string, unknown> | null;
}

function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const p of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    if (cur[p] == null || typeof cur[p] !== 'object') cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

function intentEventName(map: VendorMap, intent: string): { skip?: boolean; eventName?: string; staticFields?: Record<string, unknown> } | undefined {
  const wire = map.intents?.[intent];
  if (!wire) return undefined;
  // V1 IntentWire and V2 IntentBinding both support skip/eventName/staticFields
  return {
    skip: wire.skip,
    eventName: 'eventName' in wire ? wire.eventName : undefined,
    staticFields: wire.staticFields,
  };
}

/** Execute agent-authored maps only. Empty maps skip. */
export function applyVendorMap(event: DomainEvent, map: VendorMap): MapResult {
  if (!map.fields?.length && !Object.keys(map.intents ?? {}).length) {
    return {
      vendor: map.vendor,
      skipped: true,
      reason: 'empty_map_awaiting_agent_research',
      wire: null,
    };
  }
  const intentWire = intentEventName(map, event.intent);
  if (!intentWire || intentWire.skip) {
    return {
      vendor: map.vendor,
      skipped: true,
      reason: intentWire?.skip ? 'intent_skipped' : 'intent_not_mapped',
      wire: null,
    };
  }
  const wire: Record<string, unknown> = { ...(intentWire.staticFields ?? {}) };
  if (intentWire.eventName) wire.event_name = intentWire.eventName;
  for (const row of map.fields) {
    const raw = getPath(event, row.domain);
    if (raw === undefined) continue;
    // Processors run in generated Java; dry-run copies identity only unless constant
    let out: unknown = raw;
    if (row.transform.type === 'constant') out = row.transform.value;
    if (row.transform.type === 'processor') {
      out = {
        __processor: row.transform.processorId,
        value: raw,
      };
    }
    setPath(wire, row.vendor, out);
  }
  return { vendor: map.vendor, skipped: false, wire };
}
