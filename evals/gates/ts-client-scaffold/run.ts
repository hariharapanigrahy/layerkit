/**
 * Gate: generateTsScaffold produces package.json, index with DataLayerClient,
 * vendor types, apply-map dry_run stub, and README.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertTrue } from '../../harness/assert.js';
import { withTempProject } from '../../harness/temp-project.js';
import { generateTsScaffold } from '../../../libs/generate/ts-scaffold.js';

await withTempProject(async ({ store, projectDir }) => {
  const project = store.loadProject();
  const domain = store.loadDomain();
  assertTrue('project present', project != null);
  assertTrue('domain present', domain != null);

  const files = generateTsScaffold({
    project: project!,
    domain: domain!,
    maps: store.listMaps(),
  });

  const byPath = new Map(files.map((f) => [f.path, f.content]));

  assertTrue('emits package.json', byPath.has('package.json'));
  assertTrue('emits src/index.ts', byPath.has('src/index.ts'));
  assertTrue('emits src/vendor/types.ts', byPath.has('src/vendor/types.ts'));
  assertTrue('emits src/apply-map.ts', byPath.has('src/apply-map.ts'));
  assertTrue('emits README.md', byPath.has('README.md'));

  const pkg = byPath.get('package.json')!;
  assertTrue('package.json type module', /"type"\s*:\s*"module"/.test(pkg));
  assertTrue('package.json has name', /"name"\s*:/.test(pkg));

  const index = byPath.get('src/index.ts')!;
  assertTrue('index.ts contains DataLayerClient', /DataLayerClient/.test(index));
  assertTrue('index.ts contains dry_run', /dry_run/.test(index));
  assertTrue('index.ts has track(intent', /track\s*\(\s*intent/.test(index));

  const apply = byPath.get('src/apply-map.ts')!;
  assertTrue('apply-map returns dry_run mode', /mode:\s*['"]dry_run['"]/.test(apply));
  assertTrue('apply-map mentions Layerkit maps', /Layerkit maps/i.test(apply));

  const types = byPath.get('src/vendor/types.ts')!;
  assertTrue('types has VendorMapLite or VendorMap-ish', /VendorMap/i.test(types));

  // Write like CLI default out/ts
  const out = join(projectDir, 'out', 'ts');
  for (const f of files) {
    const p = join(out, f.path);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, f.content, 'utf8');
  }
  assertTrue('wrote index on disk', existsSync(join(out, 'src/index.ts')));
  const onDisk = readFileSync(join(out, 'src/index.ts'), 'utf8');
  assertTrue('on-disk DataLayerClient', /DataLayerClient/.test(onDisk));
  assertTrue('on-disk dry_run', /dry_run/.test(onDisk));

  console.log('ts-client-scaffold: all checks passed');
}, { poc: true });
