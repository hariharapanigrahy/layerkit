import { describe, expect, it } from 'vitest';
import type { Proposal, VendorMapV1, VendorMapV2 } from '../domain/types.js';
import {
  assertNoHallucinationIssues,
  detectHallucinationIssues,
  hasHallucinationErrors,
} from '../hallucination/index.js';
import {
  formatSecretFindings,
  isHighEntropyString,
  isSecretRef,
  scanJsonForSecrets,
  scanSourceForSecretLiterals,
} from '../doctor/index.js';

const token = ['sk', 'live', '4eC39HqLyjWDarjtT1zdp7dc', 'AbCdEfGhIjKlMn'].join('_');

function proposal(payload: unknown, sources = [{ title: 'Docs', url: 'https://vendor.example/docs' }]): Proposal {
  return {
    schemaVersion: 2,
    kind: 'vendor_map',
    id: 'p',
    summary: 'summary',
    payload,
    sources,
    authoredBy: 'agent',
    createdAt: '2026-01-01T00:00:00.000Z',
    status: 'draft',
  };
}

describe('hallucination guards', () => {
  it('flags placeholder sources, endpoints, fields, and example hosts', () => {
    const map: VendorMapV1 = {
      schemaVersion: 1,
      vendor: 'vendor',
      displayName: 'Vendor',
      version: '1',
      auth: { type: 'bearer' },
      endpoint: { method: 'POST', path: '/REPLACE', baseUrl: 'https://api.example.com' },
      intents: { purchase: { eventName: 'Purchase' } },
      fields: [{ domain: 'user.email', vendor: 'unknown.email' }],
      documentation: [{ title: 'Docs', url: 'https://example.com/docs' }],
      status: 'map_complete',
    };
    const report = detectHallucinationIssues(proposal(map, [{ title: 'Bad', url: 'https://your-api.com/docs' }]));
    expect(report.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(['placeholder_source_url', 'example_host', 'placeholder_endpoint_path', 'invent_field_path']),
    );
    expect(hasHallucinationErrors(report)).toBe(true);
    expect(() => assertNoHallucinationIssues(proposal(map))).toThrow(/hallucination_blocked/);
  });

  it('allows skeleton maps and scans v2 operations', () => {
    const skeleton: VendorMapV1 = {
      schemaVersion: 1,
      vendor: 'vendor',
      displayName: 'Vendor',
      version: '1',
      auth: { type: 'bearer' },
      endpoint: { method: 'POST', path: '/REPLACE', baseUrl: 'https://api.example.com' },
      intents: {},
      fields: [],
      documentation: [],
      status: 'skeleton',
    };
    expect(detectHallucinationIssues(proposal(skeleton)).issues.some((i) => i.code === 'empty_documentation')).toBe(false);

    const v2: VendorMapV2 = {
      schemaVersion: 2,
      vendor: 'vendor',
      displayName: 'Vendor',
      version: '1',
      status: 'map_complete',
      documentation: [{ title: 'Docs', url: 'file://client/code.ts' }],
      auth: { type: 'bearer' },
      endpoint: { method: 'POST', path: '/events', baseUrl: 'not-a-url' },
      operations: { default: { id: 'default', endpoint: { method: 'POST', path: '/path', baseUrl: 'https://localhost' } } },
      intents: { purchase: { operationId: 'default', eventName: 'Purchase' } },
      fields: [],
    };
    expect(detectHallucinationIssues(proposal(v2)).issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(['placeholder_endpoint_path', 'placeholder_base_url']),
    );
  });

  it('handles missing sources, non-map payloads, invalid urls, and strict warnings', () => {
    expect(detectHallucinationIssues(proposal({}, [])).issues.map((i) => i.code)).toContain('empty_sources');
    expect(detectHallucinationIssues({ ...proposal('text'), kind: 'auth' }).issues).toHaveLength(0);
    expect(detectHallucinationIssues(proposal({}, [{ title: 'Bad', url: '' }])).issues[0]?.code).toBe('placeholder_source_url');
    expect(detectHallucinationIssues(proposal({}, [{ title: 'Bad', url: 'not-a-url' }])).issues[0]?.code).toBe('placeholder_source_url');
    expect(detectHallucinationIssues(proposal({}, [{ title: 'Code', url: 'file://client/mapper.ts' }]))).toEqual({ issues: [] });

    const warnOnly = proposal(
      {
        schemaVersion: 1,
        vendor: 'vendor',
        displayName: 'Vendor',
        version: '1',
        auth: { type: 'bearer' },
        endpoint: { method: 'POST', path: '/events', baseUrl: 'https://api.example.com' },
        intents: { purchase: { eventName: 'Purchase' } },
        fields: [{ domain: 'user.email', vendor: 'email' }],
        documentation: [{ title: 'Docs', url: 'https://example.com/docs' }],
        status: 'map_complete',
      } as VendorMapV1,
      [{ title: 'Docs', url: 'https://example.com/docs' }],
    );
    expect(hasHallucinationErrors(detectHallucinationIssues(warnOnly))).toBe(false);
    expect(() => assertNoHallucinationIssues(warnOnly)).not.toThrow();
    expect(() => assertNoHallucinationIssues(warnOnly, { strict: true })).toThrow(/example_host/);
  });

  it('covers placeholder marker variants and non-empty maps without documentation', () => {
    const map: VendorMapV1 = {
      schemaVersion: 1,
      vendor: 'vendor',
      displayName: 'Vendor',
      version: '1',
      auth: { type: 'bearer' },
      endpoint: { method: 'POST', path: '/placeholder', baseUrl: 'https://YOUR_API.example' },
      intents: { purchase: { eventName: 'Purchase' } },
      fields: [{ domain: 'user.email', vendor: 'invent_email' }],
      documentation: [],
      status: 'map_complete',
    };
    expect(detectHallucinationIssues(proposal(map)).issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(['empty_documentation', 'placeholder_endpoint_path', 'placeholder_base_url', 'invent_field_path']),
    );

    const baseUrls = ['example-vendor.com', 'https://api.example', 'https://127.0.0.1', 'https://0.0.0.0'];
    for (const baseUrl of baseUrls) {
      const issues = detectHallucinationIssues(
        proposal({ ...map, documentation: [{ title: 'Docs', url: 'https://vendor.example/docs' }], endpoint: { ...map.endpoint, path: '/events', baseUrl } }),
      ).issues;
      expect(issues.some((i) => i.code === 'placeholder_base_url')).toBe(true);
    }

    const sourceUrls = ['https://vendor.example/TODO', 'https://example-vendor.com/docs', 'https://api.example/docs'];
    for (const url of sourceUrls) {
      expect(detectHallucinationIssues(proposal({}, [{ title: 'Docs', url }])).issues[0]?.code).toBe('placeholder_source_url');
    }
  });
});

describe('secret scanner', () => {
  it('classifies SecretRef, entropy, allowlists, warnings, and errors', () => {
    expect(isSecretRef({ provider: 'env', name: 'TOKEN' })).toBe(true);
    expect(isSecretRef(null)).toBe(false);
    expect(isSecretRef(['env', 'TOKEN'])).toBe(false);
    expect(isSecretRef({ provider: 'bad', name: 'TOKEN' })).toBe(false);
    expect(isHighEntropyString(token)).toBe(true);
    expect(isHighEntropyString('Bearer token docs text with many normal words')).toBe(false);
    expect(isHighEntropyString('https://vendor.example/really/long/path')).toBe(false);

    const findings = scanJsonForSecrets({
      auth: { token },
      notes: token,
      documentation: [{ url: 'https://vendor.example/docs/abcdef0123456789abcdef0123456789' }],
      headers: { Authorization: { secretRef: { provider: 'env', name: 'TOKEN' } }, Other: token },
      fields: [{ transform: { value: token } }],
    });
    expect(findings.filter((f) => f.level === 'error').map((f) => f.path)).toEqual(
      expect.arrayContaining(['auth.token', 'headers.Other', 'fields[0].transform.value']),
    );
    expect(findings.some((f) => f.level === 'warn' && f.path === 'notes')).toBe(true);
    expect(formatSecretFindings(findings, 'map:vendor').join('\n')).toContain('secret_leak');
    expect(scanJsonForSecrets([null, 'short', { loose: token }]).some((f) => f.path === '[2].loose')).toBe(true);
    expect(scanJsonForSecrets({ provider: 'env', name: 'TOKEN' })).toEqual([]);
    expect(scanJsonForSecrets({ secretRef: { provider: 'env', name: 'TOKEN' }, token })).toHaveLength(1);
    expect(scanJsonForSecrets({ wrapped: { secretRef: { provider: 'env', name: 'TOKEN' }, note: token } })).toHaveLength(1);
    expect(isHighEntropyString('abcdef0123456789abcdef0123456789')).toBe(true);
    expect(isHighEntropyString('Abcdefghijklmnopqrstuvwx1234567890')).toBe(true);
    expect(isHighEntropyString('Abcdefghijklmnopqrstuvwx1234567890!')).toBe(true);
    expect(isHighEntropyString('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1')).toBe(true);
    expect(isHighEntropyString('abc')).toBe(false);
    expect(scanJsonForSecrets({ payload: { implementationHint: token, sources: [{ excerpt: token }] } })).toEqual([]);
    expect(scanJsonForSecrets({ short: 'abcdefghijklmnopqrstuvwx' })).toEqual([]);
    expect(scanJsonForSecrets(null)).toEqual([]);
    expect(scanJsonForSecrets({ loose: 'Abcdefghijklmnopqrstuvwx1234567890!' })[0]?.level).toBe('warn');
    expect(
      scanJsonForSecrets({
        method: token,
        path: token,
        baseUrl: token,
        vendor: token,
        domain: token,
        eventName: token,
        id: token,
        kind: token,
        type: token,
        status: token,
        version: token,
        createdAt: token,
        processorId: token,
        authoredBy: token,
        provider: token,
        name: token,
      }),
    ).toEqual([]);

    expect(scanSourceForSecretLiterals(`const token = "${token}";`, 'client.ts')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: 'error', path: 'client.ts:1' }),
      ]),
    );
    expect(scanSourceForSecretLiterals('const token = process.env.VENDOR_TOKEN;', 'client.ts')).toEqual([]);
  });
});
