/**
 * Gate: default strict maker-checker (legacyApplyWithoutApprove=false) →
 * apply pending fails; submit → validate → approve → apply succeeds.
 * Also: self-approve denied when requireDistinctChecker.
 */
import { assertThrows, assertTrue } from '../../harness/assert.js';
import { withTempProject } from '../../harness/temp-project.js';
import type { Proposal, VendorMap } from '../../../libs/domain/types.js';

await withTempProject(async ({ store }) => {
  // Default is strict (legacyApplyWithoutApprove=false). Set reviewers + distinct checker.
  const project = store.loadProject()!;
  project.makerChecker = {
    // explicit false documents intent; also matches DEFAULT_MAKER_CHECKER
    legacyApplyWithoutApprove: false,
    requireDistinctChecker: true,
    allowSelfApprove: false,
    requirePrivacyReviewForPii: true,
  };
  project.security = {
    reviewers: [
      // maker also listed so self-approve is role-granted but still denied by distinct check
      { id: 'maker-bot', roles: ['checker'] },
      { id: 'alice@co.com', roles: ['checker', 'admin'] },
      { id: 'privacy@co.com', roles: ['privacy_reviewer'] },
    ],
  };
  store.saveProject(project);

  assertTrue(
    'legacy apply disabled by default / config',
    !store.isLegacyApplyEnabled(),
  );

  // Doctor should report STRICT mode clearly
  const doc = store.doctor();
  assertTrue(
    'doctor prints STRICT makerChecker mode',
    doc.lines.some((l) => l.includes('mode=STRICT') || l.includes('STRICT (requires ready_to_apply)')),
    doc.lines.join('\n'),
  );
  assertTrue(
    'doctor prints legacyApplyWithoutApprove=false',
    doc.lines.some((l) => l.includes('legacyApplyWithoutApprove=false')),
    doc.lines.join('\n'),
  );

  const map: VendorMap = {
    vendor: 'strict_vendor',
    displayName: 'Strict Vendor',
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

  const draft: Proposal = {
    schemaVersion: 2,
    kind: 'vendor_map',
    id: 'prop-strict-1',
    summary: 'strict path map',
    vendor: 'strict_vendor',
    payload: map,
    sources: [{ title: 'docs', url: 'https://example.com/docs' }],
    authoredBy: 'agent',
    createdAt: new Date().toISOString(),
    status: 'draft',
    maker: { type: 'agent', id: 'maker-bot' },
    requiresPrivacyReview: false,
    checks: [],
  };

  // 1) Apply pending without approve must fail under strict
  const pending: Proposal = { ...draft, status: 'pending' };
  assertThrows(
    'strict apply pending throws',
    () => store.applyProposal({ ...pending }),
  );

  // 2) Full path: submit → validate → approve → apply
  const submitted = store.submitProposal(draft, draft.maker);
  assertTrue('submit → pending', submitted.status === 'pending');

  const review = store.reviewProposal(submitted);
  assertTrue('structurally valid', review.valid, review.errors.join('; '));
  submitted.status = 'validated';
  store.saveProposal(submitted);

  // Self-approve denied
  assertThrows('self-approve denied', () =>
    store.approveProposal(submitted.id, {
      by: { type: 'agent', id: 'maker-bot' },
      role: 'checker',
    }),
  );

  const approved = store.approveProposal(submitted.id, {
    by: { type: 'user', id: 'alice@co.com' },
    role: 'checker',
    comment: 'looks good',
  });
  assertTrue(
    'approve → ready_to_apply',
    approved.status === 'ready_to_apply',
    `got ${approved.status}`,
  );
  assertTrue(
    'check recorded',
    (approved.checks ?? []).some((c) => c.decision === 'approve' && c.by.id === 'alice@co.com'),
  );

  const applied = store.applyProposal(approved);
  assertTrue('applied kind', applied.kind === 'vendor_map');
  assertTrue('map present', store.loadMap('strict_vendor')?.vendor === 'strict_vendor');
  assertTrue('status applied', store.loadProposal('prop-strict-1')?.status === 'applied');

  // Reject path
  const draft2: Proposal = {
    ...draft,
    id: 'prop-strict-reject',
    status: 'draft',
  };
  store.submitProposal(draft2);
  const p2 = store.loadProposal('prop-strict-reject')!;
  p2.status = 'validated';
  store.saveProposal(p2);
  const rejected = store.rejectProposal('prop-strict-reject', {
    by: { type: 'user', id: 'alice@co.com' },
    role: 'checker',
    comment: 'nope',
  });
  assertTrue('rejected', rejected.status === 'rejected');

  console.log('maker-checker-strict-path: all checks passed');
});
