/**
 * Gate: agent-fix-loop-dry-run
 * Pure TS simulation of agent fix-loop: wrong path map + doc excerpt →
 * corrected proposal validates and applyVendorMap succeeds.
 */
import { assertEqual, assertTrue } from '../../harness/assert.js';
import { loadFixture, loadFixtureText } from '../../harness/load-fixture.js';
import {
  applyMapPathFix,
  applyProposalMapFix,
  detectPathMismatch,
  extractPathFromDocExcerpt,
  pathFixFromDoc,
  type MapPathFixPatch,
} from '../../../libs/agent/index.js';
import { validateProposal, isValidProposal } from '../../../libs/proposal/validate.js';
import { applyVendorMap } from '../../../libs/vendor-memory/map-engine.js';
import type { Proposal, VendorMap } from '../../../libs/domain/types.js';

const wrongMap = loadFixture<VendorMap>('agent/wrong-path-map.json');
const doc = loadFixtureText('agent/doc-excerpt-events.md');
const patchFixture = loadFixture<MapPathFixPatch>('agent/fix-patch.json');

// 1) Doc excerpt yields correct path
const fromDoc = extractPathFromDocExcerpt(doc);
assertEqual('doc excerpt path is /v1/events', fromDoc, '/v1/events');

// 2) Detect mismatch against wrong map
const det = detectPathMismatch(wrongMap, doc);
assertTrue('path mismatch detected', det.mismatch === true, det.detail);
assertEqual('map had wrong path', det.mapPath, '/v1/wrong/ingest');
assertEqual('suggested path from doc', det.suggestedPath, '/v1/events');

// 3) Auto patch from doc matches fixture
const autoPatch = pathFixFromDoc(wrongMap, doc);
assertTrue('pathFixFromDoc produces patch', autoPatch !== null);
assertEqual('auto patch.to', autoPatch!.to, patchFixture.to);
assertEqual('auto patch.from', autoPatch!.from, patchFixture.from);

// 4) Apply fixture patch
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

// 5) Proposal path: invalid → fix → valid
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

// 6) Dry-run map apply succeeds with corrected path (identity field only)
const wire = applyVendorMap(
  { intent: 'purchase', eventId: 'ord_fix_1', user: { email: 'a@b.com' } },
  fixedProposal.payload as VendorMap,
);
assertTrue('map apply not skipped', !wire.skipped, wire.reason);
assertTrue('event_name Purchase', wire.wire?.event_name === 'Purchase');
assertEqual('event_id mapped', wire.wire?.event_id, 'ord_fix_1');

// Post-fix mismatch should be false
const after = detectPathMismatch(fixedProposal.payload as VendorMap, doc);
assertTrue('no mismatch after fix', after.mismatch === false, after.detail);

console.log('agent-fix-loop-dry-run: all checks passed');
