/**
 * In-memory v1 → v2 map migration helpers.
 * On-disk rewrite only happens via explicit migrate/apply — not on read.
 */
import type {
  IntentBinding,
  IntentWire,
  VendorMap,
  VendorMapV1,
  VendorMapV2,
} from '../domain/types.js';
import { isVendorMapV2 } from '../domain/types.js';

/** Normative migrate: single endpoint → operations.default; intents → IntentBinding. */
export function migrateMapV1toV2(m: VendorMapV1): VendorMapV2 {
  const intents: Record<string, IntentBinding> = Object.fromEntries(
    Object.entries(m.intents ?? {}).map(([k, w]: [string, IntentWire]) => [
      k,
      {
        operationId: 'default',
        eventName: w.eventName,
        staticFields: w.staticFields,
        skip: w.skip,
      },
    ]),
  );

  return {
    schemaVersion: 2,
    vendor: m.vendor,
    displayName: m.displayName,
    version: m.version,
    status: m.status ?? 'skeleton',
    documentation: m.documentation ?? [],
    notes: m.notes,
    auth: m.auth,
    endpoint: m.endpoint,
    operations: {
      default: {
        id: 'default',
        endpoint: m.endpoint,
      },
    },
    intents,
    fields: m.fields ?? [],
    extensionKeys: m.extensionKeys,
  };
}

/**
 * Coerce any on-disk map to v2 in memory for engines.
 * Does not mutate the input; does not write to disk.
 */
export function asV2(map: VendorMap): VendorMapV2 {
  if (isVendorMapV2(map)) {
    return map;
  }
  return migrateMapV1toV2(map);
}

/** Schema version label for doctor / CLI. */
export function mapSchemaVersion(map: VendorMap): 1 | 2 {
  return map.schemaVersion === 2 ? 2 : 1;
}
