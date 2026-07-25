/**
 * Nightly agent transcript judge entry (NOT merge-bar CI).
 *
 * Loads:
 *   evals/fixtures/agent/sample-transcript.json     → must PASS
 *   evals/fixtures/agent/sample-transcript-bad.json → must FAIL (rubric catches defects)
 *
 * Exit 0 only when pass fixture scores ok and bad fixture scores not-ok.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatScore, scoreTranscript } from './score.js';
import type { AgentTranscript } from './types.js';

function findRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'evals'))) {
      return dir;
    }
    dir = dirname(dir);
  }
  return process.cwd();
}

function loadTranscript(repoRoot: string, rel: string): AgentTranscript {
  const path = join(repoRoot, 'evals', 'fixtures', rel);
  if (!existsSync(path)) {
    throw new Error(`Missing transcript fixture: ${path}`);
  }
  return JSON.parse(readFileSync(path, 'utf8')) as AgentTranscript;
}

export function runAgentJudge(repoRoot = findRepoRoot()): number {
  const good = loadTranscript(repoRoot, 'agent/sample-transcript.json');
  const bad = loadTranscript(repoRoot, 'agent/sample-transcript-bad.json');

  const goodScore = scoreTranscript(good);
  const badScore = scoreTranscript(bad);

  console.log('=== agent-judge: sample-transcript.json (expect PASS) ===');
  console.log(formatScore(goodScore));
  console.log('');
  console.log('=== agent-judge: sample-transcript-bad.json (expect FAIL) ===');
  console.log(formatScore(badScore));
  console.log('');

  let exitCode = 0;
  if (!goodScore.ok) {
    console.error('FAIL: pass-case fixture must score ok (rubric too strict or fixture broken)');
    exitCode = 1;
  }
  if (badScore.ok) {
    console.error('FAIL: bad-case fixture must score not-ok (rubric too weak or fixture incomplete)');
    exitCode = 1;
  }

  // Explicit dimension coverage on the bad fixture: at least one failure in each family ideally,
  // but require that the bad fixture fails for a real rubric reason (already covered by !badScore.ok).
  if (goodScore.ok && !badScore.ok) {
    console.log('eval:agent-judge ok — pass fixture green, bad fixture red (nightly only, not merge bar)');
  }

  return exitCode;
}

/** CLI when executed directly */
const isMain =
  typeof process.argv[1] === 'string' &&
  (process.argv[1].endsWith('evals/agent-judge/run.js') ||
    process.argv[1].endsWith('evals/agent-judge/run.ts') ||
    process.argv[1].includes(`${join('evals', 'agent-judge', 'run')}`));

if (isMain) {
  try {
    process.exit(runAgentJudge());
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
