/**
 * Gate: doctor secret-leak heuristics.
 * - High-entropy strings on fail-paths (auth, headers, staticFields) → error
 * - SecretRef shapes ignored
 * - documentation/sources URLs allowlisted
 * - AuthType includes mtls | signed_payload
 * - doctor prints projectDir
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertEqual, assertTrue } from '../../harness/assert.js';
import type { AuthType, Proposal, VendorMapV1, VendorMapV2 } from '../../../libs/domain/types.js';
import {
  isHighEntropyString,
  isSecretRef,
  scanJsonForSecrets,
  scanSourceForSecretLiterals,
} from '../../../libs/doctor/index.js';
import { createVendorMemoryStore } from '../../../libs/vendor-memory/store.js';

// --- unit: entropy + SecretRef ---
const TOKEN = ['sk', 'live', '4eC39HqLyjWDarjtT1zdp7dc', 'AbCdEfGhIjKlMn'].join('_');
assertTrue('high-entropy token detected', isHighEntropyString(TOKEN));
assertTrue(
  'short label not high-entropy',
  !isHighEntropyString('bearer'),
);
assertTrue(
  'URL not high-entropy for scan purposes',
  !isHighEntropyString('https://docs.example.com/api/events'),
);
assertTrue(
  'SecretRef shape recognized',
  isSecretRef({ provider: 'env', name: 'META_CAPI_TOKEN' }),
);
assertTrue(
  'plain object not SecretRef',
  !isSecretRef({ type: 'bearer', token: TOKEN }),
);

// AuthType extensions present at type level (runtime check via assignable values)
const authTypes: AuthType[] = [
  'bearer',
  'api_key',
  'basic',
  'oauth2_client_credentials',
  'custom',
  'signed_payload',
  'mtls',
];
assertEqual('AuthType includes mtls + signed_payload', authTypes.includes('mtls'), true);
assertEqual('AuthType includes signed_payload', authTypes.includes('signed_payload'), true);

// --- scan: raw auth-ish secret on fail path ---
const leakyMap: VendorMapV1 = {
  schemaVersion: 1,
  vendor: 'leaky',
  displayName: 'Leaky',
  version: '1.0.0',
  auth: { type: 'bearer', notes: TOKEN },
  endpoint: { method: 'POST', path: '/events', baseUrl: 'https://example.com' },
  intents: {
    purchase: {
      eventName: 'Purchase',
      staticFields: { access_token: TOKEN },
    },
  },
  fields: [],
  documentation: [
    {
      title: 'Docs',
      url: 'https://developers.example.com/docs/very-long-path-that-is-not-a-secret-at-all',
    },
  ],
  status: 'map_complete',
};

const leakFindings = scanJsonForSecrets(leakyMap);
assertTrue(
  'flags staticFields token',
  leakFindings.some(
    (f) => f.level === 'error' && f.path.includes('staticFields') && f.path.includes('access_token'),
  ),
  JSON.stringify(leakFindings),
);
assertTrue(
  'does not flag documentation URL',
  !leakFindings.some((f) => f.path.includes('documentation') && f.path.includes('url')),
  JSON.stringify(leakFindings),
);

// --- scan: SecretRef safe ---
const safeMap: VendorMapV2 = {
  schemaVersion: 2,
  vendor: 'safe',
  displayName: 'Safe',
  version: '1.0.0',
  status: 'map_complete',
  documentation: [
    {
      title: 'Docs',
      url: 'https://developers.example.com/docs/marketing-api/conversions-api',
    },
  ],
  auth: {
    type: 'bearer',
    secretRef: { provider: 'env', name: 'VENDOR_TOKEN' },
  },
  operations: {
    default: {
      id: 'default',
      endpoint: { method: 'POST', path: '/events', baseUrl: 'https://example.com' },
      headers: {
        Authorization: { secretRef: { provider: 'env', name: 'VENDOR_TOKEN' } },
      },
    },
  },
  intents: {
    purchase: { operationId: 'default', eventName: 'Purchase' },
  },
  fields: [],
};

const safeFindings = scanJsonForSecrets(safeMap);
assertTrue(
  'SecretRef map has no secret errors',
  safeFindings.filter((f) => f.level === 'error').length === 0,
  JSON.stringify(safeFindings),
);

const sourceFindings = scanSourceForSecretLiterals(
  [
    'const token = process.env.VENDOR_TOKEN;',
    `const leaky = "${TOKEN}";`,
  ].join('\n'),
  'client-adapter.ts',
);
assertTrue(
  'source string literal token is blocked',
  sourceFindings.some((f) => f.level === 'error' && f.path === 'client-adapter.ts:2'),
  JSON.stringify(sourceFindings),
);
assertTrue(
  'env token source is allowed',
  scanSourceForSecretLiterals('const token = process.env.VENDOR_TOKEN;', 'client-adapter.ts').length === 0,
);

const repoSourceFindings = scanRepoForSecretLiterals(process.cwd());
assertTrue(
  'repo source has no hardcoded secret literals',
  repoSourceFindings.length === 0,
  JSON.stringify(repoSourceFindings.slice(0, 5)),
);

// --- doctor integration ---
const root = mkdtempSync(join(tmpdir(), 'layerkit-doctor-secret-'));
const projectDir = join(root, '.layerkit');
try {
  const store = createVendorMemoryStore(root, projectDir);
  store.initProject({ name: 'doctor-secret-eval', poc: false });
  store.saveMap(leakyMap);
  store.saveMap(safeMap);

  const proposal: Proposal = {
    schemaVersion: 2,
    kind: 'vendor_map',
    id: 'prop-leaky',
    summary: 'leaky proposal',
    payload: {
      vendor: 'from-proposal',
      auth: { type: 'api_key', notes: TOKEN },
      staticFields: { key: TOKEN },
    },
    sources: [{ title: 's', url: 'https://example.com/docs' }],
    authoredBy: 'agent',
    createdAt: '2026-01-01T00:00:00.000Z',
    status: 'draft',
  };
  store.saveProposal(proposal);

  const doc = store.doctor();
  assertTrue(
    'doctor prints projectDir',
    doc.lines.some((l) => l.startsWith('projectDir:') && l.includes('.layerkit')),
    doc.lines.join('\n'),
  );
  assertTrue(
    'doctor not ok when secret_leak present',
    doc.ok === false,
    doc.lines.join('\n'),
  );
  assertTrue(
    'doctor mentions secret_leak or Secret scan',
    doc.lines.some((l) => /secret_leak|Secret scan/i.test(l)),
    doc.lines.join('\n'),
  );
  assertTrue(
    'doctor secretFindings include errors',
    (doc.secretFindings ?? []).some((f) => f.level === 'error'),
    JSON.stringify(doc.secretFindings),
  );

  console.log('doctor-secret-scan: all checks passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}

function scanRepoForSecretLiterals(repoRoot: string) {
  const findings = [];
  for (const file of walkFiles(repoRoot)) {
    findings.push(
      ...scanSourceForSecretLiterals(
        readFileSync(file, 'utf8'),
        file.slice(repoRoot.length + 1),
      ),
    );
  }
  return findings;
}

function walkFiles(root: string): string[] {
  const out: string[] = [];
  const skipDirs = new Set(['.git', 'dist', 'node_modules', 'coverage']);
  const exts = new Set(['.ts', '.js', '.mjs', '.md', '.json']);
  visit(root);
  return out;

  function visit(dir: string): void {
    for (const entry of readdirSync(dir)) {
      if (skipDirs.has(entry)) continue;
      const path = join(dir, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        if (path.includes('/evals/fixtures/')) continue;
        visit(path);
        continue;
      }
      if (path.endsWith('package-lock.json')) continue;
      const dot = entry.lastIndexOf('.');
      if (dot < 0 || !exts.has(entry.slice(dot))) continue;
      if (existsSync(path)) out.push(path);
    }
  }
}
