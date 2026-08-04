/**
 * Layer B1: skill-text judge — do SKILL.md files instruct the right behavior?
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DimensionScore, RubricCheck, SkillScenario } from './types.js';

export function loadSkillMarkdown(repoRoot: string, skillName: string): string {
  const path = join(repoRoot, 'skills', skillName, 'SKILL.md');
  if (!existsSync(path)) {
    throw new Error(`skill_missing: ${skillName} (${path})`);
  }
  return readFileSync(path, 'utf8');
}

export function scoreSkillText(
  repoRoot: string,
  scenario: SkillScenario,
): DimensionScore {
  const checks: RubricCheck[] = [];
  const names = scenario.skillText.skillsUnderTest;
  const parts: string[] = [];

  for (const name of names) {
    try {
      parts.push(loadSkillMarkdown(repoRoot, name));
      checks.push({ id: `skill-exists:${name}`, ok: true });
    } catch (e) {
      checks.push({
        id: `skill-exists:${name}`,
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const corpus = parts.join('\n\n---\n\n');

  for (let i = 0; i < scenario.skillText.mustMatch.length; i++) {
    const raw = scenario.skillText.mustMatch[i]!;
    const re = compilePattern(raw);
    const ok = re.test(corpus);
    checks.push({
      id: `skill-text:mustMatch[${i}]`,
      ok,
      detail: ok ? undefined : `skills must match /${raw}/`,
    });
  }

  for (let i = 0; i < scenario.skillText.mustNotMatch.length; i++) {
    const raw = scenario.skillText.mustNotMatch[i]!;
    const re = compilePattern(raw);
    const ok = !re.test(corpus);
    checks.push({
      id: `skill-text:mustNotMatch[${i}]`,
      ok,
      detail: ok ? undefined : `skills must NOT match /${raw}/`,
    });
  }

  return { ok: checks.every((c) => c.ok), checks };
}

function compilePattern(raw: string): RegExp {
  // Support /pattern/flags or bare string (default i)
  const m = raw.match(/^\/(.+)\/([a-z]*)$/s);
  if (m) return new RegExp(m[1]!, m[2] || 'i');
  return new RegExp(raw, 'i');
}
