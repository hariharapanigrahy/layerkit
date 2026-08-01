/**
 * Gate: migrateMapV1toV2 / asV2 in-memory migration (generic example map).
 */
import { assertEqual, assertTrue } from '../../harness/assert.js';
import type { VendorMapV1 } from '../../../libs/domain/types.js';
import { asV2, mapSchemaVersion, migrateMapV1toV2 } from '../../../libs/vendor-memory/migrate.js';

const skeleton: VendorMapV1 = {
  vendor: 'example_vendor',
  displayName: 'Example',
  version: '0.0.0-empty',
  auth: { type: 'custom', notes: 'Agent sets from docs' },
  endpoint: { method: 'POST', path: '/REPLACE_FROM_DOCS', baseUrl: 'https://REPLACE_FROM_DOCS' },
  intents: {},
  fields: [],
  documentation: [{ title: 'Docs', url: 'https://docs.example.com/api' }],
  status: 'skeleton',
  notes: 'Empty skeleton.',
};

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

const filled: VendorMapV1 = {
  schemaVersion: 1,
  vendor: 'example_vendor',
  displayName: 'Example',
  version: '1.0.0',
  auth: { type: 'bearer' },
  endpoint: { method: 'POST', path: '/v1/events', baseUrl: 'https://api.example.com' },
  intents: {
    purchase: { eventName: 'purchase', staticFields: { source: 'web' } },
    lead: { eventName: 'lead', skip: false },
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
assertEqual('intent eventName preserved', filledV2.intents.purchase?.eventName, 'purchase');
assertEqual(
  'staticFields preserved',
  filledV2.intents.purchase?.staticFields?.source,
  'web',
);
assertEqual('fields length', filledV2.fields.length, 1);

const again = asV2(filledV2);
assertEqual('asV2 idempotent vendor', again.vendor, filledV2.vendor);
assertEqual('asV2 idempotent schema', again.schemaVersion, 2);

console.log('map-v1-v2-migrate: all checks passed');
