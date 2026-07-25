/**
 * Gate: migrateMapV1toV2 / asV2 in-memory migration.
 */
import { assertEqual, assertTrue } from '../../harness/assert.js';
import { emptyVendorMap, VENDOR_SLOTS } from '../../../libs/domain/commerce.js';
import type { VendorMapV1 } from '../../../libs/domain/types.js';
import { asV2, mapSchemaVersion, migrateMapV1toV2 } from '../../../libs/vendor-memory/migrate.js';

const metaSlot = VENDOR_SLOTS.find((s) => s.vendor === 'meta')!;
const skeleton = emptyVendorMap(metaSlot);

assertEqual('empty skeleton is v1', mapSchemaVersion(skeleton), 1);
assertTrue('skeleton has docs', (skeleton.documentation?.length ?? 0) > 0);

const v2 = migrateMapV1toV2(skeleton);
assertEqual('migrated schemaVersion 2', v2.schemaVersion, 2);
assertEqual('preserves vendor', v2.vendor, skeleton.vendor);
assertEqual('preserves displayName', v2.displayName, skeleton.displayName);
assertTrue('preserves documentation', v2.documentation.length === skeleton.documentation.length);
assertEqual(
  'docs url preserved',
  v2.documentation[0]?.url,
  skeleton.documentation[0]?.url,
);
assertEqual('status skeleton', v2.status, 'skeleton');
assertTrue('has operations.default', Boolean(v2.operations.default));
assertEqual(
  'default endpoint path from v1',
  v2.operations.default!.endpoint.path,
  skeleton.endpoint.path,
);
assertEqual(
  'legacy endpoint mirror',
  v2.endpoint?.path,
  skeleton.endpoint.path,
);

// Filled v1 with intents
const filled: VendorMapV1 = {
  schemaVersion: 1,
  vendor: 'meta',
  displayName: 'Meta',
  version: '1.0.0',
  auth: { type: 'bearer' },
  endpoint: { method: 'POST', path: '/v18.0/{pixel}/events', baseUrl: 'https://graph.facebook.com' },
  intents: {
    purchase: { eventName: 'Purchase', staticFields: { action_source: 'website' } },
    lead: { eventName: 'Lead', skip: false },
  },
  fields: [{ domain: 'eventId', vendor: 'event_id', transform: { type: 'identity' } }],
  documentation: skeleton.documentation,
  status: 'map_complete',
};

const filledV2 = asV2(filled);
assertEqual('asV2 schema 2', filledV2.schemaVersion, 2);
assertEqual(
  'intent purchase → operationId default',
  filledV2.intents.purchase?.operationId,
  'default',
);
assertEqual('intent eventName preserved', filledV2.intents.purchase?.eventName, 'Purchase');
assertEqual(
  'staticFields preserved',
  filledV2.intents.purchase?.staticFields?.action_source,
  'website',
);
assertEqual('fields length', filledV2.fields.length, 1);

// Idempotent asV2 on already-v2
const again = asV2(filledV2);
assertEqual('asV2 idempotent vendor', again.vendor, filledV2.vendor);
assertEqual('asV2 idempotent schema', again.schemaVersion, 2);

console.log('map-v1-v2-migrate: all checks passed');
