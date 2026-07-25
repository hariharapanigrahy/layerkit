/**
 * Gate: live mode without privacy policy hard-fails with privacy_policy_required.
 * Covers: direct evaluatePrivacy, linear track, and track with inline flow (no privacy node).
 * Also: requirePrivacyPolicyForLive=false allows live with warn (dry_run posture).
 */
import { assertEqual, assertTrue } from '../../harness/assert.js';
import { loadFixture } from '../../harness/load-fixture.js';
import { evaluatePrivacy } from '../../../libs/privacy/gate.js';
import type { PrivacyEvent } from '../../../libs/privacy/types.js';
import { track } from '../../../libs/runtime/track.js';
import type { VendorMap } from '../../../libs/domain/types.js';
import type { IntegrationFlow } from '../../../libs/flow/types.js';

const event = loadFixture<PrivacyEvent>('privacy/event-purchase.json');
const wire = {
  event_name: 'Purchase',
  event_id: event.eventId,
  user_data: { em: 'placeholder' },
};

// Direct gate
const direct = evaluatePrivacy(event, wire, null, 'live');
assertEqual('live no-policy action is fail', direct.action, 'fail');
assertEqual(
  'live no-policy reason',
  direct.reasonCode,
  'privacy_policy_required',
);
assertTrue('live no-policy payload null', direct.payload === null);

// Linear track orchestrator
const map: VendorMap = {
  vendor: 'meta',
  displayName: 'Meta',
  version: '1.0.0',
  auth: { type: 'bearer' },
  endpoint: { method: 'POST', path: '/events' },
  intents: { purchase: { eventName: 'Purchase' } },
  fields: [
    { domain: 'eventId', vendor: 'event_id', transform: { type: 'identity' } },
  ],
  documentation: [{ title: 'docs', url: 'https://example.com' }],
  status: 'live',
};

const tr = await track(event, [map], { mode: 'live', privacyPolicy: null });
assertEqual('track one result', tr.results.length, 1);
assertEqual('track outcome failure', tr.results[0]!.outcome, 'failure');
assertEqual(
  'track reason privacy_policy_required',
  tr.results[0]!.reason,
  'privacy_policy_required',
);

// Flow path: inline flow without privacy node must still fail-closed on live + null policy
const oauthFlow = loadFixture<IntegrationFlow>('flow/oauth-then-post.json');
const mapWithFlow = {
  ...map,
  vendor: 'meta_flow',
  flow: oauthFlow,
} as VendorMap & { flow: IntegrationFlow };

const flowTrack = await track(event, [mapWithFlow], {
  mode: 'live',
  privacyPolicy: null,
});
assertEqual('flow track one result', flowTrack.results.length, 1);
assertEqual(
  'flow track outcome failure (post-flow privacy)',
  flowTrack.results[0]!.outcome,
  'failure',
);
assertEqual(
  'flow track reason privacy_policy_required',
  flowTrack.results[0]!.reason,
  'privacy_policy_required',
);
assertTrue(
  'flow track wire null on privacy fail',
  flowTrack.results[0]!.wire == null,
);

// requirePrivacyPolicyForLive=false → live allows with warn (wired option)
const relaxed = evaluatePrivacy(event, wire, null, 'live', {
  requirePrivacyPolicyForLive: false,
});
assertEqual('relaxed live action allow', relaxed.action, 'allow');
assertEqual(
  'relaxed live reason missing',
  relaxed.reasonCode,
  'privacy_policy_missing',
);
assertTrue(
  'relaxed live warns',
  relaxed.warnings.includes('privacy_policy_missing'),
);

const relaxedTrack = await track(event, [map], {
  mode: 'live',
  privacyPolicy: null,
  requirePrivacyPolicyForLive: false,
});
assertEqual('relaxed track success', relaxedTrack.results[0]!.outcome, 'success');
assertTrue(
  'relaxed track warns missing',
  (relaxedTrack.results[0]!.warnings ?? []).includes('privacy_policy_missing'),
);

console.log('privacy-live-require: all checks passed');
