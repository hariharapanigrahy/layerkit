/**
 * Gate: track() never returns silent empty results without diagnostics.
 */
import { assertTrue, assertEqual } from '../../harness/assert.js';
import { track } from '../../../libs/runtime/track.js';
import type { VendorMap } from '../../../libs/domain/types.js';

const skeleton: VendorMap = {
  vendor: 'skel',
  displayName: 'Skeleton',
  version: '0.0.0',
  auth: { type: 'bearer' },
  endpoint: { method: 'POST', path: '/x', baseUrl: 'https://example.com' },
  intents: {},
  fields: [],
  documentation: [],
  status: 'skeleton',
};

// empty maps list
const empty = await track(
  { intent: 'purchase', eventId: 'e1' },
  [],
  { mode: 'dry_run', observation: false },
);
assertEqual('empty maps → 0 results', empty.results.length, 0);
assertTrue('empty maps has diagnostics', (empty.diagnostics?.length ?? 0) > 0);
assertTrue(
  'diagnostics mention no maps',
  empty.diagnostics!.some((d) => d.includes('no_vendor_maps')),
);

// skeleton filtered in dry_run (only live|map_complete)
const filtered = await track(
  { intent: 'purchase', eventId: 'e2' },
  [skeleton],
  { mode: 'dry_run', observation: false },
);
assertEqual('skeleton not run', filtered.results.length, 0);
assertTrue('filteredOut present', (filtered.filteredOut?.length ?? 0) === 1);
assertEqual('filtered vendor', filtered.filteredOut![0]!.vendor, 'skel');
assertTrue(
  'diagnostics no_eligible',
  filtered.diagnostics!.some((d) => d.includes('no_eligible_maps')),
);

// live mode filters map_complete
const complete: VendorMap = {
  ...skeleton,
  vendor: 'done',
  status: 'map_complete',
  intents: { purchase: { eventName: 'Purchase' } },
  fields: [{ domain: 'eventId', vendor: 'event_id', transform: { type: 'identity' } }],
};
const liveFilter = await track(
  { intent: 'purchase', eventId: 'e3' },
  [complete],
  { mode: 'live', observation: false, requirePrivacyPolicyForLive: false },
);
assertEqual('map_complete not eligible for live', liveFilter.results.length, 0);
assertTrue('live filteredOut', (liveFilter.filteredOut?.length ?? 0) === 1);

console.log('track-empty-diagnostics: all checks passed');
