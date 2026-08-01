import { describe, expect, it } from 'vitest';
import type { DomainSpec, Proposal, VendorMapV1, VendorMapV2 } from '../domain/types.js';
import {
  parseEndpointFlag,
  parseFieldFlag,
  parseIntentFlag,
  parseSourceFlag,
  scaffoldVendorMapProposal,
} from '../proposal/scaffold.js';
import { isValidProposal, validateProposal, validateVendorMap } from '../proposal/validate.js';

const docs = [{ title: 'Docs', url: 'https://vendor.example/docs' }];

function baseMap(): VendorMapV1 {
  return {
    schemaVersion: 1,
    vendor: 'vendor',
    displayName: 'Vendor',
    version: '1',
    auth: { type: 'bearer' },
    endpoint: { method: 'POST', path: '/events', baseUrl: 'https://api.vendor.com' },
    intents: { purchase: { eventName: 'Purchase' } },
    fields: [{ domain: 'user.email', vendor: 'email' }],
    documentation: docs,
    status: 'map_complete',
  };
}

function proposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    schemaVersion: 2,
    kind: 'vendor_map',
    id: 'p1',
    summary: 'summary',
    payload: baseMap(),
    sources: docs,
    authoredBy: 'agent',
    createdAt: '2026-01-01T00:00:00.000Z',
    status: 'draft',
    ...overrides,
  };
}

describe('proposal scaffold parsers', () => {
  it('parses flags and rejects malformed input', () => {
    expect(parseSourceFlag('Docs=https://vendor.example/docs|email field')).toEqual({
      title: 'Docs',
      url: 'https://vendor.example/docs',
      excerpt: 'email field',
    });
    expect(parseEndpointFlag('post:events@https://api.vendor.com')).toEqual({
      method: 'POST',
      path: '/events',
      baseUrl: 'https://api.vendor.com',
    });
    expect(parseIntentFlag('purchase:Purchase')).toEqual({ intent: 'purchase', eventName: 'Purchase' });
    expect(parseFieldFlag('user.email:payload.email')).toEqual({
      domain: 'user.email',
      vendor: 'payload.email',
      transform: { type: 'identity' },
    });

    expect(() => parseSourceFlag('Docs=ftp://bad')).toThrow(/Invalid --source url/);
    expect(() => parseSourceFlag('Docs')).toThrow(/Invalid --source/);
    expect(() => parseSourceFlag('=https://vendor.example')).toThrow(/Invalid --source/);
    expect(() => parseEndpointFlag('TRACE:/x')).toThrow(/Invalid --endpoint method/);
    expect(() => parseEndpointFlag('POST')).toThrow(/Invalid --endpoint/);
    expect(() => parseIntentFlag('purchase')).toThrow(/Invalid --intent/);
    expect(() => parseIntentFlag('purchase:')).toThrow(/Invalid --intent/);
    expect(() => parseFieldFlag(':vendor')).toThrow(/Invalid --field/);
    expect(() => parseFieldFlag('domain:')).toThrow(/Invalid --field/);
    expect(parseEndpointFlag('PATCH:/v1/path')).toEqual({
      method: 'PATCH',
      path: '/v1/path',
      baseUrl: 'https://api.example.com',
    });
  });

  it('scaffolds skeleton and evidence-seeded map proposals', () => {
    const skeleton = scaffoldVendorMapProposal({ vendor: 'new-vendor' });
    expect(skeleton.id).toBe('map-new-vendor-v1');
    expect(skeleton.status).toBe('draft');
    expect(skeleton.sources[0]?.title).toBe('needs-evidence');
    expect((skeleton.payload as VendorMapV1).status).toBe('skeleton');

    const seeded = scaffoldVendorMapProposal({
      vendor: 'ad_glow',
      agentId: 'agent-1',
      sources: docs,
      endpoint: { method: 'POST', path: '/events', baseUrl: 'https://api.vendor.com' },
      intents: { purchase: { eventName: 'Purchase' } },
      fields: [{ domain: 'order.id', vendor: 'transaction.id' }],
    });
    expect((seeded.payload as VendorMapV1).displayName).toBe('Ad Glow');
    expect(seeded.maker).toEqual({ type: 'agent', id: 'agent-1' });
    expect(validateProposal(seeded).filter((i) => i.level === 'error')).toEqual([]);
    expect(() => scaffoldVendorMapProposal({ vendor: '   ' })).toThrow(/requires vendor/);
  });
});

describe('proposal validation', () => {
  it('validates v1 maps, domain warnings, fields, sources, and status', () => {
    const domain: DomainSpec = {
      id: 'customer',
      version: '1',
      description: 'test',
      intents: [{ id: 'signup', description: 'Signup' }],
      fields: [],
    };
    const issues = validateVendorMap(
      {
        ...baseMap(),
        vendor: '',
        endpoint: { method: 'POST', path: '/REPLACE', baseUrl: 'https://api.vendor.com' },
        intents: { purchase: {} },
        fields: [{ domain: '', vendor: '' }],
        documentation: [],
      } as VendorMapV1,
      domain,
    );
    expect(issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(['vendor_id', 'docs', 'endpoint', 'unknown_intent', 'event_name', 'field_row']),
    );

    const badProposal = validateProposal(
      proposal({
        schemaVersion: 1,
        kind: 'missing' as Proposal['kind'],
        sources: [{ title: 'Bad', url: 'notaurl' }],
        payload: undefined,
        status: 'ready_to_apply',
      }),
    );
    expect(badProposal.map((i) => i.code)).toEqual(
      expect.arrayContaining(['kind', 'source_url', 'payload', 'status']),
    );
    expect(validateProposal({ ...proposal(), id: '', kind: '' as Proposal['kind'], summary: '' }).map((i) => i.code)).toContain('meta');
    expect(validateProposal({ ...proposal(), sources: [{ title: 'Code', url: 'file://client/mapper.ts' }] }).filter((i) => i.level === 'error')).toEqual([]);
    expect(validateProposal({ ...proposal(), status: undefined }).filter((i) => i.code === 'status')).toEqual([]);
    expect(isValidProposal(proposal())).toBe(true);
    expect(isValidProposal(proposal({ sources: [] }))).toBe(false);
  });

  it('validates v2 operation bindings and maker requirements', () => {
    const map: VendorMapV2 = {
      schemaVersion: 2,
      vendor: 'vendor',
      displayName: 'Vendor',
      version: '1',
      status: 'map_complete',
      documentation: docs,
      auth: { type: 'bearer' },
      operations: {},
      intents: {
        purchase: { eventName: 'Purchase' },
        lead: { eventName: 'Lead', operationId: 'missing' },
        skip: { skip: true },
      },
      fields: [{ domain: 'user.email', vendor: 'email' }],
    };
    expect(validateVendorMap(map).map((i) => i.code)).toEqual(
      expect.arrayContaining(['operations', 'operation_id', 'operation_missing']),
    );

    const issues = validateProposal(proposal({ status: 'pending', maker: undefined, payload: map }));
    expect(issues.map((i) => i.code)).toContain('maker');
    expect(validateProposal(proposal({ schemaVersion: 3 as Proposal['schemaVersion'] })).map((i) => i.code)).toContain('schema');
    expect(
      validateProposal(proposal({ status: 'not-real' as Proposal['status'], maker: { type: 'agent', id: 'a' } })).map(
        (i) => i.code,
      ),
    ).toContain('status');

    const domain: DomainSpec = {
      id: 'customer',
      version: '1',
      description: 'test',
      intents: [{ id: 'purchase', description: 'Purchase' }],
      fields: [],
    };
    const richer: VendorMapV2 = {
      ...map,
      operations: { default: { id: 'default', endpoint: { method: 'POST', path: '/REPLACE', baseUrl: 'https://api.vendor.com' } } },
      intents: {
        purchase: { operationId: 'default' },
        unknown: { eventName: 'Unknown', operationId: 'default' },
      },
    };
    expect(validateVendorMap(richer, domain).map((i) => i.code)).toEqual(
      expect.arrayContaining(['endpoint', 'event_name', 'unknown_intent']),
    );
  });

  it('warns for empty skeleton maps without requiring endpoint details', () => {
    const emptyV1 = { ...baseMap(), status: 'skeleton', documentation: docs, intents: {}, fields: [] } as VendorMapV1;
    expect(validateVendorMap(emptyV1).map((i) => i.code)).toContain('empty_map');
    const emptyV2: VendorMapV2 = {
      schemaVersion: 2,
      vendor: 'vendor',
      displayName: 'Vendor',
      version: '1',
      status: 'skeleton',
      documentation: docs,
      auth: { type: 'bearer' },
      operations: {},
      intents: {},
      fields: [],
    };
    expect(validateVendorMap(emptyV2).map((i) => i.code)).toContain('empty_map');
  });
});
