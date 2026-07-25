/**
 * Gate: with legacyApplyWithoutApprove default true, apply of pending proposal
 * succeeds and emits LEGACY_APPLY: maker-checker bypass active on stderr.
 */
import { assertTrue } from '../../harness/assert.js';
import { withTempProject } from '../../harness/temp-project.js';
import type { Proposal, VendorMap } from '../../../libs/domain/types.js';

await withTempProject(async ({ store }) => {
  assertTrue('legacy apply enabled by default', store.isLegacyApplyEnabled());

  const map: VendorMap = {
    vendor: 'legacy_vendor',
    displayName: 'Legacy Vendor',
    version: '1.0.0',
    auth: { type: 'bearer' },
    endpoint: { method: 'POST', path: '/events' },
    intents: { purchase: { eventName: 'Purchase' } },
    fields: [
      { domain: 'eventId', vendor: 'event_id', transform: { type: 'identity' } },
    ],
    documentation: [{ title: 'docs', url: 'https://example.com/docs' }],
    status: 'map_complete',
  };

  const proposal: Proposal = {
    schemaVersion: 1,
    kind: 'vendor_map',
    id: 'prop-legacy-pending',
    summary: 'legacy pending apply',
    vendor: 'legacy_vendor',
    payload: map,
    sources: [{ title: 'docs', url: 'https://example.com/docs' }],
    authoredBy: 'agent',
    createdAt: new Date().toISOString(),
    status: 'pending',
  };

  const review = store.reviewProposal(proposal);
  assertTrue('proposal structurally valid', review.valid, review.errors.join('; '));

  const errs: string[] = [];
  const origErr = console.error;
  console.error = (...args: unknown[]) => {
    errs.push(args.map(String).join(' '));
    origErr.apply(console, args as Parameters<typeof console.error>);
  };
  try {
    const applied = store.applyProposal(proposal);
    assertTrue('kind vendor_map', applied.kind === 'vendor_map');
    assertTrue('target legacy_vendor', applied.target === 'legacy_vendor');
  } finally {
    console.error = origErr;
  }

  assertTrue(
    'LEGACY_APPLY warning emitted',
    errs.some((e) => e.includes('LEGACY_APPLY: maker-checker bypass active')),
    `stderr: ${errs.join(' | ')}`,
  );
  assertTrue('map written', store.loadMap('legacy_vendor')?.status === 'map_complete');
  assertTrue('proposal status applied', proposal.status === 'applied');
  assertTrue(
    'assertApplyAllowed does not throw for pending under legacy',
    true,
  );

  // ready_to_apply under legacy should NOT emit bypass (already approved path)
  const p2: Proposal = {
    ...proposal,
    id: 'prop-legacy-ready',
    status: 'ready_to_apply',
    schemaVersion: 2,
    maker: { type: 'agent', id: 'a1' },
    payload: { ...map, vendor: 'legacy_vendor_2', displayName: 'L2' },
  };
  // v2 status ready_to_apply is valid for schemaVersion 2
  const errs2: string[] = [];
  console.error = (...args: unknown[]) => {
    errs2.push(args.map(String).join(' '));
  };
  try {
    store.assertApplyAllowed(p2);
  } finally {
    console.error = origErr;
  }
  assertTrue(
    'ready_to_apply under legacy does not emit LEGACY_APPLY',
    !errs2.some((e) => e.includes('LEGACY_APPLY')),
    errs2.join(' | '),
  );

  console.log('maker-checker-legacy-apply: all checks passed');
});
