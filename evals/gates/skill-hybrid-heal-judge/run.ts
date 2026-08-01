/**
 * Gate: judge the AI-facing skills, not the CLI implementation.
 *
 * This is a deterministic rubric over the prompt artifacts an AI agent receives:
 * SKILL.md files. It prevents regressions where semantic contract/source-edit work
 * is described as a fake deterministic CLI feature instead of agent-owned editing.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertEqual, assertTrue } from '../../harness/assert.js';
import { loadFixture } from '../../harness/load-fixture.js';

interface SkillRubric {
  id: string;
  scenarios: Array<{
    id: string;
    userInput: string;
    expectedSkillBehavior: string[];
    forbiddenSkillBehavior: string[];
  }>;
}

const repoRoot = process.cwd();
const rubric = loadFixture<SkillRubric>('skills/hybrid-heal-rubric.json');
assertEqual('rubric id', rubric.id, 'hybrid-heal-skill-rubric');
assertTrue('rubric has skill scenarios', rubric.scenarios.length >= 3);

const research = readSkill('layerkit-research-vendor');
const orchestrate = readSkill('layerkit-orchestrate-integration');
const multi = readSkill('layerkit-multi-agent');
const deletionFirst = readSkill('layerkit-deletion-first');
const generate = readSkill('layerkit-generate-java');
const skillCorpus = [research, orchestrate, multi, deletionFirst, generate].join('\n\n--- skill ---\n\n');
const judgedCorpus = skillCorpus;

for (const skillName of [
  'layerkit-research-vendor',
  'layerkit-orchestrate-integration',
  'layerkit-multi-agent',
  'layerkit-deletion-first',
]) {
  assertTrue(`skill exists: ${skillName}`, existsSync(skillPath(skillName)));
}

assertIncludesAll('docs-link heal is hybrid skill flow', judgedCorpus, [
  /agent-owned|AI agent/i,
  /read\/cite|reads\/cites|read, cite|reads, cites/i,
  /docs\/OpenAPI|OpenAPI\/docs|docs and OpenAPI/i,
  /edit(?:s)? production source|edit(?:s)? existing source|real package edits/i,
  /deterministic rails?.*tools?|CLI.*tools?/i,
]);

assertForbidden('docs-link heal forbids fake CLI parser path', judgedCorpus, [
  /heal run/i,
  /research contract-from-doc/i,
  /contract-from-doc/i,
  /CLI can extract/i,
  /explicit endpoint\/table\/example docs/i,
  /layerkit generate/i,
  /agent multi/i,
]);

assertIncludesAll('semantic rename requires evidence handoff', judgedCorpus, [
  /evidence/i,
  /rename/i,
  /do not guess|never guess/i,
  /source edits require docs\/code evidence|agent remains responsible for meaning|AI agent performs the production source edit|edit production source/i,
]);

assertIncludesAll('update mode is deletion-first before additive work', judgedCorpus, [
  /Before adding code/i,
  /Prefer modifying or deleting existing code/i,
  /Do not add a new abstraction/i,
  /Target net-negative or near-neutral LOC/i,
  /deletion-first/i,
]);

assertForbidden('heal skill path forbids fake PR packaging artifacts', judgedCorpus, [
  /out\/pr/i,
  /(?:open|create|write)\s+(?:a\s+)?PR package/i,
  /PR metadata/i,
  /apply-to-repo\.sh/i,
  /heal run[^\n]+INTEGRATE\.md/i,
]);

assertForbidden('heal skill path forbids deterministic source editing claims', judgedCorpus, [
  /heal run[^\n]+direct source edits/i,
  /heal run[^\n]+updates source\/map files directly/i,
  /deterministic heal validates.*editing source/i,
  /--apply for stubs only/i,
]);

for (const scenario of rubric.scenarios) {
  assertTrue(`rubric scenario has expected behavior: ${scenario.id}`, scenario.expectedSkillBehavior.length > 0);
  assertTrue(`rubric scenario has forbidden behavior: ${scenario.id}`, scenario.forbiddenSkillBehavior.length > 0);
}

console.log('skill-hybrid-heal-judge: ok');

function skillPath(name: string): string {
  return join(repoRoot, 'skills', name, 'SKILL.md');
}

function readSkill(name: string): string {
  const path = skillPath(name);
  assertTrue(`read skill file: ${name}`, existsSync(path), path);
  return readFileSync(path, 'utf8');
}

function assertIncludesAll(name: string, text: string, patterns: RegExp[]): void {
  for (const pattern of patterns) {
    assertTrue(`${name}: includes ${pattern.source}`, pattern.test(text), preview(text));
  }
}

function assertForbidden(name: string, text: string, patterns: RegExp[]): void {
  for (const pattern of patterns) {
    assertTrue(`${name}: forbids ${pattern.source}`, !pattern.test(text), pattern.source);
  }
}

function preview(text: string): string {
  return text.slice(0, 1000);
}
