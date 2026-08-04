/**
 * Legacy re-exports — prefer evals/skill-train/run-score.ts.
 */
export { scoreProcess } from '../skill-train/run-score.js';
export type { AgentTranscript, RubricCheck } from '../skill-train/types.js';

import { scoreProcess } from '../skill-train/run-score.js';
import type { AgentTranscript } from '../skill-train/types.js';

/** @deprecated use scoreProcess from skill-train */
export function scoreTranscript(transcript: AgentTranscript) {
  const s = scoreProcess(transcript);
  return {
    transcriptId: transcript.id,
    ok: s.ok,
    checks: s.checks,
    citationsOk: !s.checks.some((c) => c.id.startsWith('citations:') && !c.ok),
    noInventOk: !s.checks.some((c) => c.id.startsWith('no-invent:') && !c.ok),
    deepenBeforeHumanOk: !s.checks.some(
      (c) => c.id.startsWith('deepen-before-human:') && !c.ok,
    ),
  };
}

export function formatScore(result: {
  ok: boolean;
  checks: Array<{ id: string; ok: boolean; detail?: string }>;
}): string {
  const lines = [`overall=${result.ok ? 'PASS' : 'FAIL'}`];
  for (const c of result.checks) {
    if (c.ok) continue;
    lines.push(`  FAIL ${c.id}${c.detail ? `: ${c.detail}` : ''}`);
  }
  return lines.join('\n');
}
