/**
 * Gate: handoff-runbook-cli
 * HANDOFF_TEMPLATE contains required headings; writeHandoffRunbook creates
 * memory/runbooks/handoff-*.md under a temp projectDir.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertEqual, assertTrue } from '../../harness/assert.js';
import {
  HANDOFF_REQUIRED_HEADINGS,
  HANDOFF_TEMPLATE,
  buildHandoffRunbook,
  handoffHasRequiredHeadings,
  handoffRunbookRel,
  markStepDone,
  writeHandoffRunbook,
} from '../../../libs/agent/index.js';

// --- template headings ---
assertTrue('HANDOFF_TEMPLATE non-empty', HANDOFF_TEMPLATE.trim().length > 0);
assertTrue(
  'HANDOFF_TEMPLATE has required headings',
  handoffHasRequiredHeadings(HANDOFF_TEMPLATE),
  HANDOFF_TEMPLATE.slice(0, 400),
);

for (const h of HANDOFF_REQUIRED_HEADINGS) {
  const re = new RegExp(`^##\\s+${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'im');
  assertTrue(`template heading: ${h}`, re.test(HANDOFF_TEMPLATE), HANDOFF_TEMPLATE);
}

// --- buildHandoffRunbook fills sections ---
const built = buildHandoffRunbook({
  vendor: 'acme',
  goal: 'Ship CAPI purchase map',
  done: ['research complete'],
  nextActions: ['privacy review', 'promote live', 'checker assist'],
  blocked: ['need prod token'],
  quality: 'dry-run green',
  pipelineStatus: 'Integration pipeline:\n  [x] research',
});
assertTrue('built has required headings', handoffHasRequiredHeadings(built), built.slice(0, 500));
assertTrue('built includes goal', built.includes('Ship CAPI purchase map'), built);
assertTrue('built includes vendor title', /Handoff runbook — acme/.test(built), built);
assertTrue('built includes next action', built.includes('privacy review'), built);
assertTrue('built includes pipeline status section', /##\s+Pipeline status/i.test(built), built);

// --- write to temp projectDir ---
const tmp = mkdtempSync(join(tmpdir(), 'layerkit-handoff-'));
try {
  const projectDir = join(tmp, '.layerkit');
  const evidence = 'memory/evidence.md';
  mkdirSync(join(projectDir, 'memory'), { recursive: true });
  writeFileSync(join(projectDir, evidence), 'evidence', 'utf8');
  markStepDone(projectDir, 'discover', [evidence]);
  markStepDone(projectDir, 'research', [evidence]);

  const outPath = writeHandoffRunbook({
    projectDir,
    vendor: 'acme',
    goal: 'Resume after research',
    done: ['discover', 'research'],
    nextActions: ['design flow'],
    out: 'memory',
  });

  const expected = join(projectDir, handoffRunbookRel('acme'));
  assertEqual('runbook path', outPath, expected);
  assertTrue('runbook file exists', existsSync(outPath), outPath);

  const written = readFileSync(outPath, 'utf8');
  assertTrue('written has required headings', handoffHasRequiredHeadings(written), written.slice(0, 500));
  assertTrue('written goal', written.includes('Resume after research'), written);
  assertTrue(
    'auto pipeline status included',
    /##\s+Pipeline status/i.test(written) && written.includes('discover'),
    written.slice(-600),
  );

  // custom out path
  const custom = join(tmp, 'custom-handoff.md');
  const customPath = writeHandoffRunbook({
    projectDir,
    vendor: 'beta',
    goal: 'custom path',
    out: custom,
    appendMemory: false,
  });
  assertEqual('custom out path', customPath, custom);
  assertTrue('custom file exists', existsSync(custom), custom);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log('handoff-runbook-cli: all checks passed');
