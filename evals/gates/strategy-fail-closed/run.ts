/**
 * Gate: unknown processorId fails closed with reason processor_unresolved
 * (no __processor placeholder object on the wire).
 */
import { assertEqual, assertThrows, assertTrue } from '../../harness/assert.js';
import { loadFixture } from '../../harness/load-fixture.js';
import type { VendorMap } from '../../../libs/domain/types.js';
import {
  createStrategyRegistry,
  executeProcessor,
  ProcessorUnresolvedError,
} from '../../../libs/strategy/index.js';
import { applyVendorMap } from '../../../libs/vendor-memory/map-engine.js';

const map = loadFixture<VendorMap>('agent/map-v1.json');

// Empty registry: agent processor not installed
const emptyReg = createStrategyRegistry();

// executeProcessor throws
assertThrows('execute throws ProcessorUnresolvedError', () => {
  executeProcessor('example.email.sha256_normalized', 'a@b.com', emptyReg);
});

try {
  executeProcessor('totally.unknown.processor', 'x', emptyReg);
  assertTrue('should have thrown for unknown id', false);
} catch (err) {
  assertTrue(
    'error is ProcessorUnresolvedError',
    err instanceof ProcessorUnresolvedError,
  );
  assertEqual(
    'error code processor_unresolved',
    (err as ProcessorUnresolvedError).code,
    'processor_unresolved',
  );
}

// Unknown builtin.* also unresolved
assertThrows('unknown builtin op unresolved', () => {
  executeProcessor('builtin.not_a_real_op', 'x', emptyReg);
});

// applyVendorMap default: skip with reason (dry-run safe)
const skipped = applyVendorMap(
  { intent: 'purchase', eventId: 'ord_1', user: { email: 'a@b.com' } },
  map,
  { registry: emptyReg },
);
assertTrue('map skipped when processor unresolved', skipped.skipped === true);
assertEqual('reason processor_unresolved', skipped.reason, 'processor_unresolved');
assertEqual('wire null on skip', skipped.wire, null);

// applyVendorMap onUnresolved throw
assertThrows('applyVendorMap throws when onUnresolved=throw', () => {
  applyVendorMap(
    { intent: 'purchase', eventId: 'ord_1', user: { email: 'a@b.com' } },
    map,
    { registry: emptyReg, onUnresolved: 'throw' },
  );
});

// Must NOT produce legacy placeholder shape
const placeholderCheck = applyVendorMap(
  { intent: 'purchase', eventId: 'ord_1', user: { email: 'a@b.com' } },
  map,
);
// No processorsDir → unresolved → skip, not placeholder wire
assertTrue('default no registry skips', placeholderCheck.skipped);
assertTrue(
  'no wire with __processor',
  placeholderCheck.wire == null ||
    !JSON.stringify(placeholderCheck.wire).includes('__processor'),
);

console.log('strategy-fail-closed: all checks passed');
