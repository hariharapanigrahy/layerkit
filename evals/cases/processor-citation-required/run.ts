import { assertTrue } from '../../lib/common.js';
import { validateProposal } from '../../../libs/proposal/validate.js';
import type { Proposal } from '../../../libs/domain/types.js';

const noCite: Proposal = {
  schemaVersion: 1,
  kind: 'processor',
  id: 'proc-bad',
  processorId: 'meta.phone.x',
  summary: 'phone transform',
  payload: { id: 'meta.phone.x', kind: 'agent', description: 'x' },
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
      title: 'Meta phone',
      url: 'https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters',
      excerpt: 'phone numbers should be digits with country code',
    },
  ],
  payload: {
    id: 'meta.phone.x',
    kind: 'agent',
    description: 'E.164 then hash',
    sources: [
      {
        title: 'Meta phone',
        url: 'https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters',
      },
    ],
  },
};

assertTrue(
  'processor with sources passes source gate',
  validateProposal(ok).filter((i) => i.code === 'sources').length === 0,
);

console.log('processor-citation-required: all checks passed');
