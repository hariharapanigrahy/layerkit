/**
 * Gate: agent-multi-plan
 * Multi-agent plan builds phases, per-vendor fan-out, registry single-writer, ready groups.
 */
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertEqual, assertTrue } from '../../harness/assert.js';
import {
  buildMultiAgentPlan,
  formatMultiAgentPlanMarkdown,
  writeMultiAgentPlanArtifacts,
  readyMultiAgentTasks,
  groupReadyByParallel,
} from '../../../libs/agent/index.js';

const tmp = mkdtempSync(join(tmpdir(), 'layerkit-multi-'));
const projectDir = join(tmp, '.layerkit');
const repoRoot = tmp;

const plan = buildMultiAgentPlan({
  repoRoot,
  projectDir,
  vendors: ['resend', 'postmark'],
  moduleRoot: 'apps/integrations',
  maxParallel: 4,
});

assertEqual('schema', plan.schemaVersion, 1);
assertEqual('kind', plan.kind, 'multi_agent_plan');
assertTrue('has scan phase', plan.phases.some((p) => p.id === 'scan'));
assertTrue('has research phase', plan.phases.some((p) => p.id === 'research'));
assertTrue('has integrate phase', plan.phases.some((p) => p.id === 'integrate'));
assertTrue('has verify phase', plan.phases.some((p) => p.id === 'verify'));
assertTrue('has handoff phase', plan.phases.some((p) => p.id === 'handoff'));

assertTrue(
  'researcher resend',
  plan.tasks.some((t) => t.id === 'researcher:resend' && t.parallel),
);
assertTrue(
  'researcher postmark',
  plan.tasks.some((t) => t.id === 'researcher:postmark'),
);
assertTrue(
  'integrator per vendor',
  plan.tasks.some((t) => t.id === 'integrator:resend') &&
    plan.tasks.some((t) => t.id === 'integrator:postmark'),
);
assertTrue(
  'registry single writer',
  plan.tasks.some((t) => t.id === 'integrator:registry' && t.parallel === false),
);
assertTrue(
  'checker read-only human',
  plan.tasks.some((t) => t.role === 'checker' && t.requiresHuman && t.capability === 'read-only'),
);
assertTrue(
  'privacy human',
  plan.tasks.some((t) => t.role === 'privacy' && t.requiresHuman),
);

// Registry depends on both integrators
const reg = plan.tasks.find((t) => t.id === 'integrator:registry')!;
assertTrue(
  'registry depends on vendor integrators',
  reg.dependsOn.includes('integrator:resend') && reg.dependsOn.includes('integrator:postmark'),
);

assertEqual('default mode full', plan.mode, 'full');
assertTrue('full mode includes discoverer', plan.tasks.some((t) => t.id === 'discoverer'));

const ready0 = readyMultiAgentTasks(plan, []);
assertTrue('scan tasks ready at start', ready0.some((t) => t.phase === 'scan'));
assertTrue(
  'research not ready before scan deps',
  !ready0.some((t) => t.phase === 'research'),
);

const scanDone = plan.tasks.filter((t) => t.phase === 'scan').map((t) => t.id);
const ready1 = readyMultiAgentTasks(plan, scanDone);
assertTrue('research ready after scan', ready1.some((t) => t.id === 'researcher:resend'));

// Heal mode: no discoverer; research is contract-first
const heal = buildMultiAgentPlan({
  repoRoot,
  projectDir,
  vendors: ['resend'],
  mode: 'heal',
  openapiPath: '/tmp/contract.json',
  moduleRoot: 'apps/integrations',
});
assertEqual('heal mode', heal.mode, 'heal');
assertTrue('heal omits discoverer', !heal.tasks.some((t) => t.id === 'discoverer'));
assertTrue('heal omits integrate phase', !heal.phases.some((p) => p.id === 'integrate'));
assertTrue('heal omits integrator tasks', !heal.tasks.some((t) => t.role === 'integrator'));
assertTrue(
  'heal researcher mentions heal run',
  heal.tasks.some(
    (t) => t.id === 'researcher:resend' && t.cli.some((c) => c.includes('heal run')),
  ),
);
assertTrue(
  'heal verifier depends on privacy',
  heal.tasks.some((t) => t.id === 'verifier:resend' && t.dependsOn.includes('privacy')),
);
assertTrue('heal summary mentions mode', heal.summary.includes('mode=heal'));

const groups = groupReadyByParallel(ready0);
assertTrue('scan parallel group exists', (groups['scan']?.length ?? 0) >= 2);

const md = formatMultiAgentPlanMarkdown(plan);
assertTrue('md multi-agent', /multi-agent/i.test(md));
assertTrue('md forbids dual registry', /registry/i.test(md));
assertTrue('md mentions INTEGRATE or brownfield', /INTEGRATE|brownfield|production/i.test(md));

const arts = writeMultiAgentPlanArtifacts(projectDir, plan);
assertTrue('md written', existsSync(arts.mdPath));
assertTrue('json written', existsSync(arts.jsonPath));
const parsed = JSON.parse(readFileSync(arts.jsonPath, 'utf8'));
assertEqual('json vendors', parsed.vendors.join(','), 'resend,postmark');

// empty vendors still builds generic research slot
const bare = buildMultiAgentPlan({ repoRoot, projectDir });
assertTrue('bare has researcher placeholder', bare.tasks.some((t) => t.role === 'researcher'));

console.log('agent-multi-plan: ok');
