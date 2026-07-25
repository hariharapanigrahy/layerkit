/**
 * Gate: agent-authored map + processor apply.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { assertEqual, assertTrue } from '../../harness/assert.js';
import { loadFixture } from '../../harness/load-fixture.js';
import { withTempProject } from '../../harness/temp-project.js';
import type { Proposal } from '../../../libs/domain/types.js';
import type { ExecutableProcessor } from '../../../libs/strategy/index.js';
import { applyVendorMap } from '../../../libs/vendor-memory/map-engine.js';

const GOLDEN_SHA256 =
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
    JSON.stringify(processor, null, 2) + '\n',
    'utf8',
  );

  const proposal: Proposal = {
    schemaVersion: 1,
    kind: 'vendor_map',
    id: 'prop-agent-fixture',
    summary: 'Agent-researched example map fixture',
    vendor: 'example_vendor',
    payload: {
      vendor: 'example_vendor',
      displayName: 'Example Vendor',
      version: '1.0.0',
      auth: { type: 'bearer', notes: 'from docs' },
      endpoint: {
        method: 'POST',
        path: '/v1/events',
        baseUrl: 'https://api.example.com',
      },
      intents: { purchase: { eventName: 'purchase' } },
      fields: [
        {
          domain: 'eventId',
          vendor: 'event_id',
          transform: { type: 'identity' },
        },
        {
          domain: 'user.email',
          vendor: 'user.email_hash',
          transform: { type: 'processor', processorId: 'example.email.sha256_normalized' },
          notes: 'From fixture docs',
        },
      ],
      documentation: [
        {
          title: 'Events API',
          url: 'https://docs.example.com/api/events',
        },
      ],
      status: 'map_complete',
    },
    sources: [
      {
        title: 'PII hashing',
        url: 'https://docs.example.com/api/pii',
        excerpt: 'Hash email with SHA256 after normalizing',
      },
    ],
    authoredBy: 'agent',
    createdAt: new Date().toISOString(),
    status: 'pending',
  };

  const review = store.reviewProposal(proposal);
  assertTrue('fixture proposal valid', review.valid, review.errors.join('; '));
  store.applyProposal(proposal);
  const map = store.loadMap('example_vendor')!;
  assertTrue('map applied', map.status === 'map_complete');

  const wire = applyVendorMap(
    { intent: 'purchase', eventId: 'ord_1', user: { email: 'a@b.com' } },
    map,
    { processorsDir: procDir },
  );
  assertTrue('not skipped', !wire.skipped);
  assertTrue('event name', wire.wire?.event_name === 'purchase');
  const em = (wire.wire?.user as Record<string, unknown> | undefined)?.email_hash;
  assertEqual('user.email_hash golden of a@b.com', em, GOLDEN_SHA256);
  assertTrue(
    'executed hash is string not placeholder',
    typeof em === 'string' && !String(em).includes('__processor'),
  );
  console.log('sample-meta-map-apply: all checks passed');
}, { poc: false });
