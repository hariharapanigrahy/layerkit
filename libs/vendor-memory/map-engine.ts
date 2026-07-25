import type { DomainEvent } from '../domain/event.js';
import type { VendorMap } from '../domain/types.js';
import {
  createStrategyRegistry,
  executeProcessor,
  ProcessorUnresolvedError,
  type ExecutableProcessor,
  type StrategyRegistry,
} from '../strategy/index.js';

/** Re-export DomainEvent from domain for one minor version of import compatibility. */
export type { DomainEvent } from '../domain/event.js';

export interface MapResult {
  vendor: string;
  skipped: boolean;
  reason?: string;
  wire: Record<string, unknown> | null;
}

/** Options for processor execution during map apply. */
export interface ApplyVendorMapOptions {
  /** Pre-built strategy registry */
  registry?: StrategyRegistry;
  /** Load agent processors from this directory (e.g. `.layerkit/processors`) */
  processorsDir?: string;
  /** Inline processor documents keyed by id */
  processors?: Record<string, ExecutableProcessor> | ExecutableProcessor[];
  /**
   * When a processorId cannot be resolved:
   * - `'skip'` (default): return MapResult skipped with reason `processor_unresolved` (dry-run safe)
   * - `'throw'`: throw ProcessorUnresolvedError
   */
  onUnresolved?: 'skip' | 'throw';
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

function intentEventName(
  map: VendorMap,
  intent: string,
): { skip?: boolean; eventName?: string; staticFields?: Record<string, unknown> } | undefined {
  const wire = map.intents?.[intent];
  if (!wire) return undefined;
  // V1 IntentWire and V2 IntentBinding both support skip/eventName/staticFields
  return {
    skip: wire.skip,
    eventName: 'eventName' in wire ? wire.eventName : undefined,
    staticFields: wire.staticFields,
  };
}

function resolveRegistry(options?: ApplyVendorMapOptions): StrategyRegistry {
  if (options?.registry) return options.registry;
  return createStrategyRegistry({
    processorsDir: options?.processorsDir,
    processors: options?.processors,
  });
}

/**
 * Execute agent-authored maps only. Empty maps skip.
 * Processors are executed via the strategy registry (no `__processor` placeholders).
 * Unknown processorId → skipped with reason `processor_unresolved` (default) or throw.
 */
export function applyVendorMap(
  event: DomainEvent,
  map: VendorMap,
  options?: ApplyVendorMapOptions,
): MapResult {
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

  const registry = resolveRegistry(options);
  const onUnresolved = options?.onUnresolved ?? 'skip';

  const wire: Record<string, unknown> = { ...(intentWire.staticFields ?? {}) };
  if (intentWire.eventName) wire.event_name = intentWire.eventName;

  for (const row of map.fields) {
    const raw = getPath(event, row.domain);
    if (raw === undefined) continue;

    let out: unknown = raw;
    if (row.transform.type === 'constant') {
      out = row.transform.value;
    } else if (row.transform.type === 'processor') {
      const processorId = row.transform.processorId;
      try {
        out = executeProcessor(processorId, raw, registry, { failClosed: true });
      } catch (err) {
        if (
          err instanceof ProcessorUnresolvedError ||
          (err as { code?: string })?.code === 'processor_unresolved'
        ) {
          if (onUnresolved === 'throw') {
            throw err instanceof ProcessorUnresolvedError
              ? err
              : new ProcessorUnresolvedError(processorId);
          }
          return {
            vendor: map.vendor,
            skipped: true,
            reason: 'processor_unresolved',
            wire: null,
          };
        }
        throw err;
      }
    }
    setPath(wire, row.vendor, out);
  }
  return { vendor: map.vendor, skipped: false, wire };
}
