/**
 * Gate: agent-citation-required-on-map
 * Agent-authored vendor_map proposal without sources[] fails validate.
 * Fixture uses generic "acme" vendor (process test only — not catalog).
 */
import { assertTrue } from '../../harness/assert.js';
import { loadFixture } from '../../harness/load-fixture.js';
import { validateProposal } from '../../../libs/proposal/validate.js';
import type { Proposal, VendorMap } from '../../../libs/domain/types.js';

const map = loadFixture<VendorMap>('agent/wrong-path-map.json');

const agentNoSources: Proposal = {
  schemaVersion: 1,
  kind: 'vendor_map',
  id: 'agent-acme-no-sources',
  summary: 'Agent-authored acme map without citations (should fail)',
  vendor: 'acme',
  payload: map,
  sources: [],
  authoredBy: 'agent',
  createdAt: new Date().toISOString(),
  status: 'pending',
};

const bad = validateProposal(agentNoSources);
assertTrue(
  'agent map without sources fails with sources error',
  bad.some((i) => i.code === 'sources' && i.level === 'error'),
  bad.map((i) => `${i.code}:${i.message}`).join('; '),
);

const agentCited: Proposal = {
  ...agentNoSources,
  id: 'agent-acme-cited',
  summary: 'Agent-authored acme map with documentation sources',
  sources: [
    {
      title: 'Acme Events API (fixture)',
      url: 'https://docs.acme-fixture.test/events',
      excerpt: 'POST /v1/events with Bearer token',
    },
  ],
};

const ok = validateProposal(agentCited);
const sourceErrors = ok.filter((i) => i.level === 'error' && i.code === 'sources');
assertTrue(
  'agent map with sources has no sources error',
  sourceErrors.length === 0,
  sourceErrors.map((i) => i.message).join('; '),
);

// Still agent-authored (process case) — documentation on map remains
assertTrue(
  'payload still has documentation for re-verification',
  Array.isArray((agentCited.payload as VendorMap).documentation) &&
    (agentCited.payload as VendorMap).documentation!.length > 0,
);

console.log('agent-citation-required-on-map: all checks passed');
