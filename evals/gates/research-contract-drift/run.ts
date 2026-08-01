/**
 * Gate: research contract pin + drift vs applied map (heal path).
 * Same research surface — not a parallel product.
 */
import { mkdtempSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertEqual, assertTrue } from '../../harness/assert.js';
import {
  diffOpenApiAgainstMap,
  pinContractEvidence,
  formatContractUpdateMarkdown,
} from '../../../libs/research/index.js';
import type { VendorMapV1 } from '../../../libs/domain/types.js';
import { setPipelineMode, loadPipelineMode, getNextStepForProject } from '../../../libs/agent/index.js';

const root = process.cwd();
const v1Path = join(root, 'evals/fixtures/openapi/contract-heal/email-v1.openapi.json');
const v2Path = join(root, 'evals/fixtures/openapi/contract-heal/email-v2.openapi.json');
assertTrue('v1 openapi fixture exists', existsSync(v1Path));
assertTrue('v2 openapi fixture exists', existsSync(v2Path));

const v1 = readFileSync(v1Path, 'utf8');
const v2 = readFileSync(v2Path, 'utf8');

const map: VendorMapV1 = {
  schemaVersion: 1,
  vendor: 'email_fixture',
  displayName: 'Email Fixture',
  version: '1',
  auth: { type: 'bearer' },
  endpoint: { method: 'POST', path: '/emails', baseUrl: 'https://api.email-fixture.test' },
  intents: { notify: { eventName: 'email.sent' } },
  fields: [
    { domain: 'from', vendor: 'from', transform: { type: 'identity' } },
    { domain: 'to', vendor: 'to', transform: { type: 'identity' } },
    { domain: 'subject', vendor: 'subject', transform: { type: 'identity' } },
    { domain: 'replyTo', vendor: 'reply_to', transform: { type: 'identity' }, optional: true },
    { domain: 'legacyTag', vendor: 'legacy_tag', transform: { type: 'identity' } },
  ],
  documentation: [{ title: 'fixture', url: 'https://api.email-fixture.test/docs' }],
};

const first = diffOpenApiAgainstMap('email_fixture', v1, null);
assertEqual('no map → not heal baseline', first.hasExistingMap, false);
assertTrue('first-time summary', first.summary.includes('First-time') || first.items.some((i) => i.kind === 'no_baseline_map'));

const aligned = diffOpenApiAgainstMap('email_fixture', v1, map);
assertEqual('v1 vs map hasExistingMap', aligned.hasExistingMap, true);

const drift = diffOpenApiAgainstMap('email_fixture', v2, map);
assertEqual('v2 vs map hasExistingMap', drift.hasExistingMap, true);
assertTrue(
  'v2 introduces reply_to as required/breaking or additive',
  drift.items.some((i) => i.path === 'reply_to' || i.detail.includes('reply_to')),
  JSON.stringify(drift.items, null, 2),
);
assertTrue(
  'v2 reports reply_to requiredness change',
  drift.items.some((i) => i.kind === 'field_required_changed' && i.path === 'reply_to'),
  JSON.stringify(drift.items, null, 2),
);
assertTrue(
  'v2 reports removed legacy field',
  drift.items.some((i) => i.kind === 'field_removed' && i.path === 'legacy_tag'),
  JSON.stringify(drift.items, null, 2),
);
assertTrue(
  'severity not none when required field added',
  drift.severity === 'breaking' || drift.severity === 'additive',
  drift.severity,
);

const tmp = mkdtempSync(join(tmpdir(), 'layerkit-contract-'));
const projectDir = join(tmp, '.layerkit');
mkdirSync(join(projectDir, 'out'), { recursive: true });
const pin = pinContractEvidence({
  projectDir,
  vendor: 'email_fixture',
  openapiPath: v2Path,
  docUrls: ['https://api.email-fixture.test/docs'],
});
assertTrue('pinned openapi exists', existsSync(pin.pinnedOpenApiPath));
assertTrue('digest non-empty', pin.digest.length >= 8);

const md = formatContractUpdateMarkdown({
  vendor: 'email_fixture',
  drift,
  pinnedOpenApiPath: pin.pinnedOpenApiPath,
  mode: 'heal',
});
assertTrue('md mentions heal', md.includes('heal'));
assertTrue('md mentions heal run', md.includes('heal run'));

setPipelineMode(projectDir, 'heal', { vendor: 'email_fixture' });
assertEqual('mode heal', loadPipelineMode(projectDir), 'heal');
const next = getNextStepForProject(projectDir);
assertEqual('next after heal is research', next?.id, 'research');

console.log('research-contract-drift: all checks passed');
