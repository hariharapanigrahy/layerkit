/**
 * Gate: processor proposals without sources fail; cited processors pass source gate.
 */
import { assertTrue } from '../../harness/assert.js';
import { validateProposal } from '../../../libs/proposal/validate.js';
import type { Proposal } from '../../../libs/domain/types.js';

const noCite: Proposal = {
  schemaVersion: 1,
  kind: 'processor',
  id: 'proc-bad',
  processorId: 'example.phone.normalize',
  summary: 'phone transform',
  payload: { id: 'example.phone.normalize', kind: 'agent', description: 'x' },
  sources: [],
  authoredBy: 'agent',
  createdAt: new Date().toISOString(),
  status: 'pending',
};

assertTrue(
  'processor without sources fails',
  validateProposal(noCite).some((i) => i.level === 'error' && i.code === 'sources'),
);

const ok: Proposal = {
  ...noCite,
  id: 'proc-good',
  sources: [
    {
      title: 'Example phone docs',
      url: 'https://docs.example.com/api/pii',
      excerpt: 'phone numbers should be digits with country code',
    },
  ],
  payload: {
    id: 'example.phone.normalize',
    kind: 'agent',
    description: 'E.164 then hash',
    sources: [
      {
        title: 'Example phone docs',
        url: 'https://docs.example.com/api/pii',
      },
    ],
  },
};

assertTrue(
  'processor with sources passes source gate',
  validateProposal(ok).filter((i) => i.code === 'sources').length === 0,
);

console.log('processor-citation-required: all checks passed');
