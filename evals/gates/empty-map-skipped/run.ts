/**
 * Gate: empty vendor maps are skipped with agent-research reason.
 */
import { assertTrue } from '../../harness/assert.js';
import { emptyVendorMap } from '../../../libs/domain/commerce.js';
import { applyVendorMap } from '../../../libs/vendor-memory/map-engine.js';

const empty = emptyVendorMap({
  vendor: 'example_vendor',
  displayName: 'Example (empty)',
  documentation: [{ title: 'Docs', url: 'https://docs.example.com/api' }],
});

assertTrue('skeleton has no fields', empty.fields.length === 0);
assertTrue('skeleton status', empty.status === 'skeleton');

const result = applyVendorMap({ intent: 'purchase', eventId: 'x' }, empty);
assertTrue('empty map skipped', result.skipped === true);
assertTrue(
  'reason is agent research',
  result.reason === 'empty_map_awaiting_agent_research',
);

console.log('empty-map-skipped: all checks passed');
