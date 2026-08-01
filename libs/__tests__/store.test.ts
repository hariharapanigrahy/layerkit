import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Proposal, VendorMapV1 } from '../domain/types.js';
import { createVendorMemoryStore } from '../vendor-memory/store.js';

const docs = [{ title: 'Docs', url: 'https://vendor.example/docs' }];

function map(): VendorMapV1 {
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
    payload: map(),
    sources: docs,
    authoredBy: 'agent',
    createdAt: '2026-01-01T00:00:00.000Z',
    status: 'draft',
    maker: { type: 'agent', id: 'maker' },
    checks: [],
    ...overrides,
  };
}

function withStore(fn: (store: ReturnType<typeof createVendorMemoryStore>) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'layerkit-store-unit-'));
  try {
    const store = createVendorMemoryStore(root, join(root, '.layerkit'));
    store.initProject({ name: 'unit', poc: false });
    fn(store);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('VendorMemoryStore strict rails', () => {
  it('rejects invalid proposals on submit', () => {
    withStore((store) => {
      expect(() =>
        store.submitProposal(
          proposal({
            sources: [],
          }),
        ),
      ).toThrow(/submit_invalid/);
    });
  });

  it('requires a reviewer allowlist for production approval', () => {
    withStore((store) => {
      const submitted = store.submitProposal(proposal());
      expect(() =>
        store.approveProposal(submitted.id, {
          by: { type: 'user', id: 'checker@example.com' },
          role: 'checker',
        }),
      ).toThrow(/role_allowlist_empty/);
    });
  });

  it('rolls back map writes when proposal persistence fails during apply', () => {
    withStore((store) => {
      const original = map();
      store.saveMap(original);
      const project = store.loadProject()!;
      project.security = { reviewers: [{ id: 'checker@example.com', roles: ['checker'] }] };
      store.saveProject(project);

      const ready = proposal({
        id: 'field-row',
        kind: 'field_row',
        vendor: 'vendor',
        payload: {
          domain: 'user.email',
          vendor: 'email_id',
          transform: { type: 'identity' },
        },
        status: 'ready_to_apply',
      });
      const saveProposal = store.saveProposal.bind(store);
      store.saveProposal = ((next: Proposal) => {
        if (next.status === 'applied') throw new Error('simulated write failure');
        return saveProposal(next);
      }) as typeof store.saveProposal;

      expect(() => store.applyProposal(ready)).toThrow(/simulated write failure/);
      expect(store.loadMap('vendor')?.fields).toEqual(original.fields);
    });
  });
});
