/**
 * Gate: empty seeds → dimensions unanswered/needs-evidence; no fabricated endpoint.
 */
import { assertTrue } from '../../harness/assert.js';
import {
  fillAnswerSheetFromEvidence,
  hasInventedEndpoint,
  residualGaps,
} from '../../../libs/research/index.js';

const sheet = fillAnswerSheetFromEvidence([], { vendor: 'unknown' });

const q1 = sheet.dimensions.Q1;
const q2 = sheet.dimensions.Q2;

assertTrue(
  'Q1 is unanswered or needs-evidence',
  q1.source === 'unanswered' || q1.source === 'needs-evidence',
  q1.source,
);
assertTrue(
  'Q2 is unanswered or needs-evidence',
  q2.source === 'unanswered' || q2.source === 'needs-evidence',
  q2.source,
);
assertTrue('Q1 answer empty (no invent)', q1.answer === '', q1.answer);
assertTrue('Q2 answer empty (no invent)', q2.answer === '', q2.answer);
assertTrue('Q1 not human-asked by default', q1.humanAsked === false);
assertTrue('no invented endpoint', hasInventedEndpoint(sheet) === false);

const gaps = residualGaps(sheet);
assertTrue('residual gaps include Q1', gaps.some((g) => g.id === 'Q1'));
assertTrue('residual gaps include Q2', gaps.some((g) => g.id === 'Q2'));
assertTrue('at least 10 residual gaps for empty seeds', gaps.length >= 10, String(gaps.length));

// Ensure we did not fabricate a plausible-looking endpoint string anywhere
const blob = JSON.stringify(sheet);
assertTrue(
  'sheet JSON has no fake graph.facebook host',
  !blob.includes('graph.facebook.com'),
);
assertTrue(
  'sheet JSON has no fake api.example host',
  !blob.includes('api.example-vendor.com'),
);

console.log('evidence-no-invent: all checks passed');
