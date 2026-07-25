/**
 * E2E: install-style temp project → seed processor + map + privacy → track dry_run.
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
  const processor = loadFixture<ExecutableProcessor>('meta/processor-email-sha256.json');
  const procDir = join(projectDir, 'processors');
  mkdirSync(procDir, { recursive: true });
  writeFileSync(join(procDir, 'meta_email_sha256_normalized.json'), JSON.stringify(processor, null, 2));

  const mapPayload = {
    vendor: 'meta',
    displayName: 'Meta CAPI',
    version: '1.0.0',
    auth: { type: 'bearer' as const },
    endpoint: { method: 'POST' as const, path: '/events', baseUrl: 'https://graph.facebook.com' },
    intents: { purchase: { eventName: 'Purchase' } },
    fields: [
      { domain: 'eventId', vendor: 'event_id', transform: { type: 'identity' as const } },
      {
        domain: 'user.email',
        vendor: 'user_data.em',
        transform: { type: 'processor' as const, processorId: 'meta.email.sha256_normalized' },
      },
    ],
    documentation: [{ title: 'CAPI', url: 'https://developers.facebook.com/docs/marketing-api/conversions-api' }],
    status: 'map_complete' as const,
  };

  const proposal: Proposal = {
    schemaVersion: 1,
    kind: 'vendor_map',
    id: 'e2e-meta',
    summary: 'e2e meta',
    vendor: 'meta',
    payload: mapPayload,
    sources: [{ title: 'CAPI', url: 'https://developers.facebook.com/docs/marketing-api/conversions-api' }],
    authoredBy: 'agent',
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  store.applyProposal(proposal);

  const policy = loadFixture<PrivacyPolicy>('privacy/policy-allow.json');
  mkdirSync(join(projectDir, 'privacy'), { recursive: true });
  writeFileSync(join(projectDir, 'privacy', 'default.json'), JSON.stringify(policy, null, 2));

  const map = store.loadMap('meta') as VendorMap;
  // Processors resolve from projectDir/processors via store path convention
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
  const em = (r.wire?.user_data as Record<string, unknown> | undefined)?.em;
  assertEqual('hashed email', em, GOLDEN);
  console.log('e2e-track-meta: all checks passed');
}, { poc: false });
