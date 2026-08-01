/**
 * Gate: heal run pins contract, applies map, builds PR package with code bodies.
 */
import { existsSync, cpSync, mkdtempSync } from 'node:fs';
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
assertTrue('pr dir exists', existsSync(result.prDir));
assertTrue('PR.md exists', existsSync(result.prBodyPath));
assertTrue('manifest exists', existsSync(result.manifestPath));
assertTrue('plan non-null', result.plan != null);
assertTrue(
  'plan has create or patch for email_fixture',
  result.plan!.actions.some(
    (a) => a.vendor === 'email_fixture' && (a.kind === 'create' || a.kind === 'patch') && a.content,
  ),
  JSON.stringify(result.plan!.actions.map((a) => a.kind + ':' + a.path)),
);
assertTrue('code written or pr files', result.writtenCode.length > 0 || existsSync(join(result.prDir, 'files')));

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

// Proposed adapter content mentions reply_to / buildPayload
const createAction = result.plan!.actions.find((a) => a.content && a.vendor === 'email_fixture');
assertTrue('has content action', createAction != null);
assertTrue(
  'content references contract field',
  /reply_to|buildPayload/i.test(createAction!.content!),
  createAction!.content!.slice(0, 400),
);

console.log('heal-run-pr: ok');
