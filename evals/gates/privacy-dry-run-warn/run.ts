/**
 * Gate: dry_run without privacy policy allows with privacy_policy_missing warn.
 * Also: map_complete is eligible in dry_run (status filter).
 */
import { assertEqual, assertTrue } from '../../harness/assert.js';
import { loadFixture } from '../../harness/load-fixture.js';
import { evaluatePrivacy } from '../../../libs/privacy/gate.js';
import type { PrivacyEvent, PrivacyPolicy } from '../../../libs/privacy/types.js';
import { track } from '../../../libs/runtime/track.js';
import type { VendorMap } from '../../../libs/domain/types.js';

const event = loadFixture<PrivacyEvent>('privacy/event-purchase.json');
const wire = {
  event_name: 'Purchase',
  event_id: event.eventId,
  'user.email': 'should-be-stripped-by-denylist-if-policy',
};

// Direct gate — no policy
const direct = evaluatePrivacy(event, wire, null, 'dry_run');
assertEqual('dry_run no-policy action allow', direct.action, 'allow');
assertEqual(
  'dry_run no-policy reason code',
  direct.reasonCode,
  'privacy_policy_missing',
);
assertTrue(
  'dry_run warns privacy_policy_missing',
  direct.warnings.includes('privacy_policy_missing'),
);
assertTrue('dry_run payload present', direct.payload != null);

// Shadow same posture
const shadow = evaluatePrivacy(event, wire, null, 'shadow');
assertEqual('shadow no-policy allow', shadow.action, 'allow');
assertTrue(
  'shadow warns missing',
  shadow.warnings.includes('privacy_policy_missing'),
);

// With policy + denylist still works
const policy = loadFixture<PrivacyPolicy>('privacy/policy-allow.json');
const withPolicy = evaluatePrivacy(
  event,
  {
    event_name: 'Purchase',
    user: { email: 'a@b.com' },
    safe: true,
  },
  policy,
  'dry_run',
);
assertEqual('policy allow', withPolicy.action, 'allow');
assertTrue('denylist payload present', withPolicy.payload != null);
const userObj = (withPolicy.payload as { user?: Record<string, unknown> }).user;
assertTrue(
  'denylist removed user.email',
  userObj == null || userObj.email === undefined,
);
assertTrue(
  'denylist kept safe field',
  (withPolicy.payload as { safe?: boolean }).safe === true,
);

// track dry_run includes map_complete, excludes skeleton
const maps: VendorMap[] = [
  {
    vendor: 'live_vendor',
    displayName: 'Live',
    version: '1',
    auth: { type: 'bearer' },
    endpoint: { method: 'POST', path: '/e' },
    intents: { purchase: { eventName: 'Purchase' } },
    fields: [{ domain: 'eventId', vendor: 'event_id', transform: { type: 'identity' } }],
    documentation: [{ title: 't', url: 'https://example.com' }],
    status: 'live',
  },
  {
    vendor: 'complete_vendor',
    displayName: 'Complete',
    version: '1',
    auth: { type: 'bearer' },
    endpoint: { method: 'POST', path: '/e' },
    intents: { purchase: { eventName: 'Purchase' } },
    fields: [{ domain: 'eventId', vendor: 'event_id', transform: { type: 'identity' } }],
    documentation: [{ title: 't', url: 'https://example.com' }],
    status: 'map_complete',
  },
  {
    vendor: 'skeleton_vendor',
    displayName: 'Skeleton',
    version: '1',
    auth: { type: 'bearer' },
    endpoint: { method: 'POST', path: '/e' },
    intents: {},
    fields: [],
    documentation: [{ title: 't', url: 'https://example.com' }],
    status: 'skeleton',
  },
];

const dry = await track(event, maps, { mode: 'dry_run', privacyPolicy: null });
const vendors = dry.results.map((r) => r.vendor).sort();
assertEqual('dry_run vendors count', dry.results.length, 2);
assertTrue('includes live', vendors.includes('live_vendor'));
assertTrue('includes map_complete', vendors.includes('complete_vendor'));
assertTrue('excludes skeleton', !vendors.includes('skeleton_vendor'));
assertTrue(
  'dry_run success with missing policy warn',
  dry.results.every((r) => r.outcome === 'success' && r.warnings?.includes('privacy_policy_missing')),
);

const liveOnly = await track(event, maps, { mode: 'live', privacyPolicy: null });
assertEqual('live only live status', liveOnly.results.length, 1);
assertEqual('live vendor only', liveOnly.results[0]!.vendor, 'live_vendor');

console.log('privacy-dry-run-warn: all checks passed');
