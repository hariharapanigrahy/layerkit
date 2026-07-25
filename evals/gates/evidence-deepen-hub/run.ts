/**
 * Gate: hub markdown only → deepen planner enqueues openapi before needs-human.
 */
import { assertTrue } from '../../harness/assert.js';
import { loadFixtureText } from '../../harness/load-fixture.js';
import { deepenFromHubMarkdown, planDeepen } from '../../../libs/research/index.js';

const hub = loadFixtureText('docs/hub-index.md');
const plan = deepenFromHubMarkdown(hub, 'docs/hub-index.md');

const openapiItems = plan.enqueue.filter((e) => e.kind === 'openapi');
assertTrue(
  'enqueues openapi path from hub links',
  openapiItems.length >= 1,
  JSON.stringify(plan.enqueue),
);
assertTrue(
  'openapi ref mentions openapi.json',
  openapiItems.some((e) => /openapi\.json/i.test(e.ref)),
  JSON.stringify(openapiItems),
);
assertTrue(
  'does not need human while openapi is enqueued',
  plan.needsHuman === false,
  `needsHuman=${plan.needsHuman}`,
);

// openapi should appear before human residual in deepen log
const openapiLogIdx = plan.deepenLog.findIndex(
  (e) => e.action.includes('openapi') || (e.enqueued ?? []).some((r) => /openapi/i.test(r)),
);
const humanLogIdx = plan.deepenLog.findIndex((e) => e.action.includes('needs_human'));
assertTrue(
  'openapi deepen step logged before needs_human (or no needs_human)',
  humanLogIdx === -1 || (openapiLogIdx >= 0 && openapiLogIdx < humanLogIdx),
  JSON.stringify(plan.deepenLog.map((e) => e.action)),
);

// same via planDeepen seeds API
const plan2 = planDeepen([{ kind: 'hub_md', path: 'hub-index.md', content: hub }]);
assertTrue(
  'planDeepen also enqueues openapi',
  plan2.enqueue.some((e) => e.kind === 'openapi'),
  JSON.stringify(plan2.enqueue),
);

console.log('evidence-deepen-hub: all checks passed');
