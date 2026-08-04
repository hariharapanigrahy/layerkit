/**
 * Backward-compatible entry: continuous skill-train loop.
 * Prefer: npm run eval:skill-train
 */
import { runSkillTrain } from '../skill-train/run.js';
import { findRepoRoot } from '../skill-train/load.js';

export function runAgentJudge(repoRoot = findRepoRoot()): number {
  return runSkillTrain(repoRoot);
}

const isMain =
  typeof process.argv[1] === 'string' &&
  (process.argv[1].endsWith('evals/agent-judge/run.js') ||
    process.argv[1].includes('evals/agent-judge/run'));

if (isMain) {
  process.exit(runAgentJudge());
}
