/**
 * Gate: package hygiene is enforced without shelling out to npm.
 * package.json files[] is the source of truth for what npm pack can include.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertTrue } from '../../harness/assert.js';

const repoRoot = process.cwd();
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
  files?: string[];
  scripts?: Record<string, string>;
};
const vitest = readFileSync(join(repoRoot, 'vitest.config.ts'), 'utf8');

const files = pkg.files ?? [];

for (const required of [
  'dist/apps/cli/main.js',
  'dist/libs',
  'skills',
  'docs/CHEATSHEET.md',
  'docs/API_STABILITY.md',
  'README.md',
  'LICENSE',
  'SECURITY.md',
  'MATURITY.md',
  'CONTRIBUTING.md',
]) {
  assertTrue(`package includes ${required}`, files.includes(required), JSON.stringify(files));
}

for (const forbidden of [
  'evals',
  'demo',
  'demos',
  'designs',
  'docs/designs',
  '.layerkit',
  '.pulse',
  '.cursor',
  '.github',
  'AI_WORKING_RULES.md',
  'out',
  'openapi',
]) {
  assertTrue(
    `package excludes ${forbidden}`,
    !files.some((f) => f === forbidden || f.startsWith(`${forbidden}/`) || f.includes(`/${forbidden}/`)),
    JSON.stringify(files),
  );
}

for (const script of ['test', 'test:coverage', 'eval:ci', 'pack:check']) {
  assertTrue(`package defines ${script}`, typeof pkg.scripts?.[script] === 'string', JSON.stringify(pkg.scripts));
}

assertTrue('coverage threshold lines >=95', /lines:\s*95/.test(vitest), vitest);
assertTrue('coverage threshold statements >=95', /statements:\s*95/.test(vitest), vitest);
assertTrue('coverage threshold functions >=95', /functions:\s*95/.test(vitest), vitest);

console.log('package-hygiene: all checks passed');
