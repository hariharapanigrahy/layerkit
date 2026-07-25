/**
 * Gate: style-profile-cli
 * Scan fixture fake-client (pom + Java) → profile validates; runbook markdown round-trips.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertEqual, assertTrue } from '../../harness/assert.js';
import {
  formatStyleProfileMarkdown,
  parseStyleProfileMarkdown,
  scanAndWriteStyleProfile,
  scanJavaStyle,
  STYLE_PROFILE_RUNBOOK_REL,
  validateStyleProfile,
} from '../../../libs/agent/index.js';

const repoRoot = process.cwd();
const fixtureRoot = join(repoRoot, 'evals/fixtures/agent/fake-client');

assertTrue('fake-client fixture exists', existsSync(fixtureRoot), fixtureRoot);
assertTrue(
  'fake-client has pom.xml',
  existsSync(join(fixtureRoot, 'pom.xml')),
  join(fixtureRoot, 'pom.xml'),
);

const scanned = scanJavaStyle(fixtureRoot);
const { evidence, profile } = scanned;

assertTrue('found at least one Java file', evidence.javaFiles.length >= 1, JSON.stringify(evidence.javaFiles));
assertTrue(
  'found pom.xml build file',
  evidence.buildFiles.some((f) => f.endsWith('pom.xml')),
  JSON.stringify(evidence.buildFiles),
);
assertTrue(
  'package includes com.acme',
  evidence.packages.some((p) => p.startsWith('com.acme')),
  JSON.stringify(evidence.packages),
);
assertTrue(
  'http signals include OkHttp',
  evidence.httpHits.some((h) => /okhttp/i.test(h)),
  JSON.stringify(evidence.httpHits),
);
assertTrue(
  'di signals include Spring',
  evidence.diHits.some((h) => /spring/i.test(h)),
  JSON.stringify(evidence.diHits),
);
assertTrue(
  'test signals include JUnit',
  evidence.testHits.some((h) => /junit/i.test(h)),
  JSON.stringify(evidence.testHits),
);

const v = validateStyleProfile(profile);
assertTrue(
  'profile validates',
  v.ok,
  `missing=${v.missing.join(',')} empty=${v.empty.join(',')} profile=${JSON.stringify(profile)}`,
);
assertTrue('package non-empty', profile.package.trim().length > 0);
assertTrue('di mentions Spring or constructor', /spring|constructor/i.test(profile.di), profile.di);
assertTrue('http is OkHttp', /okhttp/i.test(profile.http), profile.http);
assertTrue('test mentions JUnit', /junit/i.test(profile.test), profile.test);

const md = formatStyleProfileMarkdown(profile);
const fromMd = parseStyleProfileMarkdown(md);
const vMd = validateStyleProfile(fromMd);
assertTrue('markdown round-trip validates', vMd.ok, JSON.stringify(vMd));
assertEqual('md package', fromMd.package, profile.package);
assertEqual('md http', fromMd.http, profile.http);

// Write path: memory runbook under a temp projectDir
const tmp = mkdtempSync(join(tmpdir(), 'layerkit-style-profile-'));
try {
  const projectDir = join(tmp, '.layerkit');
  const { outPath, result } = scanAndWriteStyleProfile({
    root: fixtureRoot,
    projectDir,
    out: 'memory',
  });
  const expected = join(projectDir, STYLE_PROFILE_RUNBOOK_REL);
  assertEqual('runbook path', outPath, expected);
  assertTrue('runbook file exists', existsSync(outPath), outPath);
  const written = readFileSync(outPath, 'utf8');
  assertTrue('runbook has package heading', /##\s+package/i.test(written), written.slice(0, 300));
  assertTrue('runbook mentions OkHttp', /okhttp/i.test(written), written.slice(0, 400));
  const parsed = parseStyleProfileMarkdown(written);
  assertTrue('written profile validates', validateStyleProfile(parsed).ok, JSON.stringify(parsed));
  assertTrue('scan result still has java', result.evidence.javaFiles.length >= 1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log('style-profile-cli: all checks passed');
