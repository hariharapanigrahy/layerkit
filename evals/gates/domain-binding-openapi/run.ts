/**
 * Gate: generic domain binding — OpenAPI evidence + convention, no vendor hardcoding.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertEqual, assertTrue } from '../../harness/assert.js';
import {
  DEFAULT_DOMAIN_BINDING,
  loadDomainBinding,
  resolveIntentsFromOpenApi,
  writeDomainBinding,
} from '../../../libs/agent/domain-binding.js';
import { parseOpenAPI } from '../../../libs/research/index.js';
import { scaffoldVendorMapFromOpenApi } from '../../../libs/proposal/scaffold.js';
import { isVendorMapV2 } from '../../../libs/domain/types.js';

const root = process.cwd();
const fixture = join(root, 'evals/fixtures/openapi/notify-with-domain-ext.json');
const raw = readFileSync(fixture, 'utf8');
const parsed = parseOpenAPI(raw);

assertTrue('fixture has 2 operations', parsed.operations.length === 2);
assertTrue(
  'opaque x-acme-domain-op preserved',
  parsed.operations[0]?.extensions?.['x-acme-domain-op'] === 'notify.send',
  JSON.stringify(parsed.operations[0]?.extensions),
);
assertTrue(
  'body fields include to',
  (parsed.operations[0]?.bodyFields ?? []).some((f) => f.name === 'to'),
);

// Default convention: accept any x-*-domain-op
const resolved = resolveIntentsFromOpenApi(parsed, DEFAULT_DOMAIN_BINDING);
assertEqual('first intent from x-acme-domain-op', resolved[0]?.intentId, 'notify.send');
assertEqual('first source openapi_extension', resolved[0]?.source, 'openapi_extension');
assertEqual('second intent from x-other-domain-op', resolved[1]?.intentId, 'notify.get');

// Convention with only exact key — still works via acceptXStarDomainOp
const exactOnly = {
  ...DEFAULT_DOMAIN_BINDING,
  openapiExtensionKeys: ['x-domain-op'],
  acceptXStarDomainOp: true,
};
assertEqual(
  'exact key empty still matches star',
  resolveIntentsFromOpenApi(parsed, exactOnly)[0]?.intentId,
  'notify.send',
);

// Disable star — fall back to operationId
const noStar = {
  ...DEFAULT_DOMAIN_BINDING,
  openapiExtensionKeys: [],
  acceptXStarDomainOp: false,
  intentFrom: ['openapi_extension', 'operationId'] as const,
};
assertEqual(
  'no star → operationId',
  resolveIntentsFromOpenApi(parsed, { ...noStar, intentFrom: [...noStar.intentFrom] })[0]
    ?.intentId,
  'sendMessage',
);

// Scaffold map from openapi (v2 multi-op)
const proposal = scaffoldVendorMapFromOpenApi({
  vendor: 'example_notify',
  openapiContent: raw,
  openapiRef: fixture,
  convention: DEFAULT_DOMAIN_BINDING,
});
assertEqual('proposal kind', proposal.kind, 'vendor_map');
const payload = proposal.payload as Record<string, unknown>;
assertTrue('v2 multi-op map', isVendorMapV2(payload as never) || payload.schemaVersion === 2);
assertEqual('openapi scaffold remains skeleton', payload.status, 'skeleton');
assertTrue(
  'intent notify.send present',
  !!(payload.intents as Record<string, unknown>)?.['notify.send'],
);

// Project convention write/load round-trip
const tmp = mkdtempSync(join(tmpdir(), 'layerkit-domain-bind-'));
try {
  const written = writeDomainBinding(tmp, {
    ...DEFAULT_DOMAIN_BINDING,
    openapiExtensionKeys: ['x-custom-intent'],
  });
  assertTrue('wrote convention file', written.includes('domain-binding.json'));
  const loaded = loadDomainBinding(tmp);
  assertEqual('loaded custom key', loaded.openapiExtensionKeys[0], 'x-custom-intent');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log('domain-binding-openapi: all checks passed');
