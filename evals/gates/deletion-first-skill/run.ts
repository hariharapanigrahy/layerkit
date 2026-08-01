/**
 * Gate: deletion-first skill is a required pre-generate discipline.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertEqual, assertTrue } from '../../harness/assert.js';
import { loadFixture } from '../../harness/load-fixture.js';
import { REQUIRED_SKILL_PIPELINE } from '../../../libs/agent/index.js';
import { SKILL_NAMES } from '../../../libs/install/skills.js';

interface Surface {
  path: string;
  kind: string;
  servesHealPath: boolean;
  expectedAction: string;
}

interface DeletionFirstFixture {
  id: string;
  currentProductPath: string[];
  surfaces: Surface[];
}

const repoRoot = process.cwd();
const skillPath = join(repoRoot, 'skills', 'layerkit-deletion-first', 'SKILL.md');
const orchestratePath = join(repoRoot, 'skills', 'layerkit-orchestrate-integration', 'SKILL.md');
const generatePath = join(repoRoot, 'skills', 'layerkit-generate-java', 'SKILL.md');

assertTrue('skill file exists', existsSync(skillPath), skillPath);
const skill = readFileSync(skillPath, 'utf8');

for (const phrase of [
  'Before adding code',
  'Prefer modifying or deleting existing code',
  'Do not add a new abstraction',
  'For every new file, function, export',
  'Target net-negative or near-neutral LOC',
]) {
  assertTrue(`skill includes: ${phrase}`, skill.includes(phrase));
}

assertTrue(
  'skill packaged',
  (SKILL_NAMES as readonly string[]).includes('layerkit-deletion-first'),
);

const pipeline = [...REQUIRED_SKILL_PIPELINE];
assertTrue('pipeline includes deletion-first', pipeline.includes('layerkit-deletion-first'));
assertTrue(
  'deletion-first before generate-java',
  pipeline.indexOf('layerkit-deletion-first') < pipeline.indexOf('layerkit-generate-java'),
);

const orchestrate = readFileSync(orchestratePath, 'utf8');
const generate = readFileSync(generatePath, 'utf8');
assertTrue('orchestrate references deletion-first', orchestrate.includes('layerkit-deletion-first'));
assertTrue('generate references deletion-first', generate.includes('layerkit-deletion-first'));

const fixture = loadFixture<DeletionFirstFixture>('deletion-first/stale-surfaces.json');
assertEqual('fixture id', fixture.id, 'deletion-first-stale-surfaces');
assertTrue(
  'fixture product path includes contract drift',
  fixture.currentProductPath.includes('contract drift'),
);

const stale = fixture.surfaces.filter((s) => !s.servesHealPath);
assertTrue('fixture has stale deletion candidates', stale.length >= 3);
for (const surface of stale) {
  assertTrue(
    `stale surface is deletable: ${surface.path}`,
    surface.expectedAction === 'delete' || surface.expectedAction === 'delete-or-repoint',
    JSON.stringify(surface),
  );
}

const kept = fixture.surfaces.filter((s) => s.servesHealPath);
assertTrue('fixture keeps heal path surfaces', kept.length >= 2);
for (const surface of kept) {
  assertTrue(
    `heal surface is kept: ${surface.path}`,
    surface.expectedAction.startsWith('keep'),
    JSON.stringify(surface),
  );
}

console.log('deletion-first-skill: all checks passed');
