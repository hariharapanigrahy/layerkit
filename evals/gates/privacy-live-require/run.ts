/**
 * Gate: live mode without privacy policy hard-fails with privacy_policy_required.
 */
import { assertEqual, assertTrue } from '../../harness/assert.js';
import { loadFixture } from '../../harness/load-fixture.js';
import { evaluatePrivacy } from '../../../libs/privacy/gate.js';
import type { PrivacyEvent } from '../../../libs/privacy/types.js';
import { track } from '../../../libs/runtime/track.js';
import type { VendorMap } from '../../../libs/domain/types.js';

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

// Via track orchestrator
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

console.log('privacy-live-require: all checks passed');
