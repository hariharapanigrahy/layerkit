import { validateProposal } from '../dist/libs/proposal/validate.js';

const bad = validateProposal({
  schemaVersion: 1,
  kind: 'vendor_map',
  id: 'x',
  summary: 'x',
  payload: {},
  sources: [],
  authoredBy: 'agent',
  createdAt: new Date().toISOString(),
  status: 'pending',
});
if (!bad.some((i) => i.code === 'sources')) {
  console.error('expected sources error');
  process.exit(1);
}
console.log('check-proposal-validate: ok');
