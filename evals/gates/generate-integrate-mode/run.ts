/**
 * Gate: topology → integrate plan against production module fixture.
 */
import { mkdtempSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertEqual, assertTrue } from '../../harness/assert.js';
import {
  applyIntegratePlan,
  buildIntegratePlan,
  formatIntegratePlanMarkdown,
  resolveGenerateMode,
  scanIntegrationTopology,
  writeIntegratePlanArtifacts,
} from '../../../libs/generate/index.js';
import type { VendorMap } from '../../../libs/domain/types.js';

const repoRoot = process.cwd();
const fixtureRoot = join(repoRoot, 'evals/fixtures/agent/fake-datalayer');

assertTrue('fake-datalayer fixture exists', existsSync(fixtureRoot), fixtureRoot);
const topology = scanIntegrationTopology({ root: fixtureRoot });
assertEqual('recommends integrate', topology.recommendedMode, 'integrate');
assertTrue('language java', topology.language === 'java');
assertTrue(
  'finds adapter',
  topology.entrypoints.some((e) => e.role === 'adapter'),
  JSON.stringify(topology.entrypoints.map((e) => e.role)),
);
assertTrue(
  'finds registry',
  topology.entrypoints.some((e) => e.role === 'registry'),
);
assertTrue(
  'finds facade',
  topology.entrypoints.some((e) => e.role === 'facade' || e.role === 'client'),
);

const resolved = resolveGenerateMode({ topology });
assertEqual('resolve integrate', resolved.mode, 'integrate');
assertEqual('resolve ok', resolved.ok, true);

const emailFixtureMap: VendorMap = {
  schemaVersion: 1,
  vendor: 'email_fixture',
  displayName: 'Email Fixture',
  version: '1.0.0',
  status: 'map_complete',
  endpoint: { method: 'POST', path: '/emails', baseUrl: 'https://api.email-fixture.test' },
  intents: { 'notify.sendEmail': { eventName: 'email.send' } },
  fields: [{ domain: 'user.email', vendor: 'to', transform: { type: 'identity' } }],
  auth: { type: 'bearer' },
  documentation: [{ title: 'Email Fixture API', url: 'https://api.email-fixture.test/docs' }],
};

const { resolution, plan } = buildIntegratePlan({
  repoRoot: fixtureRoot,
  scanRoot: fixtureRoot,
  maps: [emailFixtureMap],
});
assertEqual('plan mode integrate', resolution.mode, 'integrate');
assertTrue('plan non-null', plan != null);
assertTrue('plan has email_fixture', plan!.vendors.includes('email_fixture'));
assertTrue(
  'has create for new adapter',
  plan!.actions.some((a) => a.kind === 'create' && a.vendor === 'email_fixture'),
  JSON.stringify(plan!.actions.map((a) => `${a.kind}:${a.vendor}`)),
);
assertTrue(
  'has registry patch',
  plan!.actions.some((a) => a.kind === 'patch' && /Registry/i.test(a.path)),
);
assertTrue(
  'preserves facade (skip)',
  plan!.actions.some((a) => a.kind === 'skip' && /DataLayerClient/i.test(a.path)),
);

const md = formatIntegratePlanMarkdown(plan!);
assertTrue('md mentions integrate', /integrat/i.test(md));

const tmp = mkdtempSync(join(tmpdir(), 'layerkit-integrate-'));
const projectDir = join(tmp, '.layerkit');
mkdirSync(projectDir, { recursive: true });
const planCopy = {
  ...plan!,
  topology: {
    ...plan!.topology,
    scanRoot: tmp,
    moduleRoot: tmp,
  },
  actions: plan!.actions.map((a) =>
    a.kind === 'create' && a.content
      ? { ...a, path: `src/main/java/com/acme/integrations/vendor/EmailFixtureAdapter.java` }
      : a,
  ),
};
const arts = writeIntegratePlanArtifacts(projectDir, planCopy);
assertTrue('wrote json', existsSync(arts.jsonPath));
assertTrue('wrote md', existsSync(arts.mdPath));

const applied = applyIntegratePlan({
  plan: planCopy,
  repoRoot: tmp,
  applyCreates: true,
});
assertTrue(
  'wrote at least one create',
  applied.written.length >= 1,
  JSON.stringify(applied),
);
const created = applied.written[0]!;
assertTrue('created file exists', existsSync(created));
const body = readFileSync(created, 'utf8');
assertTrue('stub mentions email fixture', /email_fixture|EmailFixture/i.test(body));

const emptyDir = mkdtempSync(join(tmpdir(), 'layerkit-empty-'));
const emptyTopo = scanIntegrationTopology({ root: emptyDir });
assertEqual('empty → none', emptyTopo.recommendedMode, 'none');
const emptyRes = resolveGenerateMode({ topology: emptyTopo });
assertEqual('empty not ok', emptyRes.ok, false);

console.log('generate-integrate-mode: ok');
