/**
 * Gate: agent-no-invent-endpoint
 * Companion to evidence-no-invent: empty seeds → no fake host in answer sheet;
 * hasInventedEndpoint detects fabricated Q2 answers without evidence source.
 */
import { assertTrue } from '../../harness/assert.js';
import {
  createEmptyAnswerSheet,
  fillAnswerSheetFromEvidence,
  hasInventedEndpoint,
  residualGaps,
} from '../../../libs/research/index.js';
import type { AnswerSheet } from '../../../libs/research/types.js';

// --- empty seeds: no invention ---
const empty = fillAnswerSheetFromEvidence([], { vendor: 'acme' });
assertTrue('empty seeds: no invented endpoint', hasInventedEndpoint(empty) === false);
assertTrue('empty Q2 answer empty', empty.dimensions.Q2.answer === '');
assertTrue(
  'empty Q2 source needs-evidence or unanswered',
  empty.dimensions.Q2.source === 'needs-evidence' ||
    empty.dimensions.Q2.source === 'unanswered',
  empty.dimensions.Q2.source,
);

const blob = JSON.stringify(empty);
const bannedHosts = [
  'graph.facebook.com',
  'api.example-vendor.com',
  'api.acme-fixture.test',
  'graph.acme.com',
  'https://',
];
for (const host of bannedHosts) {
  assertTrue(
    `empty sheet has no fabricated host/url fragment: ${host}`,
    !blob.includes(host),
  );
}

const gaps = residualGaps(empty);
assertTrue('residual includes Q2 when empty', gaps.some((g) => g.id === 'Q2'));

// --- invent detector: fabricated Q2 without evidence source ---
const invented: AnswerSheet = createEmptyAnswerSheet('acme');
invented.dimensions.Q2 = {
  id: 'Q2',
  topic: 'Endpoints',
  answer: 'POST https://graph.facebook.com/v19.0/{pixelId}/events',
  source: 'unanswered', // answer present but source not evidence → invented
  confidence: 'none',
  citations: [],
  humanAsked: false,
};
assertTrue(
  'hasInventedEndpoint true for fabricated Q2',
  hasInventedEndpoint(invented) === true,
);

// Evidence-backed answer is not "invented"
const fromCurl: AnswerSheet = createEmptyAnswerSheet('acme');
fromCurl.dimensions.Q2 = {
  id: 'Q2',
  topic: 'Endpoints',
  answer: 'POST https://api.acme-fixture.test/v1/events',
  source: 'curl',
  confidence: 'high',
  citations: [{ excerpt: 'from fixture curl' }],
  humanAsked: false,
};
assertTrue(
  'hasInventedEndpoint false when source is curl',
  hasInventedEndpoint(fromCurl) === false,
);

console.log('agent-no-invent-endpoint: all checks passed');
