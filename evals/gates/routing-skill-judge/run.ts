/**
 * Gate: routing design is skill-owned; runtime only validates/evaluates explicit policy.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertTrue } from '../../harness/assert.js';

const repoRoot = process.cwd();

const skillPath = join(repoRoot, 'skills/layerkit-design-routing/SKILL.md');
assertTrue('routing skill exists', existsSync(skillPath), skillPath);

const skill = readFileSync(skillPath, 'utf8');
const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8');
const corpus = `${skill}\n\n--- readme ---\n\n${readme}`;

assertIncludesAll('routing design is agent-owned', corpus, [
  /AI agent owns routing meaning/i,
  /which attributes matter/i,
  /vendor sets/i,
  /routes/i,
  /expansions/i,
  /from code and product\/business evidence/i,
]);

assertIncludesAll('runtime only executes explicit policy', corpus, [
  /Runtime is deterministic only after the policy exists/i,
  /executes the explicit JSON policy/i,
  /validate a supplied policy/i,
  /show a route plan for a sample event/i,
  /Layerkit core does not infer routing logic/i,
]);

assertForbidden('forbid deterministic routing design claims', corpus, [
  /CLI (?:infers|generates|decides) routing logic/i,
  /infer route conditions/i,
  /infer vendor sets/i,
  /infer expansions/i,
  /deterministically (?:infer|generate|decide) routes/i,
]);

console.log('routing-skill-judge: ok');

function assertIncludesAll(name: string, text: string, patterns: RegExp[]): void {
  for (const pattern of patterns) {
    assertTrue(`${name}: includes ${pattern.source}`, pattern.test(text), text.slice(0, 1200));
  }
}

function assertForbidden(name: string, text: string, patterns: RegExp[]): void {
  for (const pattern of patterns) {
    assertTrue(`${name}: forbids ${pattern.source}`, !pattern.test(text), pattern.source);
  }
}
