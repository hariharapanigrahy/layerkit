/**
 * Gate: fix-dry-run-cli
 * CLI-equivalent pure function path (same libs as `layerkit fix dry-run`):
 * load fix-loop-multi fixtures → apply 2 patches → intermediate fails → final wire ok.
 */
import { assertEqual, assertTrue } from '../../harness/assert.js';
import { loadFixture } from '../../harness/load-fixture.js';
import {
  applyMapPatches,
  evaluateDryRunWire,
  runSequentialMapFixes,
  type MapPathFixPatch,
  type WireExpectation,
} from '../../../libs/agent/index.js';
import { applyVendorMap } from '../../../libs/vendor-memory/map-engine.js';
import type { VendorMap } from '../../../libs/domain/types.js';

const mapV0 = loadFixture<VendorMap>('agent/fix-loop-multi/map-v0.json');
const mapFinal = loadFixture<VendorMap>('agent/fix-loop-multi/map-final.json');
const patches = loadFixture<MapPathFixPatch[]>('agent/fix-loop-multi/patches.json');

// Same sample shape the CLI uses for pure dry-run wire checks
const sampleEvent = {
  intent: 'purchase',
  eventId: 'ord_multi_1',
  user: { email: 'a@b.com' },
};

/** Mirrors CLI flags: --expect-event Purchase --require-field event_id --forbid-field evt_id */
const finalExpectation: WireExpectation = {
  notSkipped: true,
  eventName: 'Purchase',
  requiredKeys: ['event_id'],
  forbiddenKeys: ['evt_id'],
};

assertEqual('patches length is 2', patches.length, 2);
assertEqual('patch0 field', patches[0]!.field, 'fields.0.vendor');
assertEqual('patch1 field', patches[1]!.field, 'intents.purchase.eventName');

// ── before: broken map fails wire expectation (CLI step "before") ──
const before = applyVendorMap(sampleEvent, mapV0);
assertTrue('v0 apply not skipped', !before.skipped, before.reason);
const beforeCheck = evaluateDryRunWire(before, finalExpectation);
assertTrue(
  'v0 fails final expectation',
  beforeCheck.ok === false,
  `expected failures, got ok with ${JSON.stringify(before.wire)}`,
);
assertTrue(
  'v0 failures mention field or event',
  beforeCheck.failures.some((f) => f.includes('event_id') || f.includes('event_name')),
  beforeCheck.failures.join('; '),
);

// ── sequential fix loop (runSequentialMapFixes — same as CLI) ──
const { steps, final } = runSequentialMapFixes(mapV0, patches);
assertEqual('two fix steps', steps.length, 2);

// Intermediate after first patch still fails (wrong event name)
const mid = applyVendorMap(sampleEvent, steps[0]!.map);
const midCheck = evaluateDryRunWire(mid, finalExpectation);
assertTrue(
  'after first patch still fails',
  midCheck.ok === false,
  `expected event_name failure, got ${JSON.stringify(mid.wire)}`,
);
assertTrue(
  'mid failure mentions event_name',
  midCheck.failures.some((f) => f.includes('event_name')),
  midCheck.failures.join('; '),
);
assertEqual('mid has event_id (field fixed)', mid.wire?.event_id, 'ord_multi_1');

// Final after both patches green
const after = applyVendorMap(sampleEvent, final);
const afterCheck = evaluateDryRunWire(after, finalExpectation);
assertTrue('final dry-run green', afterCheck.ok, afterCheck.failures.join('; '));
assertEqual('final wire event_name', after.wire?.event_name, 'Purchase');
assertEqual('final wire event_id', after.wire?.event_id, 'ord_multi_1');
assertEqual('final wire no evt_id', after.wire?.evt_id, undefined);

// bulk applyMapPatches matches sequential final (CLI --out body)
const bulk = applyMapPatches(mapV0, patches);
const bulkWire = applyVendorMap(sampleEvent, bulk);
assertTrue(
  'bulk patches dry-run green',
  evaluateDryRunWire(bulkWire, finalExpectation).ok,
  evaluateDryRunWire(bulkWire, finalExpectation).failures.join('; '),
);
assertEqual(
  'bulk matches fixture map-final event name',
  (bulk as { intents?: { purchase?: { eventName?: string } } }).intents?.purchase?.eventName,
  (mapFinal as { intents?: { purchase?: { eventName?: string } } }).intents?.purchase?.eventName,
);

// Original map unchanged
assertEqual(
  'original still evt_id',
  (mapV0 as { fields?: Array<{ vendor?: string }> }).fields?.[0]?.vendor,
  'evt_id',
);

console.log('fix-dry-run-cli: all checks passed');
