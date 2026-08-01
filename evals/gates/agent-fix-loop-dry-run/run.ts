/**
 * Gate: agent-fix-loop-dry-run
 * Pure TS simulation of agent fix-loop: explicit evidence-backed patch →
 * corrected proposal validates and applyVendorMap succeeds.
 */
import { assertEqual, assertTrue } from '../../harness/assert.js';
import { loadFixture } from '../../harness/load-fixture.js';
import {
  applyMapPathFix,
  applyProposalMapFix,
  type MapPathFixPatch,
} from '../../../libs/agent/index.js';
import { validateProposal, isValidProposal } from '../../../libs/proposal/validate.js';
import { applyVendorMap } from '../../../libs/vendor-memory/map-engine.js';
import type { Proposal, VendorMap } from '../../../libs/domain/types.js';

const wrongMap = loadFixture<VendorMap>('agent/wrong-path-map.json');
const patchFixture = loadFixture<MapPathFixPatch>('agent/fix-patch.json');

assertEqual('agent-authored patch.to', patchFixture.to, '/v1/events');
assertEqual('agent-authored patch.from', patchFixture.from, '/v1/wrong/ingest');

// 1) Apply explicit fixture patch
const fixedMap = applyMapPathFix(wrongMap, patchFixture);
assertEqual(
  'fixed endpoint.path',
  (fixedMap as { endpoint?: { path?: string } }).endpoint?.path,
  '/v1/events',
);
// original unchanged
assertEqual(
  'original map still wrong',
  (wrongMap as { endpoint?: { path?: string } }).endpoint?.path,
  '/v1/wrong/ingest',
);

// 2) Proposal path: invalid → fix → valid
const badProposal: Proposal = {
  schemaVersion: 1,
  kind: 'vendor_map',
  id: 'agent-acme-fix-loop',
  summary: 'Acme map with wrong path (pre-fix)',
  vendor: 'acme',
  payload: wrongMap,
  sources: [
    {
      title: 'Acme Events API (fixture)',
      url: 'https://docs.acme-fixture.test/events',
      excerpt: 'POST /v1/events',
    },
  ],
  authoredBy: 'agent',
  createdAt: new Date().toISOString(),
  status: 'pending',
};

// Pre-fix map is structurally valid as a proposal (has sources/docs) but path is wrong vs docs
assertTrue(
  'pre-fix proposal structurally validates',
  isValidProposal(badProposal),
  validateProposal(badProposal)
    .filter((i) => i.level === 'error')
    .map((i) => i.message)
    .join('; '),
);

const fixedProposal = applyProposalMapFix(badProposal, patchFixture, {
  sourceUrl: 'https://docs.acme-fixture.test/events',
  sourceTitle: 'Acme Events fix-loop evidence',
});

assertEqual(
  'fixed proposal path',
  (fixedProposal.payload as { endpoint?: { path?: string } }).endpoint?.path,
  '/v1/events',
);
assertTrue(
  'fixed proposal validates',
  isValidProposal(fixedProposal),
  validateProposal(fixedProposal)
    .filter((i) => i.level === 'error')
    .map((i) => i.message)
    .join('; '),
);
assertTrue(
  'fix added or retained sources',
  (fixedProposal.sources?.length ?? 0) >= 1,
);

// 3) Dry-run map apply succeeds with corrected path (identity field only)
const wire = applyVendorMap(
  { intent: 'purchase', eventId: 'ord_fix_1', user: { email: 'a@b.com' } },
  fixedProposal.payload as VendorMap,
);
assertTrue('map apply not skipped', !wire.skipped, wire.reason);
assertTrue('event_name Purchase', wire.wire?.event_name === 'Purchase');
assertEqual('event_id mapped', wire.wire?.event_id, 'ord_fix_1');

console.log('agent-fix-loop-dry-run: all checks passed');
