/**
 * Gate: applyVendorMap reports missingDomainPaths for required fields absent on event.
 */
import { assertTrue, assertEqual } from '../../harness/assert.js';
import { applyVendorMap } from '../../../libs/vendor-memory/map-engine.js';
import type { VendorMap } from '../../../libs/domain/types.js';

const map: VendorMap = {
  vendor: 'm',
  displayName: 'M',
  version: '1',
  auth: { type: 'bearer' },
  endpoint: { method: 'POST', path: '/e', baseUrl: 'https://api.example.com' },
  intents: { purchase: { eventName: 'Purchase' } },
  fields: [
    { domain: 'eventId', vendor: 'event_id', transform: { type: 'identity' } },
    { domain: 'user.email', vendor: 'em', transform: { type: 'identity' } },
    {
      domain: 'value.amount',
      vendor: 'value',
      transform: { type: 'identity' },
      optional: true,
    },
  ],
  documentation: [],
  status: 'map_complete',
};

const r = applyVendorMap({ intent: 'purchase', eventId: 'e1' }, map);
assertTrue('not skipped', !r.skipped);
assertTrue('wire has event_id', r.wire?.event_id === 'e1');
assertTrue('missingDomainPaths present', (r.missingDomainPaths?.length ?? 0) >= 1);
assertTrue(
  'user.email reported missing',
  r.missingDomainPaths!.includes('user.email'),
);
assertTrue(
  'optional value.amount not required missing',
  !r.missingDomainPaths!.includes('value.amount'),
);

const full = applyVendorMap(
  { intent: 'purchase', eventId: 'e2', user: { email: 'a@b.com' }, value: { amount: 1 } },
  map,
);
assertEqual('no missing when full', full.missingDomainPaths, undefined);

console.log('map-missing-fields: all checks passed');
