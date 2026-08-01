/**
 * Gate: heal run pins contract, applies map, writes code directly.
 */
import { existsSync, cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertEqual, assertTrue } from '../../harness/assert.js';
import { runHeal } from '../../../libs/agent/index.js';
import { createVendorMemoryStore } from '../../../libs/vendor-memory/store.js';
import type { VendorMapV1 } from '../../../libs/domain/types.js';

const repoRoot = process.cwd();
const openapiV1 = join(repoRoot, 'evals/fixtures/openapi/contract-heal/email-v1.openapi.json');
const openapiV2 = join(repoRoot, 'evals/fixtures/openapi/contract-heal/email-v2.openapi.json');
const fixture = join(repoRoot, 'evals/fixtures/agent/fake-datalayer');

assertTrue('openapi v2', existsSync(openapiV2));
assertTrue('fixture', existsSync(fixture));

const tmp = mkdtempSync(join(tmpdir(), 'layerkit-heal-'));
const projectDir = join(tmp, '.layerkit');
// Copy fake datalayer so we can apply code into a writable tree
const moduleRoot = join(tmp, 'integrations');
cpSync(fixture, moduleRoot, { recursive: true });

const store = createVendorMemoryStore(tmp, projectDir);
store.initProject({ name: 'heal-eval', poc: true });

const baseline: VendorMapV1 = {
  schemaVersion: 1,
  vendor: 'email_fixture',
  displayName: 'Email Fixture',
  version: '1',
  auth: { type: 'bearer' },
  endpoint: { method: 'POST', path: '/emails', baseUrl: 'https://api.email-fixture.test' },
  intents: { 'notify.sendEmail': { eventName: 'notify.sendEmail' } },
  fields: [
    { domain: 'message.from.email', vendor: 'from', transform: { type: 'identity' } },
    {
      domain: 'recipient.email',
      vendor: 'to',
      transform: { type: 'processor', processorId: 'email.normalize_basic' },
    },
    { domain: 'message.subject', vendor: 'subject', transform: { type: 'identity' } },
    { domain: 'message.replyTo', vendor: 'reply_to', transform: { type: 'identity' }, optional: true },
    { domain: 'message.legacyTag', vendor: 'legacy_tag', transform: { type: 'identity' } },
  ],
  documentation: [{ title: 'v1', url: 'file://' + openapiV1 }],
  status: 'map_complete',
};
store.saveMap(baseline);

const result = runHeal({
  repoRoot: tmp,
  projectDir,
  vendor: 'email_fixture',
  openapiPath: openapiV2,
  moduleRoot,
  applyMap: true,
  applyCode: true,
  force: true,
  agentId: 'heal-gate',
});

assertEqual('mode heal', result.mode, 'heal');
assertTrue('map applied', result.mapApplied);
assertTrue('drift has reply_to', result.drift.items.some((i) => i.path === 'reply_to'));
assertTrue('integration actions created', result.integrationActionCount > 0);
assertTrue('code written directly', result.writtenCode.length > 0, JSON.stringify(result.skippedCode));
assertTrue('no PR metadata directory', !existsSync(join(projectDir, 'out', 'pr')));
assertTrue('no integrate plan markdown', !existsSync(join(projectDir, 'out', 'INTEGRATE.md')));
assertTrue('no integrate plan json', !existsSync(join(projectDir, 'out', 'integrate-plan.json')));

const map = store.loadMap('email_fixture');
assertTrue('map reloaded', map != null);
assertTrue(
  'map has reply_to field',
  (map!.fields ?? []).some((f) => f.vendor === 'reply_to'),
  JSON.stringify(map!.fields),
);
assertTrue(
  'heal preserves existing domain path',
  (map!.fields ?? []).some((f) => f.vendor === 'from' && f.domain === 'message.from.email'),
  JSON.stringify(map!.fields),
);
assertTrue(
  'heal preserves existing processor transform',
  (map!.fields ?? []).some(
    (f) =>
      f.vendor === 'to' &&
      f.domain === 'recipient.email' &&
      f.transform.type === 'processor' &&
      f.transform.processorId === 'email.normalize_basic',
  ),
  JSON.stringify(map!.fields),
);
assertTrue(
  'heal drops fields removed from OpenAPI',
  !(map!.fields ?? []).some((f) => f.vendor === 'legacy_tag'),
  JSON.stringify(map!.fields),
);
assertTrue(
  'heal updates requiredness from OpenAPI',
  (map!.fields ?? []).some(
    (f) => f.vendor === 'reply_to' && f.domain === 'message.replyTo' && f.optional !== true,
  ),
  JSON.stringify(map!.fields),
);

const writtenContent = result.writtenCode.map((p) => readFileSync(p, 'utf8')).join('\n');
assertTrue(
  'written code references contract field',
  /reply_to|buildPayload/i.test(writtenContent),
  writtenContent.slice(0, 400),
);

const mapperTmp = mkdtempSync(join(tmpdir(), 'layerkit-heal-mapper-'));
const mapperProjectDir = join(mapperTmp, '.layerkit');
const mapperModuleRoot = join(mapperTmp, 'integrations');
cpSync(fixture, mapperModuleRoot, { recursive: true });

const mapperStore = createVendorMemoryStore(mapperTmp, mapperProjectDir);
mapperStore.initProject({ name: 'heal-mapper-eval', poc: true });
mapperStore.saveMap({
  schemaVersion: 1,
  vendor: 'postmark',
  displayName: 'Postmark',
  version: '1',
  auth: { type: 'bearer' },
  endpoint: { method: 'POST', path: '/emails', baseUrl: 'https://api.postmarkapp.test' },
  intents: { 'notify.sendEmail': { eventName: 'notify.sendEmail' } },
  fields: [
    { domain: 'name', vendor: 'name', transform: { type: 'identity' } },
    { domain: 'email', vendor: 'email', transform: { type: 'identity' } },
    { domain: 'phone', vendor: 'phone', transform: { type: 'identity' } },
  ],
  documentation: [],
  status: 'map_complete',
});

const mapperOpenApi = join(mapperTmp, 'postmark-v2.openapi.json');
writeFileSync(
  mapperOpenApi,
  JSON.stringify({
    openapi: '3.0.3',
    info: { title: 'Postmark v2', version: '2.0.0' },
    servers: [{ url: 'https://api.postmarkapp.test' }],
    paths: {
      '/emails': {
        post: {
          operationId: 'sendEmail',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'email_id', 'phone_id'],
                  properties: {
                    name: { type: 'string' },
                    email_id: { type: 'string' },
                    phone_id: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'ok' } },
        },
      },
    },
  }),
  'utf8',
);

runHeal({
  repoRoot: mapperTmp,
  projectDir: mapperProjectDir,
  vendor: 'postmark',
  openapiPath: mapperOpenApi,
  moduleRoot: mapperModuleRoot,
  applyMap: true,
  agentId: 'heal-mapper-gate',
});
const mapperAdapter = readFileSync(
  join(mapperModuleRoot, 'src/main/java/com/acme/integrations/vendor/PostmarkAdapter.java'),
  'utf8',
);
assertTrue('mapper TODO written to real adapter', mapperAdapter.includes('TODO(layerkit)'), mapperAdapter);
assertTrue('mapper heal has no PR metadata directory', !existsSync(join(mapperProjectDir, 'out', 'pr')));
assertTrue('mapper heal has no integrate plan markdown', !existsSync(join(mapperProjectDir, 'out', 'INTEGRATE.md')));

console.log('heal-run-pr: ok');
