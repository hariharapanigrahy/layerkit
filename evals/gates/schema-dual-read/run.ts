/**
 * Gate: dual-schema proposal validation (schemaVersion 1|2).
 * v1 fixtures never hard-fail on version alone; sources still required.
 * Also covers validateVendorMap v2 operations/operationId rules.
 */
import { assertTrue } from '../../harness/assert.js';
import { COMMERCE_DOMAIN } from '../../../libs/domain/commerce.js';
import type { Proposal, VendorMapV2 } from '../../../libs/domain/types.js';
import { validateProposal, validateVendorMap } from '../../../libs/proposal/validate.js';

const exampleDocs = [
  {
    title: 'Example Events API',
    url: 'https://docs.example.com/api/events',
  },
];

const v1Payload = {
  vendor: 'example_vendor',
  displayName: 'Example',
  version: '1',
  auth: { type: 'bearer' as const },
  endpoint: { method: 'POST' as const, path: '/events', baseUrl: 'https://api.example.com' },
  intents: { purchase: { eventName: 'purchase' } },
  fields: [{ domain: 'eventId', vendor: 'event_id', transform: { type: 'identity' as const } }],
  documentation: exampleDocs,
};

const baseV1: Proposal = {
  schemaVersion: 1,
  kind: 'vendor_map',
  id: 'dual-v1',
  summary: 'v1 proposal',
  payload: v1Payload,
  sources: exampleDocs,
  authoredBy: 'agent',
  createdAt: '2026-01-01T00:00:00.000Z',
  status: 'pending',
};

// 1) Explicit v1 validates
{
  const issues = validateProposal(baseV1);
  assertTrue(
    'v1 schemaVersion accepted',
    !issues.some((i) => i.code === 'schema' && i.level === 'error'),
    issues.map((i) => i.message).join('; '),
  );
  assertTrue(
    'v1 proposal has no errors',
    issues.filter((i) => i.level === 'error').length === 0,
    issues.map((i) => i.message).join('; '),
  );
}

// 2) Missing schemaVersion ≡ 1
{
  const { schemaVersion: _sv, ...rest } = baseV1;
  const missing = rest as Proposal;
  const issues = validateProposal(missing);
  assertTrue(
    'missing schemaVersion treated as v1 (no schema error)',
    !issues.some((i) => i.code === 'schema' && i.level === 'error'),
  );
  assertTrue(
    'missing schemaVersion still valid structurally',
    issues.filter((i) => i.level === 'error').length === 0,
    issues.map((i) => i.message).join('; '),
  );
}

// 3) v2 with extended status + maker validates
{
  const v2: Proposal = {
    ...baseV1,
    schemaVersion: 2,
    id: 'dual-v2',
    status: 'ready_to_apply',
    maker: { type: 'agent', id: 'eval-agent' },
    requiresPrivacyReview: false,
    checks: [
      {
        at: '2026-01-01T00:00:00.000Z',
        by: { type: 'user', id: 'alice@co.com' },
        role: 'checker',
        decision: 'approve',
      },
    ],
  };
  const issues = validateProposal(v2);
  assertTrue(
    'v2 schemaVersion accepted',
    !issues.some((i) => i.code === 'schema' && i.level === 'error'),
  );
  assertTrue(
    'v2 ready_to_apply with maker has no errors',
    issues.filter((i) => i.level === 'error').length === 0,
    issues.map((i) => i.message).join('; '),
  );
}

// 4) v2 draft without maker is ok
{
  const draft: Proposal = {
    ...baseV1,
    schemaVersion: 2,
    id: 'dual-v2-draft',
    status: 'draft',
  };
  const issues = validateProposal(draft);
  assertTrue(
    'v2 draft without maker ok',
    !issues.some((i) => i.code === 'maker' && i.level === 'error'),
  );
}

// 5) v2 non-draft without maker fails
{
  const noMaker: Proposal = {
    ...baseV1,
    schemaVersion: 2,
    id: 'dual-v2-no-maker',
    status: 'pending',
  };
  const issues = validateProposal(noMaker);
  assertTrue(
    'v2 pending without maker errors',
    issues.some((i) => i.code === 'maker' && i.level === 'error'),
  );
}

// 6) Invalid schemaVersion 3 fails
{
  const bad = { ...baseV1, schemaVersion: 3 as unknown as 1 };
  const issues = validateProposal(bad as Proposal);
  assertTrue(
    'schemaVersion 3 rejected',
    issues.some((i) => i.code === 'schema' && i.level === 'error'),
  );
}

// 7) sources still required for both versions
{
  const noSrcV1: Proposal = { ...baseV1, sources: [] };
  const noSrcV2: Proposal = {
    ...baseV1,
    schemaVersion: 2,
    status: 'draft',
    sources: [],
  };
  assertTrue(
    'v1 empty sources error',
    validateProposal(noSrcV1).some((i) => i.code === 'sources' && i.level === 'error'),
  );
  assertTrue(
    'v2 empty sources error',
    validateProposal(noSrcV2).some((i) => i.code === 'sources' && i.level === 'error'),
  );
}

// 8) v1 status set rejects v2-only statuses
{
  const badStatus: Proposal = {
    ...baseV1,
    schemaVersion: 1,
    status: 'ready_to_apply',
  };
  assertTrue(
    'v1 rejects ready_to_apply status',
    validateProposal(badStatus).some((i) => i.code === 'status' && i.level === 'error'),
  );
}

// 9) Extended kinds accepted
{
  const flowKind: Proposal = {
    schemaVersion: 2,
    kind: 'privacy_policy',
    id: 'pp-1',
    summary: 'privacy policy',
    payload: { id: 'default', defaultAction: 'deny', rules: [] },
    sources: exampleDocs,
    authoredBy: 'human',
    createdAt: '2026-01-01T00:00:00.000Z',
    status: 'draft',
  };
  const issues = validateProposal(flowKind);
  assertTrue(
    'extended kind privacy_policy accepted',
    !issues.some((i) => i.code === 'kind' && i.level === 'error'),
  );
}

// 10) Commerce domain includes products[] (smoke)
{
  assertTrue(
    'commerce has products field',
    COMMERCE_DOMAIN.fields.some((f) => f.path === 'products'),
  );
  assertTrue(
    'commerce version 1.1.0',
    COMMERCE_DOMAIN.version === '1.1.0',
  );
}

// 11) validateVendorMap v2: valid map with operationId
{
  const validV2: VendorMapV2 = {
    schemaVersion: 2,
    vendor: 'example_vendor',
    displayName: 'Example',
    version: '1.0.0',
    status: 'map_complete',
    documentation: exampleDocs,
    auth: { type: 'bearer' },
    operations: {
      default: {
        id: 'default',
        endpoint: { method: 'POST', path: '/events', baseUrl: 'https://example.com' },
      },
    },
    intents: {
      purchase: { operationId: 'default', eventName: 'Purchase' },
      lead: { skip: true },
    },
    fields: [{ domain: 'eventId', vendor: 'event_id', transform: { type: 'identity' } }],
  };
  const issues = validateVendorMap(validV2);
  assertTrue(
    'v2 map with operationId has no errors',
    issues.filter((i) => i.level === 'error').length === 0,
    issues.map((i) => i.message).join('; '),
  );
}

// 12) missing operationId on non-skip intent → operation_id
{
  const missingOp: VendorMapV2 = {
    schemaVersion: 2,
    vendor: 'example_vendor',
    displayName: 'Example',
    version: '1.0.0',
    status: 'map_complete',
    documentation: exampleDocs,
    auth: { type: 'bearer' },
    operations: {
      default: {
        id: 'default',
        endpoint: { method: 'POST', path: '/events', baseUrl: 'https://example.com' },
      },
    },
    intents: {
      purchase: { eventName: 'Purchase' },
    },
    fields: [{ domain: 'eventId', vendor: 'event_id', transform: { type: 'identity' } }],
  };
  const issues = validateVendorMap(missingOp);
  assertTrue(
    'v2 missing operationId → operation_id',
    issues.some((i) => i.code === 'operation_id' && i.level === 'error'),
  );
}

// 13) unknown operationId → operation_missing
{
  const badOp: VendorMapV2 = {
    schemaVersion: 2,
    vendor: 'example_vendor',
    displayName: 'Example',
    version: '1.0.0',
    status: 'map_complete',
    documentation: exampleDocs,
    auth: { type: 'bearer' },
    operations: {
      default: {
        id: 'default',
        endpoint: { method: 'POST', path: '/events', baseUrl: 'https://example.com' },
      },
    },
    intents: {
      purchase: { operationId: 'not_a_real_op', eventName: 'Purchase' },
    },
    fields: [{ domain: 'eventId', vendor: 'event_id', transform: { type: 'identity' } }],
  };
  const issues = validateVendorMap(badOp);
  assertTrue(
    'v2 unknown operationId → operation_missing',
    issues.some((i) => i.code === 'operation_missing' && i.level === 'error'),
  );
}

// 14) empty operations on non-empty map → operations
{
  const emptyOps: VendorMapV2 = {
    schemaVersion: 2,
    vendor: 'example_vendor',
    displayName: 'Example',
    version: '1.0.0',
    status: 'map_complete',
    documentation: exampleDocs,
    auth: { type: 'bearer' },
    operations: {},
    intents: {
      purchase: { operationId: 'default', eventName: 'Purchase' },
    },
    fields: [{ domain: 'eventId', vendor: 'event_id', transform: { type: 'identity' } }],
  };
  const issues = validateVendorMap(emptyOps);
  assertTrue(
    'v2 empty operations → operations error',
    issues.some((i) => i.code === 'operations' && i.level === 'error'),
  );
}

console.log('schema-dual-read: all checks passed');
