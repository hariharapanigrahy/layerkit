/**
 * Gate: discover-domain-scan
 * Scan fixture fake-domain (TS track + Java Event) → intents/fields/sources;
 * proposal shape validates (kind domain_spec, file:// sources).
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertEqual, assertTrue } from '../../harness/assert.js';
import {
  DOMAIN_DISCOVERY_RUNBOOK_REL,
  buildDomainSpecProposal,
  scanAndWriteDomainDiscovery,
  scanDomain,
  type DomainDiscoveryResult,
  type DomainFieldHit,
  type DomainIntentHit,
  type DomainDiscoverySource,
} from '../../../libs/agent/index.js';
import { validateProposal } from '../../../libs/proposal/validate.js';
import type { DomainSpec, Proposal } from '../../../libs/domain/types.js';

const repoRoot = process.cwd();
const fixtureRoot = join(repoRoot, 'evals/fixtures/agent/fake-domain');

assertTrue('fake-domain fixture exists', existsSync(fixtureRoot), fixtureRoot);
assertTrue(
  'fake-domain has analytics.ts',
  existsSync(join(fixtureRoot, 'analytics.ts')),
  join(fixtureRoot, 'analytics.ts'),
);
assertTrue(
  'fake-domain has PurchaseEvent.java',
  existsSync(join(fixtureRoot, 'PurchaseEvent.java')),
  join(fixtureRoot, 'PurchaseEvent.java'),
);

const result: DomainDiscoveryResult = scanDomain(fixtureRoot);

assertTrue(
  'scanned at least one source file',
  result.scannedFiles.length >= 2,
  JSON.stringify(result.scannedFiles),
);

const intentIds = result.intents.map((i: DomainIntentHit) => i.id);
assertTrue(
  'intents include purchase',
  intentIds.includes('purchase'),
  JSON.stringify(intentIds),
);

const fieldPaths = result.fields.map((f: DomainFieldHit) => f.path);
assertTrue(
  'fields include user.email or email',
  fieldPaths.includes('user.email') || fieldPaths.includes('email'),
  JSON.stringify(fieldPaths),
);
assertTrue(
  'fields include orderId (from Java Event)',
  fieldPaths.includes('orderId'),
  JSON.stringify(fieldPaths),
);

assertTrue('sources non-empty', result.sources.length > 0, JSON.stringify(result.sources));
assertTrue(
  'sources reference fixture files',
  result.sources.some((s: DomainDiscoverySource) => /analytics\.ts|PurchaseEvent\.java/.test(s.file)),
  JSON.stringify(result.sources.map((s: DomainDiscoverySource) => s.file)),
);

// Proposal shape
const proposal = buildDomainSpecProposal(result, {
  id: 'fake-domain',
  createdAt: '2026-01-01T00:00:00.000Z',
});
assertEqual('kind is domain_spec', proposal.kind, 'domain_spec');
assertEqual('schemaVersion 2', proposal.schemaVersion, 2);
assertEqual('status draft', proposal.status, 'draft');
assertTrue('sources non-empty on proposal', (proposal.sources?.length ?? 0) > 0);
assertTrue(
  'all sources are file://',
  proposal.sources.every((s) => s.url.startsWith('file://')),
  JSON.stringify(proposal.sources),
);
assertTrue('summary non-empty', !!proposal.summary?.trim());
assertTrue('id non-empty', !!proposal.id?.trim());

const payload = proposal.payload as DomainSpec;
assertTrue('payload.intents is array', Array.isArray(payload.intents));
assertTrue(
  'payload intents include purchase',
  payload.intents.some((i) => i.id === 'purchase'),
  JSON.stringify(payload.intents),
);
assertTrue('payload.fields is array', Array.isArray(payload.fields));
assertTrue(
  'payload fields include user.email or email',
  payload.fields.some((f) => f.path === 'user.email' || f.path === 'email'),
  JSON.stringify(payload.fields),
);

const issues = validateProposal(proposal as Proposal);
const errors = issues.filter((i) => i.level === 'error');
assertTrue(
  'proposal validates with zero errors',
  errors.length === 0,
  errors.map((e) => `${e.code}: ${e.message}`).join('; '),
);

// Write path: memory runbook + optional proposal JSON
const tmp = mkdtempSync(join(tmpdir(), 'layerkit-discover-domain-'));
try {
  const projectDir = join(tmp, '.layerkit');
  const proposalPath = join(tmp, 'domain-spec.json');
  const { outPath, result: writtenResult, proposalPath: wroteProposal } =
    scanAndWriteDomainDiscovery({
      root: fixtureRoot,
      projectDir,
      out: 'memory',
      proposal: proposalPath,
    });
  const expected = join(projectDir, DOMAIN_DISCOVERY_RUNBOOK_REL);
  assertEqual('runbook path', outPath, expected);
  assertTrue('runbook file exists', existsSync(outPath), outPath);
  const md = readFileSync(outPath, 'utf8');
  assertTrue('runbook has Intents heading', /##\s+Intents/i.test(md), md.slice(0, 400));
  assertTrue('runbook mentions purchase', /purchase/i.test(md), md.slice(0, 400));
  assertTrue('proposal path returned', wroteProposal === proposalPath, String(wroteProposal));
  assertTrue('proposal file exists', existsSync(proposalPath), proposalPath);
  const fromDisk = JSON.parse(readFileSync(proposalPath, 'utf8')) as Proposal;
  assertEqual('disk proposal kind', fromDisk.kind, 'domain_spec');
  assertTrue(
    'disk proposal has purchase',
    (fromDisk.payload as DomainSpec).intents.some((i) => i.id === 'purchase'),
  );
  assertTrue('written scan still has intents', writtenResult.intents.length >= 1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log('discover-domain-scan: all checks passed');
