/**
 * Gate: hallucination-block-apply
 * REPLACE / invent endpoint paths are blocked before store mutation;
 * real https docs + real path /events apply successfully (legacy apply on).
 */
import { assertTrue } from '../../harness/assert.js';
import { withTempProject } from '../../harness/temp-project.js';
import type { Proposal, VendorMap } from '../../../libs/domain/types.js';
import {
  assertNoHallucinationIssues,
  detectHallucinationIssues,
} from '../../../libs/hallucination/index.js';

await withTempProject(async ({ store }) => {
  // Legacy apply so pending proposals can apply without full maker-checker path
  const project = store.loadProject()!;
  project.makerChecker = {
    ...project.makerChecker,
    legacyApplyWithoutApprove: true,
  };
  store.saveProject(project);
  assertTrue('legacy apply enabled', store.isLegacyApplyEnabled());

  const goodMap: VendorMap = {
    vendor: 'acme_events',
    displayName: 'Acme Events',
    version: '1.0.0',
    auth: { type: 'bearer' },
    endpoint: {
      method: 'POST',
      path: '/events',
      baseUrl: 'https://api.acme-integrations.test',
    },
    intents: { purchase: { eventName: 'Purchase' } },
    fields: [
      { domain: 'eventId', vendor: 'event_id', transform: { type: 'identity' } },
    ],
    documentation: [
      {
        title: 'Acme Events API',
        url: 'https://docs.acme-integrations.test/api/events',
      },
    ],
    status: 'map_complete',
  };

  const goodProposal: Proposal = {
    schemaVersion: 1,
    kind: 'vendor_map',
    id: 'prop-hallu-good',
    summary: 'real docs + real path',
    vendor: 'acme_events',
    payload: goodMap,
    sources: [
      {
        title: 'Acme Events API',
        url: 'https://docs.acme-integrations.test/api/events',
      },
    ],
    authoredBy: 'agent',
    createdAt: new Date().toISOString(),
    status: 'pending',
  };

  const goodReport = detectHallucinationIssues(goodProposal);
  assertTrue(
    'good proposal has no hallucination errors',
    goodReport.issues.filter((i) => i.level === 'error').length === 0,
    goodReport.issues.map((i) => `${i.code}:${i.message}`).join('; '),
  );
  assertNoHallucinationIssues(goodProposal);

  const applied = store.applyProposal(goodProposal);
  assertTrue('good apply kind', applied.kind === 'vendor_map');
  assertTrue('good apply target', applied.target === 'acme_events');
  assertTrue('map written', store.loadMap('acme_events')?.status === 'map_complete');
  assertTrue('good proposal applied', goodProposal.status === 'applied');

  // REPLACE endpoint must not mutate store
  const badMap: VendorMap = {
    vendor: 'invent_vendor',
    displayName: 'Invent Vendor',
    version: '1.0.0',
    auth: { type: 'bearer' },
    endpoint: {
      method: 'POST',
      path: '/REPLACE_FROM_DOCS',
      baseUrl: 'https://api.acme-integrations.test',
    },
    intents: { purchase: { eventName: 'Purchase' } },
    fields: [
      { domain: 'eventId', vendor: 'event_id', transform: { type: 'identity' } },
    ],
    documentation: [
      {
        title: 'docs',
        url: 'https://docs.acme-integrations.test/api/events',
      },
    ],
    status: 'map_complete',
  };

  const badProposal: Proposal = {
    schemaVersion: 1,
    kind: 'vendor_map',
    id: 'prop-hallu-replace',
    summary: 'REPLACE endpoint invent',
    vendor: 'invent_vendor',
    payload: badMap,
    sources: [
      {
        title: 'docs',
        url: 'https://docs.acme-integrations.test/api/events',
      },
    ],
    authoredBy: 'agent',
    createdAt: new Date().toISOString(),
    status: 'pending',
  };

  const badReport = detectHallucinationIssues(badProposal);
  assertTrue(
    'REPLACE path flagged as invent',
    badReport.issues.some(
      (i) => i.level === 'error' && i.code === 'placeholder_endpoint_path',
    ),
    badReport.issues.map((i) => i.code).join(','),
  );

  let threw = false;
  let errMsg = '';
  try {
    store.applyProposal(badProposal);
  } catch (e) {
    threw = true;
    errMsg = e instanceof Error ? e.message : String(e);
  }
  assertTrue('REPLACE apply throws', threw, 'expected applyProposal to throw');
  assertTrue(
    'throw is validation or hallucination_blocked',
    errMsg.includes('hallucination_blocked') ||
      errMsg.includes('Invalid proposal') ||
      errMsg.includes('REPLACE'),
    errMsg,
  );
  assertTrue(
    'invent map not written',
    store.loadMap('invent_vendor') === null,
  );
  assertTrue(
    'bad proposal not marked applied',
    badProposal.status === 'pending',
  );

console.log('hallucination-block-apply: all checks passed');
});
