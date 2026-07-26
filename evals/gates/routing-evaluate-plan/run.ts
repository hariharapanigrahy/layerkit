/**
 * Gate: evaluateRouting vendor sets + expansions (P0/P1) with fixture policy.
 */
import { assertEqual, assertTrue } from '../../harness/assert.js';
import { loadFixture } from '../../harness/load-fixture.js';
import type { DomainEvent } from '../../../libs/domain/event.js';
import { evaluateRouting, validateRoutingPolicy, type RoutingPolicy } from '../../../libs/routing/index.js';

const policy = loadFixture<RoutingPolicy>('routing/policy-segment-sets.json');
const issues = validateRoutingPolicy(policy);
assertEqual('policy has no errors', issues.filter((i) => i.level === 'error').length, 0);

const known = ['vendor_a', 'vendor_b', 'vendor_c'];

// narrow segment → set_narrow only (1 vendor), base intent only
const narrow = loadFixture<DomainEvent>('routing/event-narrow.json');
const planNarrow = evaluateRouting(narrow, policy, { knownVendors: known });
assertEqual('narrow: one entry', planNarrow.entries.length, 1);
assertEqual('narrow vendor', planNarrow.entries[0]!.vendor, 'vendor_a');
assertEqual('narrow intent', planNarrow.entries[0]!.intent, 'base_intent');
assertTrue(
  'narrow used route_base_narrow',
  planNarrow.entries[0]!.ruleIds.includes('route_base_narrow'),
);

// default segment + special product → base to all 3 + secondary to 2 (dedupe by vendor+intent)
const special = loadFixture<DomainEvent>('routing/event-all-with-secondary.json');
const planSpecial = evaluateRouting(special, policy, { knownVendors: known });
assertTrue(
  'special expanded secondary_intent',
  planSpecial.expandedIntents.includes('secondary_intent'),
);
const baseEntries = planSpecial.entries.filter((e) => e.intent === 'base_intent');
const secEntries = planSpecial.entries.filter((e) => e.intent === 'secondary_intent');
assertEqual('base to set_all = 3 vendors', baseEntries.length, 3);
assertEqual('secondary to set_secondary = 2 vendors', secEntries.length, 2);
assertTrue(
  'secondary has expansion id',
  secEntries.every((e) => e.expansionId === 'exp_secondary_product'),
);

// unknown vendor filtered
const planFiltered = evaluateRouting(narrow, policy, {
  knownVendors: ['vendor_b'],
});
assertEqual('narrow vendor_a unknown → 0 entries', planFiltered.entries.length, 0);
assertTrue(
  'unknown_vendor diagnostic',
  planFiltered.diagnostics.some((d) => d.code === 'unknown_vendor'),
);

console.log('routing-evaluate-plan: all checks passed');
