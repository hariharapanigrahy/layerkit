/**
 * Gate: agent-orchestrate-checklist
 * Fixture checklist must list REQUIRED_SKILL_PIPELINE skills in order.
 * Source of truth: libs/agent/checklist.ts (shared with skills/evals).
 */
import { assertEqual, assertTrue } from '../../harness/assert.js';
import { loadFixture } from '../../harness/load-fixture.js';
import {
  REQUIRED_SKILL_PIPELINE,
  assertChecklistCompleteness,
  type OrchestrateChecklist,
} from '../../../libs/agent/index.js';
import { SKILL_NAMES } from '../../../libs/install/skills.js';

const checklist = loadFixture<OrchestrateChecklist>('agent/orchestrate-checklist.json');

assertTrue('checklist has id', typeof checklist.id === 'string' && checklist.id.length > 0);
assertTrue(
  'checklist has skills array',
  Array.isArray(checklist.skills) && checklist.skills.length > 0,
);

const result = assertChecklistCompleteness(checklist);
assertTrue(
  'checklist complete vs REQUIRED_SKILL_PIPELINE',
  result.ok,
  `missing=${result.missing.join(',')} orderErrors=${result.orderErrors.join('; ')}`,
);
assertEqual('no missing skills', result.missing.length, 0);
assertEqual('no order errors', result.orderErrors.length, 0);

// Exact order match for required prefix pipeline
assertEqual(
  'fixture skills equal REQUIRED_SKILL_PIPELINE',
  checklist.skills,
  [...REQUIRED_SKILL_PIPELINE],
);

// Every required skill is a packaged skill name
for (const skill of REQUIRED_SKILL_PIPELINE) {
  assertTrue(
    `pipeline skill packaged: ${skill}`,
    (SKILL_NAMES as readonly string[]).includes(skill),
  );
}

// Evidence-first relative order invariants
const idx = (id: string) => checklist.skills.indexOf(id);
assertTrue(
  'bootstrap before discover',
  idx('layerkit-bootstrap') < idx('layerkit-discover-data-layer'),
);
assertTrue(
  'discover before research',
  idx('layerkit-discover-data-layer') < idx('layerkit-research-vendor'),
);
assertTrue(
  'research before source-edit-client',
  idx('layerkit-research-vendor') < idx('layerkit-source-edit-client'),
);
assertTrue(
  'privacy before source-edit-client',
  idx('layerkit-privacy-review') < idx('layerkit-source-edit-client'),
);
assertTrue(
  'deletion-first before source-edit-client',
  idx('layerkit-deletion-first') < idx('layerkit-source-edit-client'),
);
assertTrue(
  'source-edit-client before checker-assist',
  idx('layerkit-source-edit-client') < idx('layerkit-checker-assist'),
);

// Incomplete checklist fails helper
const incomplete = assertChecklistCompleteness({
  id: 'bad',
  title: 'bad',
  skills: ['layerkit-bootstrap', 'layerkit-source-edit-client'],
});
assertTrue('incomplete not ok', incomplete.ok === false);
assertTrue(
  'incomplete reports missing research',
  incomplete.missing.includes('layerkit-research-vendor'),
  JSON.stringify(incomplete.missing),
);

// Wrong order fails
const wrongOrder = assertChecklistCompleteness({
  id: 'bad-order',
  title: 'bad order',
  skills: [
    'layerkit-source-edit-client',
    'layerkit-bootstrap',
    'layerkit-discover-data-layer',
    'layerkit-research-vendor',
    'layerkit-author-processor',
    'layerkit-design-flow',
    'layerkit-privacy-review',
    'layerkit-deletion-first',
    'layerkit-checker-assist',
  ],
});
assertTrue('wrong order not ok', wrongOrder.ok === false);
assertTrue(
  'wrong order has orderErrors',
  wrongOrder.orderErrors.length > 0,
  JSON.stringify(wrongOrder.orderErrors),
);

console.log('agent-orchestrate-checklist: all checks passed');
