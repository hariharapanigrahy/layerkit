/**
 * Gate: what a *good agent* proposal looks like after reading Meta docs.
 * Core does not invent this map — eval loads agent-shaped fixture inline.
 * Uses harness temp-project for isolated store + cleanup.
 */
import { assertTrue } from '../../harness/assert.js';
import { withTempProject } from '../../harness/temp-project.js';
import type { Proposal } from '../../../libs/domain/types.js';
import { applyVendorMap } from '../../../libs/vendor-memory/map-engine.js';

await withTempProject(async ({ store }) => {
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
  const wire = applyVendorMap(
    { intent: 'purchase', eventId: 'ord_1', user: { email: 'a@b.com' } },
    map,
  );
  assertTrue('not skipped', !wire.skipped);
  assertTrue('event name', wire.wire?.event_name === 'Purchase');
  console.log('sample-meta-map-apply: all checks passed');
});
