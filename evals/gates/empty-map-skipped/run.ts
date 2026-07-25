/**
 * Gate: empty vendor maps are skipped with agent-research reason.
 */
import { assertTrue } from '../../harness/assert.js';
import { buildPocVendorMaps } from '../../../libs/domain/commerce.js';
import { applyVendorMap } from '../../../libs/vendor-memory/map-engine.js';

const maps = buildPocVendorMaps();
assertTrue('poc has 20 vendors', maps.length === 20);

const meta = maps.find((m) => m.vendor === 'meta')!;
const result = applyVendorMap({ intent: 'purchase', eventId: 'x' }, meta);
assertTrue('empty map skipped', result.skipped === true);
assertTrue(
  'reason is agent research',
  result.reason === 'empty_map_awaiting_agent_research',
);

console.log('empty-map-skipped: all checks passed');
