/**
 * Gate: hasJavaProjectSignal is false without Java module; true with pom.xml.
 * Supports promote auto-skip of JaCoCo for Node-only projects.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertTrue, assertEqual } from '../../harness/assert.js';
import { withTempProject } from '../../harness/temp-project.js';
import {
  checkJavaQuality,
  hasJavaProjectSignal,
} from '../../../libs/generate/quality.js';

await withTempProject(async ({ projectDir }) => {
  const outJava = join(projectDir, 'out', 'java');
  mkdirSync(outJava, { recursive: true });

  assertEqual(
    'no java signal without pom',
    hasJavaProjectSignal([outJava, projectDir]),
    false,
  );

  // Node-only: strict quality would fail, but auto-skip path treats as ok when no signal
  const qMissing = checkJavaQuality({
    searchRoots: [outJava],
    strict: true,
  });
  assertEqual('strict fails when no report', qMissing.ok, false);

  // With Java signal, promote should not auto-skip (caller uses hasJavaProjectSignal)
  writeFileSync(join(outJava, 'pom.xml'), '<project></project>\n');
  assertEqual('java signal with pom', hasJavaProjectSignal([outJava]), true);

  assertTrue('helper exported', typeof hasJavaProjectSignal === 'function');
  console.log('promote-non-java-quality: all checks passed');
}, { poc: true });
