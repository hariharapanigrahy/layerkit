/**
 * Gate: proposal write CLI scaffolds — map + processor to temp JSON,
 * load, assert kind/sources/vendor, structural validate.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertEqual, assertTrue } from '../../harness/assert.js';
import type { Proposal } from '../../../libs/domain/types.js';
import {
  parseEndpointFlag,
  parseFieldFlag,
  parseIntentFlag,
  parseSourceFlag,
  scaffoldProcessorProposal,
  scaffoldVendorMapProposal,
} from '../../../libs/proposal/scaffold.js';
import { validateProposal } from '../../../libs/proposal/validate.js';
import { createVendorMemoryStore } from '../../../libs/vendor-memory/store.js';

const tmp = mkdtempSync(join(tmpdir(), 'layerkit-proposal-write-'));
try {
  const source = parseSourceFlag(
    'Events API=https://docs.example.com/api/events|event_name is required',
  );
  assertEqual('parse source title', source.title, 'Events API');
  assertEqual('parse source url', source.url, 'https://docs.example.com/api/events');
  assertTrue('parse source excerpt', source.excerpt === 'event_name is required');

  const endpoint = parseEndpointFlag('POST:/v1/events@https://api.example.com');
  assertEqual('endpoint method', endpoint.method, 'POST');
  assertEqual('endpoint path', endpoint.path, '/v1/events');
  assertEqual('endpoint base', endpoint.baseUrl, 'https://api.example.com');

  const { intent, eventName } = parseIntentFlag('purchase:Purchase');
  assertEqual('intent id', intent, 'purchase');
  assertEqual('event name', eventName, 'Purchase');

  const field = parseFieldFlag('user.email:user_data.em');
  assertEqual('field domain', field.domain, 'user.email');
  assertEqual('field vendor', field.vendor, 'user_data.em');

  // --- vendor_map scaffold + write ---
  const mapProposal = scaffoldVendorMapProposal({
    vendor: 'example_vendor',
    agentId: 'eval-agent',
    sources: [source],
    endpoint,
    intents: { [intent]: { eventName } },
    fields: [field],
  });

  assertEqual('map kind', mapProposal.kind, 'vendor_map');
  assertEqual('map vendor', mapProposal.vendor, 'example_vendor');
  assertTrue('map has sources', (mapProposal.sources?.length ?? 0) >= 1);
  assertEqual('map status draft', mapProposal.status, 'draft');
  assertTrue('map payload vendor', (mapProposal.payload as { vendor?: string }).vendor === 'example_vendor');
  assertEqual(
    'map scaffold payload remains skeleton',
    (mapProposal.payload as { status?: string }).status,
    'skeleton',
  );

  const mapPath = join(tmp, 'map-proposal.json');
  writeFileSync(mapPath, `${JSON.stringify(mapProposal, null, 2)}\n`, 'utf8');
  const mapLoaded = JSON.parse(readFileSync(mapPath, 'utf8')) as Proposal;
  assertEqual('loaded map kind', mapLoaded.kind, 'vendor_map');
  assertEqual('loaded map vendor', mapLoaded.vendor, 'example_vendor');
  assertTrue('loaded map sources', (mapLoaded.sources?.length ?? 0) >= 1);

  const mapIssues = validateProposal(mapLoaded);
  const mapErrors = mapIssues.filter((i) => i.level === 'error');
  assertTrue(
    'map validates without errors',
    mapErrors.length === 0,
    mapErrors.map((e) => `${e.code}:${e.message}`).join('; '),
  );

  // --- processor scaffold + write ---
  const procSource = parseSourceFlag(
    'PII hashing=https://docs.example.com/api/pii|Hash email with SHA256 after normalizing',
  );
  const procProposal = scaffoldProcessorProposal({
    id: 'example.email.sha256_normalized',
    description: 'Normalize email then SHA-256 hex',
    agentId: 'eval-agent',
    sources: [procSource],
    builtinOp: 'hash.sha256_hex',
  });

  assertEqual('proc kind', procProposal.kind, 'processor');
  assertEqual('proc processorId', procProposal.processorId, 'example.email.sha256_normalized');
  assertTrue('proc has sources', (procProposal.sources?.length ?? 0) >= 1);
  const procPayload = procProposal.payload as {
    id?: string;
    sources?: unknown[];
    implementation?: { type?: string; op?: string };
  };
  assertEqual('proc payload id', procPayload.id, 'example.email.sha256_normalized');
  assertTrue('proc payload sources', (procPayload.sources?.length ?? 0) >= 1);
  assertEqual('proc impl type', procPayload.implementation?.type, 'builtin');
  assertEqual('proc impl op', procPayload.implementation?.op, 'hash.sha256_hex');

  const procPath = join(tmp, 'proc-proposal.json');
  writeFileSync(procPath, `${JSON.stringify(procProposal, null, 2)}\n`, 'utf8');
  const procLoaded = JSON.parse(readFileSync(procPath, 'utf8')) as Proposal;
  assertEqual('loaded proc kind', procLoaded.kind, 'processor');
  assertTrue('loaded proc sources', (procLoaded.sources?.length ?? 0) >= 1);

  const procIssues = validateProposal(procLoaded);
  const procErrors = procIssues.filter((i) => i.level === 'error');
  assertTrue(
    'processor validates without errors',
    procErrors.length === 0,
    procErrors.map((e) => `${e.code}:${e.message}`).join('; '),
  );

  // store.reviewProposal agrees with validateProposal
  const store = createVendorMemoryStore(tmp, join(tmp, '.layerkit'));
  const mapReview = store.reviewProposal(mapLoaded);
  assertTrue('store map review valid', mapReview.valid, mapReview.errors.join('; '));
  const procReview = store.reviewProposal(procLoaded);
  assertTrue('store proc review valid', procReview.valid, procReview.errors.join('; '));

  // placeholder sources path still produces a proposal with sources[]
  const bare = scaffoldVendorMapProposal({ vendor: 'bare_vendor' });
  assertTrue('bare map has placeholder source', bare.sources.length >= 1);
  assertTrue(
    'bare map source is needs-evidence or http',
    bare.sources[0]!.url.startsWith('http'),
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log('proposal-write-cli: all checks passed');
