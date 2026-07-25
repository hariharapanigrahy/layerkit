/**
 * Gate: research fill path (same libs as CLI) from openapi + curl fixtures.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertEqual, assertTrue } from '../../harness/assert.js';
import {
  deepenFromHubMarkdown,
  fillAnswerSheetFromEvidence,
  hasInventedEndpoint,
  parseCurl,
  parseOpenAPI,
  residualGaps,
  type ResearchSeed,
} from '../../../libs/research/index.js';

const root = process.cwd();
const openapiPath = join(root, 'evals/fixtures/openapi/mini-events.json');
const curlPath = join(root, 'evals/fixtures/curl/meta-purchase.curl.txt');
const hubPath = join(root, 'evals/fixtures/docs/hub-index.md');

const openapiRaw = readFileSync(openapiPath, 'utf8');
const curlRaw = readFileSync(curlPath, 'utf8');
const hubRaw = readFileSync(hubPath, 'utf8');

const oa = parseOpenAPI(openapiRaw);
assertTrue('openapi has operations', oa.operations.length > 0);

const curl = parseCurl(curlRaw);
assertTrue('curl has method', !!curl.method);
assertTrue('curl has host', !!curl.host);

const plan = deepenFromHubMarkdown(hubRaw, hubPath);
assertTrue('deepen enqueues something or marks needsHuman', plan.enqueue.length > 0 || plan.needsHuman);

const seeds: ResearchSeed[] = [
  { kind: 'openapi', urlOrPath: openapiPath, content: openapiRaw },
  { kind: 'curl', command: curlRaw },
  { kind: 'hub_md', path: hubPath, content: hubRaw },
];

const sheet = fillAnswerSheetFromEvidence(seeds, { vendor: 'example_vendor' });
const gaps = residualGaps(sheet);
const invented = hasInventedEndpoint(sheet);

const answered = Object.values(sheet.dimensions).filter(
  (d) => d.answer && d.answer.trim() && d.source !== 'unanswered' && d.source !== 'needs-evidence',
);
assertTrue('at least one dimension answered from evidence', answered.length >= 1);
assertTrue('Q1 or Q2 filled from openapi/curl', !!(sheet.dimensions.Q1?.answer || sheet.dimensions.Q2?.answer));
assertEqual('no invented endpoint flag on fixture evidence', invented, false);
assertTrue('residual gaps is array', Array.isArray(gaps));

console.log('research-cli-fill: all checks passed');
