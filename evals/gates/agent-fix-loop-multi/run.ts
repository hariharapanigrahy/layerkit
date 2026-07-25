/**
 * Gate: agent-fix-loop-multi
 * Pure TS multi-step fix-loop: broken map → sequential patches → green dry-run.
 * Asserts intermediate dry-runs fail and final applyVendorMap matches expected wire.
 */
import { assertEqual, assertTrue } from '../../harness/assert.js';
import { loadFixture, loadFixtureText } from '../../harness/load-fixture.js';
import {
  applyMapPatches,
  asV1Map,
  evaluateDryRunWire,
  runSequentialMapFixes,
  type MapPathFixPatch,
} from '../../../libs/agent/index.js';
import { applyVendorMap } from '../../../libs/vendor-memory/map-engine.js';
import type { VendorMap } from '../../../libs/domain/types.js';

const mapV0 = loadFixture<VendorMap>('agent/fix-loop-multi/map-v0.json');
const mapV1Partial = loadFixture<VendorMap>('agent/fix-loop-multi/map-v1-partial.json');
const mapFinal = loadFixture<VendorMap>('agent/fix-loop-multi/map-final.json');
const patches = loadFixture<MapPathFixPatch[]>('agent/fix-loop-multi/patches.json');
const docField = loadFixtureText('agent/fix-loop-multi/doc-field-path.md');
const docEvent = loadFixtureText('agent/fix-loop-multi/doc-event-name.md');

const sampleEvent = {
  intent: 'purchase',
  eventId: 'ord_multi_1',
  user: { email: 'a@b.com' },
};

const finalExpectation = {
  notSkipped: true,
  eventName: 'Purchase',
  fields: { event_id: 'ord_multi_1' },
  requiredKeys: ['event_name', 'event_id'],
  forbiddenKeys: ['evt_id'],
};

function vendorField0(map: VendorMap): string {
  return asV1Map(map).fields[0]!.vendor;
}

function purchaseEventName(map: VendorMap): string {
  return asV1Map(map).intents.purchase!.eventName;
}

// ── fixtures sanity ──────────────────────────────────────────────
assertEqual('patches length is 2', patches.length, 2);
assertEqual('patch0 field', patches[0]!.field, 'fields.0.vendor');
assertEqual('patch1 field', patches[1]!.field, 'intents.purchase.eventName');
assertTrue('doc-field mentions event_id', docField.includes('event_id'));
assertTrue('doc-field forbids evt_id', docField.includes('evt_id'));
assertTrue('doc-event mentions Purchase', docEvent.includes('Purchase'));
assertTrue('doc-event forbids PurchaseEvent', docEvent.includes('PurchaseEvent'));

// ── step 0: broken map fails dry-run (wrong field path + wrong event) ──
const dry0 = applyVendorMap(sampleEvent, mapV0);
assertTrue('v0 apply not skipped', !dry0.skipped, dry0.reason);
assertEqual('v0 has wrong evt_id', dry0.wire?.evt_id, 'ord_multi_1');
assertEqual('v0 missing event_id', dry0.wire?.event_id, undefined);
assertEqual('v0 wrong event_name', dry0.wire?.event_name, 'PurchaseEvent');

const check0 = evaluateDryRunWire(dry0, finalExpectation);
assertTrue(
  'v0 dry-run fails final expectation',
  check0.ok === false,
  `expected failures, got ok with ${JSON.stringify(dry0.wire)}`,
);
assertTrue(
  'v0 fails include field or event',
  check0.failures.some((f) => f.includes('event_id') || f.includes('event_name')),
  check0.failures.join('; '),
);

// ── sequential fix loop ──────────────────────────────────────────
const { steps, final } = runSequentialMapFixes(mapV0, patches);
assertEqual('two fix steps applied', steps.length, 2);

// After step 0 (field path fix) → matches map-v1-partial key fields
const afterFieldFix = steps[0]!.map;
assertEqual('step0 vendor field fixed', vendorField0(afterFieldFix), 'event_id');
assertEqual('step0 event name still wrong', purchaseEventName(afterFieldFix), 'PurchaseEvent');
assertEqual(
  'step0 matches v1-partial field path',
  vendorField0(afterFieldFix),
  vendorField0(mapV1Partial),
);
assertEqual(
  'step0 matches v1-partial event name',
  purchaseEventName(afterFieldFix),
  purchaseEventName(mapV1Partial),
);

// Intermediate dry-run still fails (wrong event name)
const dry1 = applyVendorMap(sampleEvent, afterFieldFix);
assertTrue('v1-partial apply not skipped', !dry1.skipped, dry1.reason);
assertEqual('v1-partial has event_id', dry1.wire?.event_id, 'ord_multi_1');
assertEqual('v1-partial wrong event_name', dry1.wire?.event_name, 'PurchaseEvent');
const check1 = evaluateDryRunWire(dry1, finalExpectation);
assertTrue(
  'v1-partial dry-run still fails',
  check1.ok === false,
  `expected event_name failure, got ${JSON.stringify(dry1.wire)}`,
);
assertTrue(
  'v1-partial failure mentions event_name',
  check1.failures.some((f) => f.includes('event_name')),
  check1.failures.join('; '),
);

// After step 1 (event name fix) → final green
assertEqual('final event name', purchaseEventName(final), 'Purchase');
assertEqual('final vendor field', vendorField0(final), 'event_id');
assertEqual(
  'final matches fixture event name',
  purchaseEventName(final),
  purchaseEventName(mapFinal),
);
assertEqual(
  'final matches fixture field path',
  vendorField0(final),
  vendorField0(mapFinal),
);

// Original map unchanged (pure functions)
assertEqual('original still evt_id', vendorField0(mapV0), 'evt_id');
assertEqual('original still PurchaseEvent', purchaseEventName(mapV0), 'PurchaseEvent');

// applyMapPatches bulk helper matches sequential final
const bulkFinal = applyMapPatches(mapV0, patches);
assertEqual('bulk patches same field as sequential', vendorField0(bulkFinal), vendorField0(final));
assertEqual(
  'bulk patches same event as sequential',
  purchaseEventName(bulkFinal),
  purchaseEventName(final),
);

// ── final dry-run green with expected wire ───────────────────────
const dryFinal = applyVendorMap(sampleEvent, final);
assertTrue('final apply not skipped', !dryFinal.skipped, dryFinal.reason);
const checkFinal = evaluateDryRunWire(dryFinal, finalExpectation);
assertTrue('final dry-run green', checkFinal.ok, checkFinal.failures.join('; '));
assertEqual('final wire event_name', dryFinal.wire?.event_name, 'Purchase');
assertEqual('final wire event_id', dryFinal.wire?.event_id, 'ord_multi_1');
assertEqual('final wire no evt_id', dryFinal.wire?.evt_id, undefined);

// Also green when applying fixture map-final directly
const dryFixtureFinal = applyVendorMap(sampleEvent, mapFinal);
const checkFixture = evaluateDryRunWire(dryFixtureFinal, finalExpectation);
assertTrue('fixture map-final dry-run green', checkFixture.ok, checkFixture.failures.join('; '));

console.log('agent-fix-loop-multi: all checks passed');
