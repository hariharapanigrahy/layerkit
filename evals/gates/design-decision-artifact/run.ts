/**
 * Gate: design-decision-artifact
 * - sequence+oauth → flow
 * - no flags → linear_map
 * - write+read runbook contains shape
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertEqual, assertTrue } from '../../harness/assert.js';
import {
  decideShape,
  designDecisionPath,
  formatDesignDecisionMarkdown,
  parseDesignDecisionMarkdown,
  writeDesignDecision,
  type DesignDecision,
} from '../../../libs/agent/index.js';

// --- pure shape rules ---
assertEqual(
  'no flags → linear_map',
  decideShape({}),
  'linear_map',
);
assertEqual(
  'all false → linear_map',
  decideShape({
    hasSequence: false,
    hasBranch: false,
    hasForeach: false,
    hasOauthThenPost: false,
    multiCall: false,
  }),
  'linear_map',
);
assertEqual(
  'sequence+oauth → flow',
  decideShape({ hasSequence: true, hasOauthThenPost: true }),
  'flow',
);
assertEqual(
  'sequence alone → flow',
  decideShape({ hasSequence: true }),
  'flow',
);
assertEqual(
  'oauth alone → flow',
  decideShape({ hasOauthThenPost: true }),
  'flow',
);
assertEqual(
  'branch → flow',
  decideShape({ hasBranch: true }),
  'flow',
);
assertEqual(
  'foreach → flow',
  decideShape({ hasForeach: true }),
  'flow',
);
assertEqual(
  'multiCall alone → flow',
  decideShape({ multiCall: true }),
  'flow',
);
assertEqual(
  'sequence + multiCall → hybrid',
  decideShape({ hasSequence: true, multiCall: true }),
  'hybrid',
);

// --- markdown round-trip includes shape ---
const sample: DesignDecision = {
  schemaVersion: 1,
  vendor: 'acme',
  shape: 'flow',
  intents: ['purchase'],
  operations: [{ id: 'oauth_token', method: 'POST', path: '/oauth/token' }],
  batch: 'none',
  authSteps: 'token_then_post',
  privacyRequired: false,
  evidence: ['https://docs.example/oauth'],
  openQuestions: [],
  rationale: 'OAuth then POST requires sequence.',
  decidedAt: '2026-01-01T00:00:00.000Z',
};
const md = formatDesignDecisionMarkdown(sample);
assertTrue('markdown has shape: flow', /shape:\s*flow/i.test(md), md.slice(0, 400));
assertTrue('markdown has ## shape section', /##\s+shape/i.test(md), md.slice(0, 400));
const parsed = parseDesignDecisionMarkdown(md);
assertEqual('parsed shape', parsed.shape, 'flow');
assertEqual('parsed vendor', parsed.vendor, 'acme');
assertEqual('parsed authSteps', parsed.authSteps, 'token_then_post');

// --- write + read runbook contains shape ---
const tmp = mkdtempSync(join(tmpdir(), 'layerkit-design-decision-'));
const projectDir = join(tmp, '.layerkit');
try {
  const linear: DesignDecision = {
    ...sample,
    vendor: 'linear_vendor',
    shape: 'linear_map',
    authSteps: 'none',
    rationale: 'Prefer flat map.',
  };
  const { mdPath: linearPath } = writeDesignDecision({
    projectDir,
    decision: linear,
    out: 'memory',
  });
  assertEqual(
    'linear runbook path',
    linearPath,
    designDecisionPath(projectDir, 'linear_vendor'),
  );
  assertTrue('linear runbook exists', existsSync(linearPath), linearPath);
  const linearBody = readFileSync(linearPath, 'utf8');
  assertTrue(
    'linear runbook contains shape linear_map',
    /shape:\s*linear_map/i.test(linearBody) || /##\s+shape\s*\nlinear_map/i.test(linearBody),
    linearBody.slice(0, 500),
  );
  const fromLinear = parseDesignDecisionMarkdown(linearBody);
  assertEqual('read-back linear shape', fromLinear.shape, 'linear_map');

  const flowDec: DesignDecision = {
    ...sample,
    vendor: 'oauth_vendor',
    shape: decideShape({ hasSequence: true, hasOauthThenPost: true }),
    authSteps: 'token_then_post',
    rationale: 'sequence + oauth → flow',
  };
  assertEqual('flowDec shape is flow', flowDec.shape, 'flow');
  const { mdPath: flowPath, jsonPath } = writeDesignDecision({
    projectDir,
    decision: flowDec,
    out: 'memory',
    alsoJson: true,
  });
  assertTrue('flow runbook exists', existsSync(flowPath), flowPath);
  const flowBody = readFileSync(flowPath, 'utf8');
  assertTrue(
    'flow runbook contains shape flow',
    /shape:\s*flow/i.test(flowBody) || /##\s+shape\s*\nflow/i.test(flowBody),
    flowBody.slice(0, 500),
  );
  assertEqual(
    'parse flow shape from runbook',
    parseDesignDecisionMarkdown(flowBody).shape,
    'flow',
  );
  assertTrue('companion json written', !!jsonPath && existsSync(jsonPath!), String(jsonPath));
  if (jsonPath) {
    const j = JSON.parse(readFileSync(jsonPath, 'utf8')) as DesignDecision;
    assertEqual('json shape', j.shape, 'flow');
    assertEqual('json vendor', j.vendor, 'oauth_vendor');
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log('design-decision-artifact: all checks passed');
