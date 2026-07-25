/**
 * Gate: proposals without documentation sources must fail validation.
 */
import { assertTrue } from '../../harness/assert.js';
import { validateProposal } from '../../../libs/proposal/validate.js';
import type { Proposal } from '../../../libs/domain/types.js';

const base: Proposal = {
  schemaVersion: 1,
  kind: 'vendor_map',
  id: 'eval-no-sources',
  summary: 'bad proposal',
  payload: {
    vendor: 'example_vendor',
    displayName: 'Meta',
    version: '1',
    auth: { type: 'bearer' },
    endpoint: { method: 'POST', path: '/events', baseUrl: 'https://example.com' },
    intents: { purchase: { eventName: 'Purchase' } },
    fields: [{ domain: 'eventId', vendor: 'event_id', transform: { type: 'identity' } }],
    documentation: [],
  },
  sources: [],
  authoredBy: 'agent',
  createdAt: new Date().toISOString(),
  status: 'pending',
};

const bad = validateProposal(base);
assertTrue(
  'rejects empty sources',
  bad.some((i) => i.code === 'sources' && i.level === 'error'),
);

const good: Proposal = {
  ...base,
  id: 'eval-with-sources',
  sources: [
    {
      title: 'Example API',
      url: 'https://docs.example.com/api/events',
      excerpt: 'event_name is required',
    },
  ],
  payload: {
    ...(base.payload as object),
    documentation: [
      {
        title: 'Example API',
        url: 'https://docs.example.com/api/events',
      },
    ],
  },
};

const ok = validateProposal(good);
assertTrue(
  'accepts cited proposal',
  ok.filter((i) => i.level === 'error').length === 0,
  ok.map((i) => i.message).join('; '),
);

console.log('proposal-sources-required: all checks passed');
