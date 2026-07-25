/**
 * Gate: INTEGRATION_PIPELINE has discover → research → design → author → privacy → generate → handoff
 * (key skill names present in order). Also covers getNextStep / formatPipelineStatus / mark-done markers.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertEqual, assertTrue } from '../../harness/assert.js';
import {
  INTEGRATION_PIPELINE,
  formatNextStepLine,
  formatPipelineStatus,
  getNextStep,
  isPipelineStepId,
  loadCompletedSteps,
  markStepDone,
  pipelineStatusPath,
} from '../../../libs/agent/index.js';

/** Required key names in pipeline order (id or skill must contain the key). */
const REQUIRED_ORDER = [
  'discover',
  'research',
  'design',
  'author',
  'privacy',
  'generate',
  'handoff',
] as const;

// --- order: each key appears, and indices are strictly increasing ---
let lastIdx = -1;
for (const key of REQUIRED_ORDER) {
  const idx = INTEGRATION_PIPELINE.findIndex(
    (s) => s.id === key || s.id.includes(key) || s.skill.includes(key),
  );
  assertTrue(`${key} present in INTEGRATION_PIPELINE`, idx >= 0, JSON.stringify(INTEGRATION_PIPELINE));
  assertTrue(
    `${key} appears after previous keys (idx ${idx} > ${lastIdx})`,
    idx > lastIdx,
    `order violation at ${key}: idx=${idx}, last=${lastIdx}`,
  );
  lastIdx = idx;
}

assertTrue(
  'pipeline has at least 7 steps',
  INTEGRATION_PIPELINE.length >= REQUIRED_ORDER.length,
);

// --- every step has skill + non-empty cliHints (agent next / orchestrate skill) ---
for (const step of INTEGRATION_PIPELINE) {
  assertTrue(
    `${step.id}: skill non-empty`,
    typeof step.skill === 'string' && step.skill.trim().length > 0,
  );
  assertTrue(
    `${step.id}: cliHints non-empty`,
    Array.isArray(step.cliHints) &&
      step.cliHints.length > 0 &&
      step.cliHints.every((h) => typeof h === 'string' && h.trim().length > 0),
    JSON.stringify(step.cliHints),
  );
}

// --- getNextStep ---
assertEqual('empty completed → discover', getNextStep([])?.id, 'discover');
assertEqual(
  'after discover → research',
  getNextStep(['discover'])?.id,
  'research',
);
assertEqual(
  'after research → design',
  getNextStep(['discover', 'research'])?.id,
  'design',
);
assertEqual(
  'after design → author',
  getNextStep(['discover', 'research', 'design'])?.id,
  'author',
);
assertEqual(
  'after author → privacy',
  getNextStep(['discover', 'research', 'design', 'author'])?.id,
  'privacy',
);
assertEqual(
  'after privacy → generate',
  getNextStep(['discover', 'research', 'design', 'author', 'privacy'])?.id,
  'generate',
);
assertEqual(
  'after generate → handoff',
  getNextStep(['discover', 'research', 'design', 'author', 'privacy', 'generate'])?.id,
  'handoff',
);
assertEqual(
  'all done → null',
  getNextStep([...REQUIRED_ORDER]),
  null,
);

// Unknown / out-of-order completed ids do not skip valid next
assertEqual(
  'unknown completed id ignored for next',
  getNextStep(['not-a-real-step'])?.id,
  'discover',
);

// --- formatPipelineStatus / formatNextStepLine ---
const emptyStatus = formatPipelineStatus([]);
assertTrue('status header', emptyStatus.includes('Integration pipeline:'));
assertTrue('status marks discover next', /\[ \]\s+discover.*← next/.test(emptyStatus), emptyStatus);
assertTrue('status lists research', emptyStatus.includes('research'));
assertTrue('status lists handoff', emptyStatus.includes('handoff'));

const midStatus = formatPipelineStatus(['discover', 'research']);
assertTrue('mid status next design', midStatus.includes('Next: design'), midStatus);
assertTrue(
  'mid status discover checked',
  /\[x\]\s+discover/.test(midStatus),
  midStatus,
);

const doneStatus = formatPipelineStatus([...REQUIRED_ORDER]);
assertTrue('done status complete', doneStatus.includes('pipeline complete'), doneStatus);

assertTrue(
  'formatNextStepLine empty',
  formatNextStepLine([]).includes('discover'),
  formatNextStepLine([]),
);
assertTrue(
  'formatNextStepLine complete',
  formatNextStepLine([...REQUIRED_ORDER]).includes('pipeline complete'),
);

// --- step id validation ---
assertTrue('discover is valid id', isPipelineStepId('discover'));
assertTrue('bogus id rejected', !isPipelineStepId('bogus-step'));

// --- memory markers: markStepDone + loadCompletedSteps ---
const root = mkdtempSync(join(tmpdir(), 'layerkit-agent-pipe-'));
const projectDir = join(root, '.layerkit');
try {
  assertEqual('no markers initially', loadCompletedSteps(projectDir).length, 0);

  const path1 = markStepDone(projectDir, 'discover');
  assertTrue('marker file created', existsSync(path1));
  assertEqual('status path matches', path1, pipelineStatusPath(projectDir));

  const loaded1 = loadCompletedSteps(projectDir);
  assertEqual('one completed', loaded1.length, 1);
  assertEqual('completed is discover', loaded1[0], 'discover');

  const body1 = readFileSync(path1, 'utf8');
  assertTrue('marker has [x] discover', /- \[x\] discover/.test(body1), body1);

  markStepDone(projectDir, 'research');
  const loaded2 = loadCompletedSteps(projectDir);
  assertTrue('two completed', loaded2.includes('discover') && loaded2.includes('research'));

  // Idempotent mark
  markStepDone(projectDir, 'discover');
  assertEqual(
    'idempotent mark keeps two',
    loadCompletedSteps(projectDir).filter((id) => id === 'discover').length,
    1,
  );

  // getNextStep from disk markers
  const fromDisk = loadCompletedSteps(projectDir);
  assertEqual('next from disk is design', getNextStep(fromDisk)?.id, 'design');

  let threw = false;
  try {
    markStepDone(projectDir, 'not-a-step');
  } catch {
    threw = true;
  }
  assertTrue('unknown step throws', threw);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log('agent-pipeline-order: all checks passed');
