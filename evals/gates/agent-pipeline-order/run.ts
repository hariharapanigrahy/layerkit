/**
 * Gate: INTEGRATION_PIPELINE has discover → surfaces → research → design → author → privacy
 * → deletion-first → source-edit → handoff
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
  getNextStepForProject,
  isPipelineStepId,
  loadCompletedSteps,
  loadPipelineMode,
  markStepDone,
  pipelineStatusPath,
  setPipelineMode,
} from '../../../libs/agent/index.js';

/** Required key names in pipeline order (id or skill must contain the key). */
const REQUIRED_ORDER = [
  'discover',
  'surfaces',
  'research',
  'design',
  'author',
  'privacy',
  'deletion-first',
  'source-edit',
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
  'pipeline has at least required steps',
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
assertEqual('after discover → surfaces', getNextStep(['discover'])?.id, 'surfaces');
assertEqual(
  'after surfaces → research',
  getNextStep(['discover', 'surfaces'])?.id,
  'research',
);
assertEqual(
  'after research → design',
  getNextStep(['discover', 'surfaces', 'research'])?.id,
  'design',
);
assertEqual(
  'after design → author',
  getNextStep(['discover', 'surfaces', 'research', 'design'])?.id,
  'author',
);
assertEqual(
  'after author → privacy',
  getNextStep(['discover', 'surfaces', 'research', 'design', 'author'])?.id,
  'privacy',
);
assertEqual(
  'after privacy → deletion-first',
  getNextStep(['discover', 'surfaces', 'research', 'design', 'author', 'privacy'])?.id,
  'deletion-first',
);
assertEqual(
  'after deletion-first → source-edit',
  getNextStep([
    'discover',
    'surfaces',
    'research',
    'design',
    'author',
    'privacy',
    'deletion-first',
  ])?.id,
  'source-edit',
);
assertEqual(
  'after source-edit → handoff',
  getNextStep([
    'discover',
    'surfaces',
    'research',
    'design',
    'author',
    'privacy',
    'deletion-first',
    'source-edit',
  ])?.id,
  'handoff',
);
assertEqual('all done → null', getNextStep([...REQUIRED_ORDER]), null);

// heal: discover auto-complete → next is surfaces (not research)
{
  const dir = mkdtempSync(join(tmpdir(), 'lk-pipe-heal-'));
  try {
    setPipelineMode(dir, 'heal', { vendor: 'acme' });
    assertEqual('heal mode loaded', loadPipelineMode(dir), 'heal');
    assertEqual(
      'heal next after start → surfaces (discover skipped)',
      getNextStepForProject(dir)?.id,
      'surfaces',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// --- formatPipelineStatus / formatNextStepLine / markStepDone (smoke) ---
const midStatus = formatPipelineStatus(['discover', 'surfaces', 'research']);
assertTrue('status lists mode', /mode:/i.test(midStatus));
assertTrue('status lists research done', /\[x\].*research/i.test(midStatus));

assertTrue(
  'next line mentions surfaces after discover only',
  /surfaces/i.test(formatNextStepLine(['discover'])),
);

assertTrue('isPipelineStepId surfaces', isPipelineStepId('surfaces'));
assertTrue('isPipelineStepId reject junk', !isPipelineStepId('not-a-step'));

// mark-done markers
{
  const dir = mkdtempSync(join(tmpdir(), 'lk-pipe-mark-'));
  try {
    setPipelineMode(dir, 'full', { vendor: 'v' });
    const p = pipelineStatusPath(dir);
    assertTrue('status path under memory', p.includes('pipeline-status'));
    markStepDone(dir, 'discover', ['ev1.md']);
    const loaded = loadCompletedSteps(dir);
    assertTrue('discover completed', loaded.includes('discover'));
    markStepDone(dir, 'surfaces', ['ev2.md']);
    const loaded2 = loadCompletedSteps(dir);
    assertTrue(
      'two completed',
      loaded2.includes('discover') && loaded2.includes('surfaces'),
    );
    assertTrue('status file exists', existsSync(p));
    assertTrue(
      'status body has markers',
      /\[x\].*discover/i.test(readFileSync(p, 'utf8')),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('agent-pipeline-order: all checks passed');
