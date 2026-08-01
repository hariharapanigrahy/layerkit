/**
 * Gate: every Layerkit skill has explicit judge coverage in CI.
 *
 * This does not claim semantic completeness. It prevents silent skill drift by
 * requiring each skill to map to concrete CI gates and named judged dimensions.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface CoverageManifest {
  schemaVersion: number;
  skills: Record<string, { dimensions: string[]; ciCases: string[] }>;
}

function findRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'evals'))) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

function assertTrue(name: string, ok: boolean, detail?: string): void {
  if (!ok) {
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ''}`);
    process.exitCode = 1;
    return;
  }
  console.log(`PASS ${name}`);
}

const repo = findRepoRoot();
const skillsDir = join(repo, 'skills');
const gatesDir = join(repo, 'evals', 'gates');
const manifestPath = join(repo, 'evals', 'fixtures', 'skills', 'skill-judge-coverage.json');
const suitesPath = join(repo, 'evals', 'suites.json');

const layerkitSkills = readdirSync(skillsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name.startsWith('layerkit-'))
  .filter((d) => existsSync(join(skillsDir, d.name, 'SKILL.md')))
  .map((d) => d.name)
  .sort();

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as CoverageManifest;
const ciSuite = (JSON.parse(readFileSync(suitesPath, 'utf8')) as { ci: string[] }).ci;
const ciSet = new Set(ciSuite);
const coveredSkills = Object.keys(manifest.skills).sort();

const missingFromManifest = layerkitSkills.filter((s) => !coveredSkills.includes(s));
const staleManifestEntries = coveredSkills.filter((s) => !layerkitSkills.includes(s));

assertTrue(
  'all Layerkit skills are listed in skill judge coverage manifest',
  missingFromManifest.length === 0,
  missingFromManifest.join(', '),
);
assertTrue(
  'skill judge coverage manifest has no stale skill entries',
  staleManifestEntries.length === 0,
  staleManifestEntries.join(', '),
);

for (const skill of layerkitSkills) {
  const coverage = manifest.skills[skill];
  if (!coverage) continue;
  assertTrue(`${skill} lists judged dimensions`, coverage.dimensions.length > 0);
  assertTrue(`${skill} lists CI judge cases`, coverage.ciCases.length > 0);

  const duplicateCases = coverage.ciCases.filter((id, idx) => coverage.ciCases.indexOf(id) !== idx);
  assertTrue(`${skill} coverage has no duplicate cases`, duplicateCases.length === 0, duplicateCases.join(', '));

  for (const id of coverage.ciCases) {
    assertTrue(`${skill} judge case ${id} is in suite ci`, ciSet.has(id));
    assertTrue(`${skill} judge case ${id} has run.ts`, existsSync(join(gatesDir, id, 'run.ts')));
    assertTrue(`${skill} judge case ${id} has case.json`, existsSync(join(gatesDir, id, 'case.json')));
  }
}

const allReferencedCases = new Set(Object.values(manifest.skills).flatMap((c) => c.ciCases));
assertTrue('coverage manifest references at least ten distinct CI gates', allReferencedCases.size >= 10);

if (process.exitCode) process.exit(process.exitCode);
console.log('skill-judge-coverage: ok');
