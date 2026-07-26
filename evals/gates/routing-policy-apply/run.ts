/**
 * Gate: routing_policy proposal apply writes routing.json (P3).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertEqual, assertTrue } from '../../harness/assert.js';
import { loadFixture } from '../../harness/load-fixture.js';
import { withTempProject } from '../../harness/temp-project.js';
import type { Proposal } from '../../../libs/domain/types.js';
import type { RoutingPolicy } from '../../../libs/routing/index.js';
import { loadRoutingPolicy } from '../../../libs/routing/index.js';

await withTempProject(async ({ store, projectDir }) => {
  const project = store.loadProject()!;
  project.makerChecker = {
    ...project.makerChecker,
    legacyApplyWithoutApprove: true,
  };
  store.saveProject(project);

  const policy = loadFixture<RoutingPolicy>('routing/policy-segment-sets.json');
  const proposal: Proposal = {
    schemaVersion: 2,
    kind: 'routing_policy',
    id: 'prop-routing-1',
    summary: 'segment sets routing fixture',
    payload: policy,
    sources: [
      {
        title: 'Routing design note',
        url: 'https://docs.example.com/routing-plan',
        excerpt: 'Vendor sets by segment; secondary intent by product id',
      },
    ],
    authoredBy: 'agent',
    createdAt: new Date().toISOString(),
    status: 'pending',
    maker: { type: 'agent', id: 'eval' },
  };

  const applied = store.applyProposal(proposal);
  assertEqual('kind', applied.kind, 'routing_policy');
  assertTrue('routing.json exists', existsSync(join(projectDir, 'routing.json')));
  const loaded = loadRoutingPolicy(projectDir);
  assertTrue('loadable', loaded != null);
  assertEqual('id', loaded!.id, 'default');
  assertEqual('sets', loaded!.vendorSets.length, 3);

  const raw = JSON.parse(readFileSync(join(projectDir, 'routing.json'), 'utf8')) as RoutingPolicy;
  assertEqual('routes', raw.routes.length, 3);

  console.log('routing-policy-apply: all checks passed');
}, { poc: true });
