/**
 * Optional local check: generate Java scaffold to a temp dir and compile it.
 * Prefers `mvn -q -DskipTests compile`; falls back to `javac --release 17`.
 * Not part of `npm test` (avoids requiring Maven/JDK on all machines).
 * Wired via package.json `check:java-scaffold`; CI coverage is eval gate java-ref-compile.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateJavaScaffold } from '../dist/libs/generate/java-scaffold.js';
import { compileJavaScaffold } from '../dist/libs/generate/compile-java-scaffold.js';

const project = {
  name: 'check-java-scaffold',
  version: '0.1.0',
  languages: ['java'],
  javaPackage: 'io.layerkit.generated',
  domain: {
    id: 'commerce',
    version: '0.1.0',
    description: 'scaffold compile check',
    intents: [{ id: 'purchase', description: 'purchase' }],
    fields: [],
  },
  vendors: [],
};

const domain = project.domain;
const files = generateJavaScaffold({ project, domain, maps: [] });

// Existing string checks (Facade / Strategy)
const allJava = files
  .filter((f) => f.path.endsWith('.java'))
  .map((f) => f.content)
  .join('\n');
const patterns = files.find((f) => f.path === 'DESIGN_PATTERNS.md')?.content ?? '';
const checks = [
  ['pom.xml', files.some((f) => f.path === 'pom.xml')],
  ['Facade DataLayerClient', /class DataLayerClient/.test(allJava)],
  ['Strategy VendorAdapter', /interface VendorAdapter/.test(allJava)],
  ['StrategyRegistry', /class StrategyRegistry/.test(allJava)],
  ['DESIGN_PATTERNS Facade', /Facade/i.test(patterns)],
  ['DESIGN_PATTERNS Strategy', /Strategy/i.test(patterns)],
];
for (const [name, ok] of checks) {
  if (!ok) {
    console.error(`check-java-scaffold: FAIL string check: ${name}`);
    process.exit(1);
  }
}

const root = mkdtempSync(join(tmpdir(), 'layerkit-java-scaffold-'));
try {
  for (const f of files) {
    const p = join(root, f.path);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, f.content, 'utf8');
  }
  const javaSourcePaths = files.filter((f) => f.path.endsWith('.java')).map((f) => f.path);
  const result = compileJavaScaffold({ scaffoldDir: root, javaSourcePaths });
  if (!result.ok) {
    console.error(`check-java-scaffold: FAIL compile via ${result.tool}`);
    if (result.output) console.error(result.output);
    process.exit(1);
  }
  console.log(`check-java-scaffold: ok (compiled with ${result.tool})`);
} finally {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}
