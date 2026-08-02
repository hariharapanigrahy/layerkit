/**
 * Gate: skill packet write + evidence content fail-closed.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertEqual, assertTrue } from '../../harness/assert.js';
import {
  assertEvidenceForStep,
  buildSkillPacket,
  MIN_EVIDENCE_BYTES,
  setPipelineMode,
  writeSkillPacket,
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

  assertEqual('min evidence bytes constant', MIN_EVIDENCE_BYTES >= 40, true);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log('agent-skill-packet: all checks passed');
