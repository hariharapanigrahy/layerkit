import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertTrue } from '../../harness/assert.js';

const repoRoot = process.cwd();
const skill = readFileSync(
  join(repoRoot, 'skills', 'layerkit-source-edit-client', 'SKILL.md'),
  'utf8',
);
const deletion = readFileSync(
  join(repoRoot, 'skills', 'layerkit-deletion-first', 'SKILL.md'),
  'utf8',
);
const fixture = JSON.parse(
  readFileSync(join(repoRoot, 'evals', 'fixtures', 'skills', 'source-edit-cases.json'), 'utf8'),
) as { cases: Array<{ id: string; expected: string }> };

for (const c of fixture.cases) {
  assertTrue(`fixture case has expected behavior: ${c.id}`, c.expected.length > 20);
}

const combined = `${skill}\n${deletion}`;
for (const pattern of [
  /existing/i,
  /production source/i,
  /directly from evidence/i,
  /For every new file\/function\/export/i,
  /TODO/i,
  /unsupported/i,
  /remove\/update stale|Stale code\/docs\/tests/i,
  /client-package edit path/i,
  /mapping semantics/i,
  /deletion-first behavior/i,
  /what must pass/i,
  /proof artifact/i,
  /fallback/i,
  /New Vendor Integrations/i,
  /sibling|multi-vendor/i,
  /registry/i,
  /parallel facade/i,
  /follow.*existing path|existing path/i,
]) {
  assertTrue(`source-edit instructions include ${pattern}`, pattern.test(combined), combined);
}

const multiVendorCases = (fixture.cases as Array<{ id: string }>).filter((c) =>
  c.id.startsWith('new-vendor-'),
);
assertTrue(
  'source-edit-cases include multi-vendor new-vendor curriculum (≥2)',
  multiVendorCases.length >= 2,
  JSON.stringify(multiVendorCases.map((c) => c.id)),
);

for (const forbidden of [
  /new mapper instead/i,
  /generate an integration plan/i,
  /\.layerkit\/out.*production/i,
]) {
  assertTrue(`source-edit instructions avoid ${forbidden}`, !forbidden.test(skill), skill);
}

console.log('source-edit-skill-cases: all checks passed');
