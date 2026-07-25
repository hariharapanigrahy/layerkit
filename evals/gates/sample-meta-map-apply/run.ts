/**
 * Gate: what a *good agent* proposal looks like after reading Meta docs.
 * Seeds Appendix A.5 processor so applyVendorMap executes the real pipeline
 * (fail-closed — no __processor placeholders).
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

// poc: true matches install --poc: apply agent map over seeded empty vendor skeletons
await withTempProject(
  async ({ store, projectDir }) => {
    // Seed A.5 processor into project store before map apply / dry-run
    const processor = loadFixture<ExecutableProcessor>('meta/processor-email-sha256.json');
    const procDir = join(projectDir, 'processors');
    mkdirSync(procDir, { recursive: true });
    writeFileSync(
      join(procDir, 'meta_email_sha256_normalized.json'),
      JSON.stringify(processor, null, 2) + '\n',
      'utf8',
    );

    const proposal: Proposal = {
      schemaVersion: 1,
      kind: 'vendor_map',
      id: 'prop-meta-fixture',
      summary: 'Agent-researched Meta map fixture',
      vendor: 'meta',
      payload: {
        vendor: 'meta',
        displayName: 'Meta CAPI',
        version: '1.0.0',
        auth: { type: 'bearer', notes: 'system user token' },
        endpoint: {
          method: 'POST',
          path: '/v19.0/{pixelId}/events',
          baseUrl: 'https://graph.facebook.com',
        },
        intents: { purchase: { eventName: 'Purchase' } },
        fields: [
          {
            domain: 'eventId',
            vendor: 'event_id',
            transform: { type: 'identity' },
          },
          {
            domain: 'user.email',
            vendor: 'user_data.em',
            transform: { type: 'processor', processorId: 'meta.email.sha256_normalized' },
            notes: 'From Meta customer information parameters',
          },
        ],
        documentation: [
          {
            title: 'CAPI',
            url: 'https://developers.facebook.com/docs/marketing-api/conversions-api',
          },
        ],
        status: 'map_complete',
      },
      sources: [
        {
          title: 'Customer Information Parameters',
          url: 'https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters',
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
    const map = store.loadMap('meta')!;
    assertTrue('map applied', map.status === 'map_complete');
    // POC seeds 20 empty maps; apply overwrites meta skeleton with agent map.
    assertTrue('poc seeded maps still present', store.listMaps().length >= 1);

    const wire = applyVendorMap(
      { intent: 'purchase', eventId: 'ord_1', user: { email: 'a@b.com' } },
      map,
      { processorsDir: procDir },
    );
    assertTrue('not skipped', !wire.skipped);
    assertTrue('event name', wire.wire?.event_name === 'Purchase');
    const em = (wire.wire?.user_data as Record<string, unknown> | undefined)?.em;
    assertEqual('user_data.em golden hash of a@b.com', em, GOLDEN_SHA256);
    assertTrue(
      'executed hash is string not placeholder',
      typeof em === 'string' && !String(em).includes('__processor'),
    );
    console.log('sample-meta-map-apply: all checks passed');
  },
  { poc: true },
);
