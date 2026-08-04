/**
 * Gate: skill packet write + evidence content fail-closed.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertEqual, assertTrue } from '../../harness/assert.js';
import {
  assertEvidenceForStep,
  buildSkillPacket,
  MIN_EVIDENCE_BYTES,
  setPipelineMode,
  writeSkillPacket,
  assertSkillPacketForMarkDone,
  requirePipelineStarted,
  SKILL_PACKET_REL,
} from '../../../libs/agent/index.js';

const root = mkdtempSync(join(tmpdir(), 'layerkit-skill-packet-'));
const projectDir = join(root, '.layerkit');

try {
  let blocked = false;
  try {
    requirePipelineStarted(projectDir);
  } catch (e) {
    blocked = String(e).includes('pipeline_not_started');
  }
  assertTrue('next/mark-done blocked without start', blocked);

  setPipelineMode(projectDir, 'full', { vendor: 'stripe' });
  requirePipelineStarted(projectDir);

  const built = buildSkillPacket(projectDir);
  assertTrue('packet for discover', built != null && built.step.id === 'discover');
  assertTrue('packet names discover skill', built!.markdown.includes('layerkit-discover-data-layer'));
  assertTrue('packet forbids freestyle', /Forbidden|freestyle/i.test(built!.markdown));

  const path = writeSkillPacket(projectDir);
  assertTrue('packet file written', path != null && path.includes(SKILL_PACKET_REL));
  const body = readFileSync(path!, 'utf8');
  assertTrue('packet on disk has skill', body.includes('skill: layerkit-discover-data-layer'));

  // thin evidence rejected
  let thin = false;
  try {
    assertEvidenceForStep('discover', ['x'], () => 'short');
  } catch (e) {
    thin = String(e).includes('evidence_too_thin');
  }
  assertTrue('thin evidence rejected', thin);

  // wrong content rejected
  const pad = 'x'.repeat(MIN_EVIDENCE_BYTES + 5);
  let mismatch = false;
  try {
    assertEvidenceForStep('research', ['r.md'], () => pad);
  } catch (e) {
    mismatch = String(e).includes('evidence_content_mismatch');
  }
  assertTrue('research without url/drift rejected', mismatch);

  // good research evidence
  assertEvidenceForStep(
    'research',
    ['r.md'],
    () =>
      `${pad}\nhttps://docs.stripe.com/changelog drift residual severity none\n`,
  );

  // mark-done without packet fails
  let noPacket = false;
  try {
    assertSkillPacketForMarkDone(projectDir, 'research');
  } catch (e) {
    noPacket = String(e).includes('skill_packet_step_mismatch') || String(e).includes('skill_packet_required');
  }
  // packet is for discover; research should mismatch
  noPacket = false;
  try {
    assertSkillPacketForMarkDone(projectDir, 'research');
  } catch (e) {
    noPacket = String(e).includes('skill_packet_step_mismatch');
  }
  assertTrue('packet step mismatch for research while on discover', noPacket);
  assertSkillPacketForMarkDone(projectDir, 'discover');

  assertEqual('min evidence bytes constant', MIN_EVIDENCE_BYTES >= 40, true);

  // Terminal rails (generic any package): extend existing evidence checks — no new module.
  const fat = 'x'.repeat(MIN_EVIDENCE_BYTES);
  const pkgRoot = join(root, 'pkg');
  mkdirSync(join(pkgRoot, 'src', 'integrations'), { recursive: true });
  mkdirSync(join(pkgRoot, 'memory', 'runbooks'), { recursive: true });
  writeFileSync(join(pkgRoot, 'src', 'integrations', 'stripe.ts'), 'export const x = 1;\n');
  writeFileSync(join(pkgRoot, 'src', 'integrations', 'stripe.js'), 'export const x = 1;\n');
  writeFileSync(
    join(pkgRoot, 'memory', 'runbooks', 'surface-inventory.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        package: 'test/pkg',
        languages: [
          {
            id: 'node',
            roots: ['src/integrations'],
            status: 'updated',
            paths: ['src/integrations/stripe.js'],
          },
        ],
      },
      null,
      2,
    ) + '\n',
  );

  let sourceBlocked = false;
  try {
    assertEvidenceForStep('source-edit', ['s.md'], () => `${fat}\nedit residual applied source\n`);
  } catch (e) {
    sourceBlocked = String(e).includes('source_edit_requires_paths_or_residual');
  }
  assertTrue('source-edit without paths blocked', sourceBlocked);

  let missingPath = false;
  try {
    assertEvidenceForStep(
      'source-edit',
      ['s.md'],
      () => `${fat}\nfiles: src/does-not-exist.ts\nedited residual applied source\n`,
      { projectDir: pkgRoot },
    );
  } catch (e) {
    missingPath = String(e).includes('source_edit_paths_not_on_disk');
  }
  assertTrue('source-edit missing path blocked', missingPath);

  assertEvidenceForStep(
    'source-edit',
    ['s.md'],
    () => `${fat}\nfiles: src/integrations/stripe.ts\nedited residual applied source\n`,
    { projectDir: pkgRoot },
  );
  assertEvidenceForStep(
    'source-edit',
    ['s.md'],
    () => `${fat}\nresidual-no-field-edit\nresidual applied; no production change\n`,
    { projectDir: pkgRoot },
  );

  let handoffBlocked = false;
  try {
    assertEvidenceForStep(
      'handoff',
      ['h.md'],
      () => `${fat}\ngoal next blocked handoff quality residual done\n`,
    );
  } catch (e) {
    handoffBlocked =
      String(e).includes('handoff_requires_pr') || String(e).includes('package_verify');
  }
  assertTrue('store-only handoff blocked', handoffBlocked);

  let noVerify = false;
  try {
    assertEvidenceForStep(
      'handoff',
      ['h.md'],
      () =>
        `${fat}\ngoal next blocked handoff quality\npr: https://github.com/acme/client/pull/42\n`,
      { projectDir: pkgRoot },
    );
  } catch (e) {
    noVerify = String(e).includes('handoff_requires_package_verify');
  }
  assertTrue('handoff without package_verify blocked', noVerify);

  // Live PR verification is fail-closed; CI uses break-glass only for fixture URLs
  const prev = process.env.LAYERKIT_ALLOW_UNVERIFIED_PR;
  process.env.LAYERKIT_ALLOW_UNVERIFIED_PR = '1';
  try {
    assertEvidenceForStep(
      'handoff',
      ['h.md'],
      () =>
        `${fat}\ngoal next blocked handoff quality\npackage_verify: green\nfiles: src/integrations/stripe.js\npr: https://github.com/acme/client/pull/42\n`,
      { projectDir: pkgRoot },
    );
  } finally {
    if (prev === undefined) delete process.env.LAYERKIT_ALLOW_UNVERIFIED_PR;
    else process.env.LAYERKIT_ALLOW_UNVERIFIED_PR = prev;
  }
  assertEvidenceForStep(
    'handoff',
    ['h.md'],
    () =>
      `${fat}\ngoal next blocked handoff quality\noutcome: residual-no-pr\nallow_residual_no_pr: true\nresidual: no production drift\n`,
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log('agent-skill-packet: all checks passed');
