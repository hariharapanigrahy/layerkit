/**
 * Gate: field_row kind merges (upserts) into map.fields by domain+vendor path.
 * Also smoke-tests intent_wire and auth apply kinds.
 */
import { assertEqual, assertTrue } from '../../harness/assert.js';
import { withTempProject } from '../../harness/temp-project.js';
import type { Proposal, VendorMap } from '../../../libs/domain/types.js';

await withTempProject(async ({ store }) => {
  // Enable legacy apply so pending proposals can apply without full maker-checker path
  const project = store.loadProject()!;
  project.makerChecker = { ...project.makerChecker, legacyApplyWithoutApprove: true };
  store.saveProject(project);

  const base: VendorMap = {
    vendor: 'acme',
    displayName: 'Acme',
    version: '1.0.0',
    auth: { type: 'bearer', notes: 'old' },
    endpoint: { method: 'POST', path: '/v1/events' },
    intents: { purchase: { eventName: 'Purchase' } },
    fields: [
      { domain: 'eventId', vendor: 'event_id', transform: { type: 'identity' } },
    ],
    documentation: [{ title: 'docs', url: 'https://example.com/acme' }],
    status: 'map_complete',
  };
  store.saveMap(base);

  // field_row upsert new
  const fieldRow: Proposal = {
    schemaVersion: 1,
    kind: 'field_row',
    id: 'prop-field-1',
    summary: 'add email field',
    vendor: 'acme',
    payload: {
      domain: 'user.email',
      vendor: 'user_data.em',
      transform: { type: 'identity' },
    },
    sources: [{ title: 'docs', url: 'https://example.com/acme' }],
    authoredBy: 'agent',
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  store.applyProposal(fieldRow);
  let map = store.loadMap('acme')!;
  assertTrue(
    'field_row added user.email',
    map.fields.some((f) => f.domain === 'user.email' && f.vendor === 'user_data.em'),
  );
  assertEqual('still has eventId', map.fields.filter((f) => f.domain === 'eventId').length, 1);

  // field_row upsert existing (replace transform)
  const fieldRowUpdate: Proposal = {
    ...fieldRow,
    id: 'prop-field-2',
    payload: {
      domain: 'user.email',
      vendor: 'user_data.em',
      transform: { type: 'constant', value: 'redacted@example.com' },
    },
    status: 'pending',
  };
  store.applyProposal(fieldRowUpdate);
  map = store.loadMap('acme')!;
  const email = map.fields.find((f) => f.domain === 'user.email')!;
  assertEqual('field_row upserted transform', email.transform.type, 'constant');
  assertEqual(
    'still one email row',
    map.fields.filter((f) => f.domain === 'user.email').length,
    1,
  );

  // intent_wire
  const intent: Proposal = {
    schemaVersion: 1,
    kind: 'intent_wire',
    id: 'prop-intent-1',
    summary: 'add lead intent',
    vendor: 'acme',
    payload: { intent: 'lead', eventName: 'Lead' },
    sources: [{ title: 'docs', url: 'https://example.com/acme' }],
    authoredBy: 'agent',
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  store.applyProposal(intent);
  map = store.loadMap('acme')!;
  assertTrue('intent_wire added lead', (map.intents as Record<string, { eventName?: string }>).lead?.eventName === 'Lead');
  assertTrue(
    'purchase intact',
    (map.intents as Record<string, { eventName?: string }>).purchase?.eventName === 'Purchase',
  );

  // auth replace
  const auth: Proposal = {
    schemaVersion: 1,
    kind: 'auth',
    id: 'prop-auth-1',
    summary: 'rotate auth',
    vendor: 'acme',
    payload: { type: 'api_key', name: 'X-Api-Key', in: 'header' },
    sources: [{ title: 'docs', url: 'https://example.com/acme' }],
    authoredBy: 'agent',
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  store.applyProposal(auth);
  map = store.loadMap('acme')!;
  assertEqual('auth type api_key', map.auth.type, 'api_key');

  console.log('apply-kind-field-row: all checks passed');
});
