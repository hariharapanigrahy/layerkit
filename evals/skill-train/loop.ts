/**
 * Layer D: continuous training loop (TDD).
 * Red scenarios are the point — fix skills/rails until green, then add harder reds.
 */
import { scoreSkillText } from './skill-text.js';
import { scoreAgentRun } from './run-score.js';
import { findRepoRoot, loadSkillScenarios } from './load.js';
import type { ScenarioTrainResult, SkillScenario, TrainLoopResult } from './types.js';

export function trainScenario(
  repoRoot: string,
  scenario: SkillScenario,
): ScenarioTrainResult {
  const skillText = scoreSkillText(repoRoot, scenario);
  const runs = scenario.runs.map((run) => {
    const scored = scoreAgentRun(run, scenario.runGold);
    const ok = scored.ok === run.expectPass;
    return {
      runId: run.id,
      expectPass: run.expectPass,
      scoreOk: scored.ok,
      ok,
      checks: scored.checks.filter((c) => !c.ok || process.env.SKILL_TRAIN_VERBOSE),
    };
  });

  return {
    scenarioId: scenario.id,
    skillText,
    runs,
    ok: skillText.ok && runs.every((r) => r.ok),
  };
}

export function runTrainLoop(
  repoRoot = findRepoRoot(),
  opts?: { onlyIds?: string[] },
): TrainLoopResult {
  let scenarios = loadSkillScenarios(repoRoot);
  if (opts?.onlyIds?.length) {
    const set = new Set(opts.onlyIds);
    scenarios = scenarios.filter((s) => set.has(s.id));
  }

  const results = scenarios.map((s) => trainScenario(repoRoot, s));
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;

  return {
    ok: failed === 0 && results.length > 0,
    scenarios: results,
    passed,
    failed,
  };
}

export function formatTrainResult(result: TrainLoopResult): string {
  const lines: string[] = [
    `skill-train: overall=${result.ok ? 'PASS' : 'FAIL'} passed=${result.passed} failed=${result.failed} total=${result.scenarios.length}`,
  ];
  for (const s of result.scenarios) {
    lines.push(`  ${s.ok ? 'PASS' : 'FAIL'} scenario=${s.scenarioId}`);
    if (!s.skillText.ok) {
      for (const c of s.skillText.checks.filter((x) => !x.ok)) {
        lines.push(`    FAIL skill-text ${c.id}${c.detail ? `: ${c.detail}` : ''}`);
      }
    }
    for (const r of s.runs) {
      if (r.ok) continue;
      lines.push(
        `    FAIL run=${r.runId} expectPass=${r.expectPass} scoreOk=${r.scoreOk}`,
      );
      for (const c of r.checks.filter((x) => !x.ok)) {
        lines.push(`      ${c.id}${c.detail ? `: ${c.detail}` : ''}`);
      }
    }
  }
  return lines.join('\n');
}
