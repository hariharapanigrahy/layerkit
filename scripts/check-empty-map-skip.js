import { emptyVendorMap } from '../dist/libs/domain/commerce.js';
import { applyVendorMap } from '../dist/libs/vendor-memory/map-engine.js';

const m = emptyVendorMap({
  vendor: 'example_vendor',
  displayName: 'Example',
});
const r = applyVendorMap({ intent: 'purchase', eventId: '1' }, m);
if (!r.skipped || r.reason !== 'empty_map_awaiting_agent_research') {
  console.error('expected empty map skip', r);
  process.exit(1);
}
console.log('check-empty-map-skip: ok');
