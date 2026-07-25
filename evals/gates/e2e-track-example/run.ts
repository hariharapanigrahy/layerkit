/**
 * E2E: temp project → seed processor + map + privacy → track dry_run.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertTrue, assertEqual } from '../../harness/assert.js';
import { loadFixture } from '../../harness/load-fixture.js';
import { withTempProject } from '../../harness/temp-project.js';
import type { Proposal, VendorMap } from '../../../libs/domain/types.js';
import type { ExecutableProcessor } from '../../../libs/strategy/index.js';
import type { PrivacyPolicy } from '../../../libs/privacy/types.js';
import { track } from '../../../libs/runtime/track.js';

const GOLDEN =
  'fb98d44ad7501a959f3f4f4a3f004fe2d9e581ea6207e218c4b02c08a4d75adf';

await withTempProject(async ({ store, projectDir }) => {
  // Enable legacy apply so pending proposals can apply without full maker-checker path
  const project = store.loadProject()!;
  project.makerChecker = { ...project.makerChecker, legacyApplyWithoutApprove: true };
  store.saveProject(project);

  const processor = loadFixture<ExecutableProcessor>('agent/processor-email-sha256.json');
  const procDir = join(projectDir, 'processors');
  mkdirSync(procDir, { recursive: true });
  writeFileSync(
    join(procDir, 'example_email_sha256_normalized.json'),
    JSON.stringify(processor, null, 2),
  );

  const mapPayload = {
    vendor: 'example_vendor',
    displayName: 'Example Vendor',
    version: '1.0.0',
    auth: { type: 'bearer' as const },
    endpoint: { method: 'POST' as const, path: '/v1/events', baseUrl: 'https://api.example.com' },
    intents: { purchase: { eventName: 'purchase' } },
    fields: [
      { domain: 'eventId', vendor: 'event_id', transform: { type: 'identity' as const } },
      {
        domain: 'user.email',
        vendor: 'user.email_hash',
        transform: {
          type: 'processor' as const,
          processorId: 'example.email.sha256_normalized',
        },
      },
    ],
    documentation: [{ title: 'Events', url: 'https://docs.example.com/api/events' }],
    status: 'map_complete' as const,
  };

  const proposal: Proposal = {
    schemaVersion: 1,
    kind: 'vendor_map',
    id: 'e2e-example',
    summary: 'e2e example agent map',
    vendor: 'example_vendor',
    payload: mapPayload,
    sources: [{ title: 'Events', url: 'https://docs.example.com/api/events' }],
    authoredBy: 'agent',
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  store.applyProposal(proposal);

  const policy = loadFixture<PrivacyPolicy>('privacy/policy-allow.json');
  mkdirSync(join(projectDir, 'privacy'), { recursive: true });
  writeFileSync(join(projectDir, 'privacy', 'default.json'), JSON.stringify(policy, null, 2));

  const map = store.loadMap('example_vendor') as VendorMap;
  const result = await track(
    {
      intent: 'purchase',
      eventId: 'e2e_1',
      user: { email: 'a@b.com' },
      consent: { purposes: ['marketing'] },
    },
    [map],
    {
      mode: 'dry_run',
      privacyPolicy: policy,
      requirePrivacyPolicyForLive: true,
      processorsDir: procDir,
    },
  );

  assertEqual('one vendor result', result.results.length, 1);
  const r = result.results[0]!;
  assertTrue('not failure', r.outcome !== 'failure', r.reason);
  assertTrue('has wire', r.wire != null);
  const em = (r.wire?.user as Record<string, unknown> | undefined)?.email_hash;
  assertEqual('hashed email', em, GOLDEN);
  console.log('e2e-track-example: all checks passed');
}, { poc: false });
