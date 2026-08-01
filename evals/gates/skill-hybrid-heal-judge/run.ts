/**
 * Gate: judge the AI-facing skills, not the CLI implementation.
 *
 * This is a deterministic rubric over the prompt artifacts an AI agent receives:
 * SKILL.md files plus generated multi-agent prompts. It prevents regressions where
 * docs-only heal is described as a fake CLI feature instead of a hybrid skill flow.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertEqual, assertTrue } from '../../harness/assert.js';
import { loadFixture } from '../../harness/load-fixture.js';
import { buildMultiAgentPlan, formatMultiAgentPlanMarkdown } from '../../../libs/agent/index.js';

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

const healPlan = buildMultiAgentPlan({
  repoRoot,
  projectDir: join(repoRoot, '.layerkit-eval'),
  vendors: ['resend'],
  mode: 'heal',
  openapiPath: '.layerkit/out/contracts/resend/openapi-from-doc.json',
  moduleRoot: 'apps/integrations',
});
const healMarkdown = formatMultiAgentPlanMarkdown(healPlan);
const researcherTask = healPlan.tasks.find((t) => t.id === 'researcher:resend');
assertTrue('heal plan has researcher task', researcherTask != null);
const promptCorpus = [healMarkdown, researcherTask?.prompt ?? '', ...(researcherTask?.cli ?? [])].join('\n');
const judgedCorpus = `${skillCorpus}\n\n--- generated prompt ---\n\n${promptCorpus}`;

for (const skillName of [
  'layerkit-research-vendor',
  'layerkit-orchestrate-integration',
  'layerkit-multi-agent',
  'layerkit-deletion-first',
]) {
  assertTrue(`skill exists: ${skillName}`, existsSync(skillPath(skillName)));
}

assertIncludesAll('docs-link heal is hybrid skill flow', judgedCorpus, [
  /AI(?: |-)?curated structured contract/i,
  /AI reader/i,
  /read\/cite|reads\/cites|read, cite|reads, cites/i,
  /structured OpenAPI-compatible contract/i,
  /heal run --vendor <vendor> --openapi .*openapi-from-doc\.json/i,
  /CLI does not understand arbitrary docs/i,
  /agent edits source directly|AI agent edits production source|source edits are agent-owned|edit real source\/tests/i,
]);

assertForbidden('docs-link heal forbids fake CLI parser path', judgedCorpus, [
  /heal run --vendor [^\n]*--doc(?! <url>\])/i,
  /research contract-from-doc/i,
  /contract-from-doc/i,
  /CLI can extract/i,
  /explicit endpoint\/table\/example docs/i,
]);

assertIncludesAll('semantic rename requires evidence handoff', judgedCorpus, [
  /fromVendor/i,
  /toVendor/i,
  /confidence/i,
  /evidence/i,
  /Guessing field renames from names alone/i,
  /source edits require docs\/code evidence|agent remains responsible for meaning|AI agent performs the production source edit/i,
  /--rename-decisions/i,
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

assertTrue(
  'generated heal plan omits integrate phase',
  !healPlan.phases.some((p) => p.id === 'integrate'),
  JSON.stringify(healPlan.phases),
);
assertTrue(
  'generated heal plan omits integrator tasks',
  !healPlan.tasks.some((t) => t.role === 'integrator'),
  JSON.stringify(healPlan.tasks.map((t) => [t.id, t.role])),
);
assertIncludesAll('generated researcher prompt tells agent to curate docs before heal', promptCorpus, [
  /If the user supplied docs, first curate a structured contract with citations/i,
  /use it as --openapi/i,
  /Review out\/CONTRACT_DRIFT\.json/i,
  /--rename-decisions with evidence/i,
]);
assertForbidden('generated researcher prompt does not advertise heal --doc', promptCorpus, [
  /heal run --vendor <v> --doc/i,
  /contract-from-doc/i,
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
