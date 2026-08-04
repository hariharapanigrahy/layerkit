/**
 * CI gate: continuous skill-train loop (skill-text + L0 agent-run judges).
 */
import { assertTrue } from '../../harness/assert.js';
import { loadSkillScenarios } from '../../../evals/skill-train/load.js';
import { formatTrainResult, runTrainLoop } from '../../../evals/skill-train/loop.js';

const repoRoot = process.cwd();
const scenarios = loadSkillScenarios(repoRoot);
assertTrue('curriculum ≥8 scenarios', scenarios.length >= 8);
assertTrue(
  'each scenario has good+bad runs',
  scenarios.every((s) => s.runs.some((r) => r.expectPass) && s.runs.some((r) => !r.expectPass)),
);

const result = runTrainLoop(repoRoot);
console.log(formatTrainResult(result));
assertTrue('skill-train loop green', result.ok, formatTrainResult(result));
assertTrue('all scenarios passed', result.failed === 0);

console.log(`skill-train-loop: ${result.passed}/${result.scenarios.length} scenarios green`);
