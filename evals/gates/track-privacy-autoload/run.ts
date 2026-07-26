/**
 * Gate: track() loads privacy/*.json from projectDir (promote→runtime contract).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertTrue, assertEqual } from '../../harness/assert.js';
import { loadFixture } from '../../harness/load-fixture.js';
import { withTempProject } from '../../harness/temp-project.js';
import type { VendorMap } from '../../../libs/domain/types.js';
import type { PrivacyPolicy } from '../../../libs/privacy/types.js';
import { track } from '../../../libs/runtime/track.js';

await withTempProject(async ({ projectDir }) => {
  const policy = loadFixture<PrivacyPolicy>('privacy/policy-allow.json');
  mkdirSync(join(projectDir, 'privacy'), { recursive: true });
  writeFileSync(join(projectDir, 'privacy', 'default.json'), JSON.stringify(policy, null, 2));

  const map: VendorMap = {
    vendor: 'example_vendor',
    displayName: 'Example',
    version: '1.0.0',
    auth: { type: 'bearer' },
    endpoint: { method: 'POST', path: '/v1/events', baseUrl: 'https://api.example.com' },
    intents: { purchase: { eventName: 'purchase' } },
    fields: [
      { domain: 'eventId', vendor: 'event_id', transform: { type: 'identity' } },
      { domain: 'user.email', vendor: 'user.email', transform: { type: 'identity' } },
    ],
    documentation: [{ title: 'docs', url: 'https://docs.example.com' }],
    // live mode only selects status=live (map_complete is dry_run/shadow)
    status: 'live',
  };

  // Without projectDir / policy, live fails closed
  const bare = await track(
    {
      intent: 'purchase',
      eventId: 'e1',
      user: { email: 'a@b.com' },
      consent: { purposes: ['marketing'] },
    },
    [map],
    { mode: 'live', observation: false },
  );
  assertEqual('live without policy has result', bare.results.length, 1);
  assertEqual('live without policy fails', bare.results[0]!.outcome, 'failure');
  assertEqual(
    'reason privacy_policy_required',
    bare.results[0]!.reason,
    'privacy_policy_required',
  );

  // With projectDir, policy auto-loaded from privacy/default.json
  const withDir = await track(
    {
      intent: 'purchase',
      eventId: 'e2',
      user: { email: 'a@b.com' },
      consent: { purposes: ['marketing'] },
    },
    [map],
    { mode: 'live', projectDir, observation: false },
  );
  assertEqual('one result', withDir.results.length, 1);
  assertTrue(
    'live with disk policy not privacy_policy_required fail',
    withDir.results[0]!.reason !== 'privacy_policy_required',
    withDir.results[0]!.reason,
  );
  // denylist may redact/drop email path; success or skip from consent/egress is ok if policy loaded
  assertTrue(
    'not missing-policy failure',
    withDir.results[0]!.outcome !== 'failure' ||
      withDir.results[0]!.reason !== 'privacy_policy_required',
  );

  console.log('track-privacy-autoload: all checks passed');
}, { poc: true });
