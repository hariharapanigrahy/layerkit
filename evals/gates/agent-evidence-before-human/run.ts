/**
 * Gate: agent-evidence-before-human
 * Given OpenAPI fixture answers Q1/Q2, residual gaps must not include those dims.
 * Process quality: evidence-first before residual human questionnaire.
 */
import { assertEqual, assertTrue } from '../../harness/assert.js';
import { loadFixtureText } from '../../harness/load-fixture.js';
import {
  fillAnswerSheetFromEvidence,
  residualGaps,
} from '../../../libs/research/index.js';

const raw = loadFixtureText('openapi/mini-events.json');
const sheet = fillAnswerSheetFromEvidence(
  [{ kind: 'openapi', urlOrPath: 'openapi/mini-events.json', content: raw }],
  { vendor: 'acme' },
);

const q1 = sheet.dimensions.Q1;
const q2 = sheet.dimensions.Q2;

assertEqual('Q1 source is openapi (answered)', q1.source, 'openapi');
assertEqual('Q2 source is openapi (answered)', q2.source, 'openapi');
assertTrue('Q1 answer non-empty', q1.answer.length > 0, q1.answer);
assertTrue('Q2 answer non-empty', q2.answer.length > 0, q2.answer);
assertTrue('Q1 not human-asked', q1.humanAsked === false);
assertTrue('Q2 not human-asked', q2.humanAsked === false);

const gaps = residualGaps(sheet);
const gapIds = gaps.map((g) => g.id);

assertTrue(
  'residual gaps exclude answered Q1',
  !gapIds.includes('Q1'),
  `gaps=${JSON.stringify(gapIds)}`,
);
assertTrue(
  'residual gaps exclude answered Q2',
  !gapIds.includes('Q2'),
  `gaps=${JSON.stringify(gapIds)}`,
);

// Unanswered dims may still residual-ask (e.g. Q3+)
assertTrue(
  'some residual gaps remain for unanswered dims',
  gaps.length >= 1,
  String(gaps.length),
);
assertTrue(
  'no residual gap claims human already asked for answered openapi dims',
  gaps.every((g) => g.id !== 'Q1' && g.id !== 'Q2'),
);

console.log('agent-evidence-before-human: all checks passed');
