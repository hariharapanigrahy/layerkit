/**
 * Gate: topology → agent-facing integrate plan against production module fixture.
 */
import { mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertEqual, assertTrue } from '../../harness/assert.js';
import {
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

const postmarkMap: VendorMap = {
  schemaVersion: 1,
  vendor: 'postmark',
  displayName: 'Postmark',
  version: '2.0.0',
  status: 'map_complete',
  endpoint: { method: 'POST', path: '/emails', baseUrl: 'https://api.email-fixture.test' },
  intents: { 'notify.sendEmail': { eventName: 'email.send' } },
  fields: [
    { domain: 'name', vendor: 'name', transform: { type: 'identity' } },
    { domain: 'email', vendor: 'email_id', transform: { type: 'identity' } },
    { domain: 'phone', vendor: 'phone_id', transform: { type: 'identity' } },
  ],
  auth: { type: 'bearer' },
  documentation: [{ title: 'Email Fixture API', url: 'https://api.email-fixture.test/docs' }],
};

const postmarkPlan = buildIntegratePlan({
  repoRoot: fixtureRoot,
  scanRoot: fixtureRoot,
  maps: [postmarkMap],
  vendors: ['postmark'],
  driftByVendor: {
    postmark: {
      severity: 'breaking',
      summary: 'Vendor renamed email to email_id and phone to phone_id',
      items: [
        { kind: 'field_removed', severity: 'breaking', detail: 'email removed', path: 'email' },
        { kind: 'field_added', severity: 'breaking', detail: 'email_id added', path: 'email_id' },
        { kind: 'field_removed', severity: 'breaking', detail: 'phone removed', path: 'phone' },
        { kind: 'field_added', severity: 'breaking', detail: 'phone_id added', path: 'phone_id' },
      ],
    },
  },
});
assertTrue('postmark plan non-null', postmarkPlan.plan != null);
const postmarkPatch = postmarkPlan.plan!.actions.find(
  (a) => a.kind === 'patch' && a.vendor === 'postmark',
);
assertTrue('postmark existing adapter patch exists', postmarkPatch != null);
assertTrue(
  'patch does not synthesize source content',
  !JSON.stringify(postmarkPatch).includes('"content"'),
  JSON.stringify(postmarkPatch),
);
assertTrue(
  'patch delegates mapper meaning to agent',
  /agent must inspect/i.test(postmarkPatch!.instructions),
  postmarkPatch!.instructions,
);
assertTrue(
  'plan carries drift context without doing semantic code change',
  /email_id|phone_id/i.test(postmarkPatch!.instructions),
  postmarkPatch!.instructions,
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
  actions: plan!.actions,
};
const arts = writeIntegratePlanArtifacts(projectDir, planCopy);
assertTrue('wrote json', existsSync(arts.jsonPath));
assertTrue('wrote md', existsSync(arts.mdPath));

assertTrue(
  'plan is instruction-only, not generated adapter/test source bodies',
  !JSON.stringify(planCopy.actions).includes('"content"'),
  JSON.stringify(planCopy.actions),
);

const emptyDir = mkdtempSync(join(tmpdir(), 'layerkit-empty-'));
const emptyTopo = scanIntegrationTopology({ root: emptyDir });
assertEqual('empty → none', emptyTopo.recommendedMode, 'none');
const emptyRes = resolveGenerateMode({ topology: emptyTopo });
assertEqual('empty not ok', emptyRes.ok, false);

console.log('generate-integrate-mode: ok');
