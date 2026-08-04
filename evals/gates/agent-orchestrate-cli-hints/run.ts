/**
 * Gate: agent-orchestrate-cli-hints
 * Every INTEGRATION_PIPELINE step must have a non-empty skill field and
 * non-empty cliHints[] so `layerkit agent next` can print exact CLI commands.
 */
import { assertEqual, assertTrue } from '../../harness/assert.js';
import {
  INTEGRATION_PIPELINE,
  formatPipelineStatus,
  getNextStep,
  type PipelineStep,
} from '../../../libs/agent/index.js';

assertTrue(
  'INTEGRATION_PIPELINE is non-empty',
  INTEGRATION_PIPELINE.length > 0,
);

const seenIds = new Set<string>();

for (const step of INTEGRATION_PIPELINE) {
  const label = step.id || '(missing-id)';

  assertTrue(`${label}: id non-empty`, typeof step.id === 'string' && step.id.trim().length > 0);
  assertTrue(
    `${label}: skill non-empty`,
    typeof step.skill === 'string' && step.skill.trim().length > 0,
    JSON.stringify(step),
  );
  assertTrue(
    `${label}: cliHints is array`,
    Array.isArray(step.cliHints),
    JSON.stringify(step),
  );
  assertTrue(
    `${label}: cliHints non-empty`,
    step.cliHints.length > 0,
    JSON.stringify(step),
  );

  for (let i = 0; i < step.cliHints.length; i++) {
    const h = step.cliHints[i];
    assertTrue(
      `${label}: cliHints[${i}] non-empty string`,
      typeof h === 'string' && h.trim().length > 0,
      JSON.stringify(step.cliHints),
    );
  }

  assertTrue(
    `${label}: doneWhen non-empty`,
    typeof step.doneWhen === 'string' && step.doneWhen.trim().length > 0,
  );

  assertTrue(`${label}: unique id`, !seenIds.has(step.id), `duplicate id ${step.id}`);
  seenIds.add(step.id);
}

// agent next surface: first step must expose skill + every cliHint in status formatting
const first = getNextStep([]) as PipelineStep;
assertTrue('first step exists', first != null);
assertEqual('first step is discover', first.id, 'discover');

const status = formatPipelineStatus([]);
assertTrue(
  'status includes first skill',
  status.includes(first.skill),
  status,
);
for (const h of first.cliHints) {
  assertTrue(
    `status includes first cliHint: ${h}`,
    status.includes(h),
    status,
  );
}

// Mid-pipeline next step also has hints (surfaces after discover)
const surfaces = getNextStep(['discover']) as PipelineStep;
assertEqual('after discover → surfaces', surfaces?.id, 'surfaces');
assertTrue('surfaces skill non-empty', surfaces.skill.trim().length > 0);
assertTrue('surfaces cliHints non-empty', surfaces.cliHints.length > 0);

const midStatus = formatPipelineStatus(['discover']);
assertTrue('mid status Next: surfaces', midStatus.includes('Next: surfaces'), midStatus);
assertTrue(
  'mid status includes surfaces skill',
  midStatus.includes(surfaces.skill),
  midStatus,
);
for (const h of surfaces.cliHints) {
  assertTrue(`mid status includes surfaces cliHint: ${h}`, midStatus.includes(h), midStatus);
}

// Count invariant: every known pipeline id covered
const expectedIds = [
  'discover',
  'surfaces',
  'research',
  'design',
  'author',
  'privacy',
  'source-edit',
  'handoff',
];
for (const id of expectedIds) {
  assertTrue(
    `pipeline includes ${id}`,
    INTEGRATION_PIPELINE.some((s) => s.id === id),
  );
}

console.log('agent-orchestrate-cli-hints: all checks passed');
