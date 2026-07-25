import { buildPocVendorMaps } from '../dist/libs/domain/commerce.js';
import { applyVendorMap } from '../dist/libs/vendor-memory/map-engine.js';

const m = buildPocVendorMaps()[0];
const r = applyVendorMap({ intent: 'purchase' }, m);
if (!r.skipped || r.reason !== 'empty_map_awaiting_agent_research') {
  console.error('empty map should skip', r);
  process.exit(1);
}
console.log('check-empty-map-skip: ok');
