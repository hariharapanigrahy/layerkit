/**
 * Continuous skill-training entrypoint (TDD).
 *
 *   npm run eval:skill-train
 *   node dist/evals/skill-train/run.js --only=<scenario-id>
 *
 * Expect RED when adding hard scenarios; fix skills/rails; re-run.
 * Do not expand by package name lists — that is bloat, not TDD.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findRepoRoot } from './load.js';
import { formatTrainResult, runTrainLoop } from './loop.js';
import { scoreProcess } from './run-score.js';
import type { AgentTranscript } from './types.js';

function loadSample(repoRoot: string, name: string): AgentTranscript {
  const path = join(repoRoot, 'evals', 'fixtures', 'agent', name);
  if (!existsSync(path)) throw new Error(`missing ${path}`);
  return JSON.parse(readFileSync(path, 'utf8')) as AgentTranscript;
}

export function runSkillTrain(repoRoot = findRepoRoot(), argv = process.argv.slice(2)): number {
  const onlyArg = argv.find((a) => a.startsWith('--only='));
  const onlyIds = onlyArg
    ? onlyArg
        .slice('--only='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  const good = scoreProcess(loadSample(repoRoot, 'sample-transcript.json'));
  const bad = scoreProcess(loadSample(repoRoot, 'sample-transcript-bad.json'));
  if (!good.ok) {
    console.error('FAIL: sample-transcript.json must PASS process rubric');
    return 1;
  }
  if (bad.ok) {
    console.error('FAIL: sample-transcript-bad.json must FAIL process rubric');
    return 1;
  }
  console.log('process fixtures: good PASS, bad FAIL');

  const result = runTrainLoop(repoRoot, { onlyIds });
  console.log(formatTrainResult(result));

  if (result.ok) {
    console.log('eval:skill-train ok — curriculum green (only after reds were fixed)');
  } else {
    console.error(
      'eval:skill-train FAIL (expected in TDD red) — fix SKILL.md / rails / fixtures',
    );
  }
  return result.ok ? 0 : 1;
}

const isMain =
  typeof process.argv[1] === 'string' &&
  (process.argv[1].endsWith('evals/skill-train/run.js') ||
    process.argv[1].endsWith('evals/skill-train/run.ts') ||
    process.argv[1].includes(`${join('evals', 'skill-train', 'run')}`));

if (isMain) {
  try {
    process.exit(runSkillTrain());
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
