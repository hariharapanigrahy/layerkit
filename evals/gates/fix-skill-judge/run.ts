/**
 * Gate: dry-run fixes are agent-authored; CLI only applies explicit patches.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertTrue } from '../../harness/assert.js';

const repoRoot = process.cwd();
const skillPath = join(repoRoot, 'skills/layerkit-fix-from-dry-run/SKILL.md');
assertTrue('fix skill exists', existsSync(skillPath), skillPath);

const skill = readFileSync(skillPath, 'utf8');
const cli = readFileSync(join(repoRoot, 'apps/cli/main.ts'), 'utf8');
const corpus = `${skill}\n\n--- cli ---\n\n${cli}`;

assertIncludesAll('agent-authored patch path', corpus, [
  /author an explicit `MapPathFixPatch` from cited docs/i,
  /agent-authored patches from evidence/i,
  /re-reading docs\/OpenAPI\/curl/i,
  /layerkit fix dry-run/i,
  /--patches \.\/patches\.json/i,
]);

assertForbidden('forbid deterministic prose-to-patch path', corpus, [
  /fix suggest/i,
  /extracts a path from the doc/i,
  /suggested patch/i,
  /pathFixFromDoc/i,
  /detectPathMismatch/i,
  /extractPathFromDocExcerpt/i,
  /CLI (?:infers|suggests|generates) a patch from prose docs/i,
]);

console.log('fix-skill-judge: ok');

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
