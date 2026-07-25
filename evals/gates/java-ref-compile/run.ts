/**
 * Lightweight gate: generateJavaScaffold emits pattern types + JaCoCo 0.95 pom.
 * Does not require Maven on the host (string / structure checks only).
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { assertTrue } from '../../harness/assert.js';
import { withTempProject } from '../../harness/temp-project.js';
import { generateJavaScaffold } from '../../../libs/generate/java-scaffold.js';
import {
  checkJavaQuality,
  defaultJacocoSearchRoots,
  parseJacocoXmlLineRate,
} from '../../../libs/generate/quality.js';

await withTempProject(async ({ store, projectDir }) => {
  const project = store.loadProject();
  const domain = store.loadDomain();
  assertTrue('project present', project != null);
  assertTrue('domain present', domain != null);

  const files = generateJavaScaffold({
    project: project!,
    domain: domain!,
    maps: store.listMaps(),
  });

  const byPath = new Map(files.map((f) => [f.path, f.content]));

  assertTrue('emits pom.xml', byPath.has('pom.xml'));
  assertTrue('emits DESIGN_PATTERNS.md', byPath.has('DESIGN_PATTERNS.md'));
  assertTrue('emits AGENT_TASK.md', byPath.has('AGENT_TASK.md'));

  const pom = byPath.get('pom.xml')!;
  assertTrue('pom has junit', /junit/i.test(pom));
  assertTrue('pom has jacoco', /jacoco/i.test(pom));
  assertTrue('pom jacoco minimum 0.95', /0\.95/.test(pom) && /COVEREDRATIO|jacoco\.minimum\.line/.test(pom));

  const patterns = byPath.get('DESIGN_PATTERNS.md')!;
  assertTrue('DESIGN_PATTERNS mentions Facade', /Facade/i.test(patterns));
  assertTrue('DESIGN_PATTERNS mentions Strategy', /Strategy/i.test(patterns));

  const javaFiles = files.filter((f) => f.path.endsWith('.java'));
  assertTrue('emits Java sources', javaFiles.length >= 5);

  const allJava = javaFiles.map((f) => f.content).join('\n');
  assertTrue('DataLayerClient Facade class', /class DataLayerClient/.test(allJava));
  assertTrue('VendorAdapter Strategy interface', /interface VendorAdapter/.test(allJava));
  assertTrue('StrategyRegistry class', /class StrategyRegistry/.test(allJava));
  assertTrue('PrivacyGate interface', /interface PrivacyGate/.test(allJava));
  assertTrue('DeliveryClient interface', /interface DeliveryClient/.test(allJava));
  assertTrue('Facade pattern javadoc or track API', /Facade|public TrackResult track/.test(allJava));
  assertTrue('Strategy pattern present', /Strategy/.test(allJava));

  // Write scaffold to out/java like CLI
  const out = join(projectDir, 'out', 'java');
  for (const f of files) {
    const p = join(out, f.path);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, f.content, 'utf8');
  }
  assertTrue('wrote DataLayerClient on disk', existsSync(join(out, files.find((f) => f.path.endsWith('DataLayerClient.java'))!.path)));

  // doctor --quality without report: ok unless strict
  const roots = defaultJacocoSearchRoots(projectDir);
  const soft = checkJavaQuality({ searchRoots: roots, strict: false });
  assertTrue('quality soft ok without report', soft.ok && soft.reportMissing);

  const hard = checkJavaQuality({ searchRoots: roots, strict: true });
  assertTrue('quality strict fails without report', !hard.ok && hard.reportMissing);

  // Simulate jacoco.xml at 0.96 → pass; 0.90 → fail
  const jacocoDir = join(out, 'target', 'site', 'jacoco');
  mkdirSync(jacocoDir, { recursive: true });
  const goodXml = `<?xml version="1.0" encoding="UTF-8"?>
<report name="eval">
  <counter type="LINE" missed="4" covered="96"/>
</report>
`;
  writeFileSync(join(jacocoDir, 'jacoco.xml'), goodXml, 'utf8');
  const rate = parseJacocoXmlLineRate(join(jacocoDir, 'jacoco.xml'));
  assertTrue('parsed line rate ~0.96', rate !== undefined && rate >= 0.95);

  const withReport = checkJavaQuality({ searchRoots: roots, strict: true });
  assertTrue('quality strict ok with 0.96 report', withReport.ok);

  writeFileSync(
    join(jacocoDir, 'jacoco.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>
<report name="eval">
  <counter type="LINE" missed="10" covered="90"/>
</report>
`,
    'utf8',
  );
  const low = checkJavaQuality({ searchRoots: roots, strict: true });
  assertTrue('quality fails below 0.95', !low.ok && low.coverageBelowFloor);

  // Ensure on-disk Java contains pattern strings (ref-compile style check)
  const facadePath = files.find((f) => f.path.endsWith('DataLayerClient.java'))!.path;
  const facadeSrc = readFileSync(join(out, facadePath), 'utf8');
  assertTrue('on-disk Facade track()', /TrackResult track/.test(facadeSrc));

  console.log('java-ref-compile: all checks passed');
}, { poc: true });
