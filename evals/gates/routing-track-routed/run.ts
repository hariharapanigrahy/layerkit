/**
 * Gate: trackRouted applies plan entries with ruleIds on results (P4).
 */
import { assertEqual, assertTrue } from '../../harness/assert.js';
import { loadFixture } from '../../harness/load-fixture.js';
import type { DomainEvent } from '../../../libs/domain/event.js';
import type { VendorMap } from '../../../libs/domain/types.js';
import type { RoutingPolicy } from '../../../libs/routing/index.js';
import { trackRouted } from '../../../libs/runtime/track.js';

const policy = loadFixture<RoutingPolicy>('routing/policy-segment-sets.json');
const event = loadFixture<DomainEvent>('routing/event-narrow.json');

function mapFor(vendor: string): VendorMap {
  return {
    vendor,
    displayName: vendor,
    version: '1.0.0',
    auth: { type: 'bearer' },
    endpoint: { method: 'POST', path: '/e', baseUrl: 'https://api.example.com' },
    intents: {
      base_intent: { eventName: 'Base' },
      secondary_intent: { eventName: 'Secondary' },
    },
    fields: [{ domain: 'eventId', vendor: 'event_id', transform: { type: 'identity' } }],
    documentation: [{ title: 'docs', url: 'https://docs.example.com' }],
    status: 'map_complete',
  };
}

const maps = ['vendor_a', 'vendor_b', 'vendor_c'].map(mapFor);

const result = await trackRouted(event, maps, {
  mode: 'dry_run',
  routing: policy,
  observation: false,
  requirePrivacyPolicyForLive: false,
});

assertEqual('one vendor result (narrow set)', result.results.length, 1);
assertEqual('vendor_a', result.results[0]!.vendor, 'vendor_a');
assertEqual('success', result.results[0]!.outcome, 'success');
assertTrue('ruleIds present', (result.results[0]!.ruleIds?.length ?? 0) > 0);
assertTrue(
  'plan on result',
  result.plan != null && result.plan.entries.length === 1,
);
assertEqual('intent on result', result.results[0]!.intent, 'base_intent');

// special product → more results
const special = loadFixture<DomainEvent>('routing/event-all-with-secondary.json');
const multi = await trackRouted(special, maps, {
  mode: 'dry_run',
  routing: policy,
  observation: false,
});
assertEqual('3 base + 2 secondary = 5', multi.results.length, 5);
assertTrue(
  'secondary results exist',
  multi.results.some((r) => r.intent === 'secondary_intent'),
);

console.log('routing-track-routed: all checks passed');
