/**
 * Gate: parse mini OpenAPI → Q1/Q2 filled, source: openapi, not human-asked.
 */
import { assertEqual, assertTrue } from '../../harness/assert.js';
import { loadFixtureText } from '../../harness/load-fixture.js';
import {
  fillAnswerSheetFromEvidence,
  parseOpenAPI,
} from '../../../libs/research/index.js';

const raw = loadFixtureText('openapi/mini-events.json');
const parsed = parseOpenAPI(raw);

assertTrue('openapi has bearer security scheme', parsed.securitySchemes.some((s) => s.scheme === 'bearer'));
assertTrue('openapi has POST /events', parsed.operations.some((o) => o.method === 'POST' && o.path === '/events'));

const sheet = fillAnswerSheetFromEvidence(
  [{ kind: 'openapi', urlOrPath: 'openapi/mini-events.json', content: raw }],
  { vendor: 'example' },
);

const q1 = sheet.dimensions.Q1;
const q2 = sheet.dimensions.Q2;

assertEqual('Q1 source is openapi', q1.source, 'openapi');
assertTrue('Q1 answer non-empty', q1.answer.length > 0, q1.answer);
assertTrue('Q1 not human-asked', q1.humanAsked === false);
assertTrue('Q1 mentions bearer or auth', /bearer|http/i.test(q1.answer));

assertEqual('Q2 source is openapi', q2.source, 'openapi');
assertTrue('Q2 answer non-empty', q2.answer.length > 0, q2.answer);
assertTrue('Q2 not human-asked', q2.humanAsked === false);
assertTrue('Q2 mentions /events', /\/events/i.test(q2.answer));

console.log('evidence-openapi-q1q2: all checks passed');
