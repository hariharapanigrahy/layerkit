/**
 * Load skill-scenario curriculum from evals/fixtures/skill-scenarios/*.json
 * Lean TDD set only — no package-name expansion bloat.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SkillScenario } from './types.js';

export function findRepoRoot(start = dirname(fileURLToPath(import.meta.url))): string {
  let dir = start;
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'evals'))) {
      return dir;
    }
    dir = dirname(dir);
  }
  return process.cwd();
}

export function scenariosDir(repoRoot: string): string {
  return join(repoRoot, 'evals', 'fixtures', 'skill-scenarios');
}

export function loadSkillScenarios(repoRoot = findRepoRoot()): SkillScenario[] {
  const dir = scenariosDir(repoRoot);
  if (!existsSync(dir)) {
    throw new Error(`skill_scenarios_missing: ${dir}`);
  }
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  if (files.length < 1) {
    throw new Error(`skill_scenarios_empty: ${dir}`);
  }

  const out: SkillScenario[] = [];
  const ids = new Set<string>();
  for (const f of files) {
    const raw = JSON.parse(readFileSync(join(dir, f), 'utf8')) as SkillScenario;
    assertScenario(raw, f);
    if (ids.has(raw.id)) throw new Error(`duplicate scenario id ${raw.id}`);
    ids.add(raw.id);
    out.push(raw);
  }
  return out;
}

function assertScenario(s: SkillScenario, file: string): void {
  if (!s.id?.trim()) throw new Error(`${file}: missing id`);
  if (!s.skillText?.skillsUnderTest?.length) {
    throw new Error(`${file}: skillText.skillsUnderTest required`);
  }
  if (!Array.isArray(s.runs) || s.runs.length < 2) {
    throw new Error(`${file}: need ≥2 runs (good + bad)`);
  }
  const hasGood = s.runs.some((r) => r.expectPass);
  const hasBad = s.runs.some((r) => !r.expectPass);
  if (!hasGood || !hasBad) {
    throw new Error(`${file}: need at least one expectPass=true and one false`);
  }
  if (!s.runGold?.requiredPipelineSteps?.length) {
    throw new Error(`${file}: runGold.requiredPipelineSteps required`);
  }
}
