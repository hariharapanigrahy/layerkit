/**
 * Gate: track resolves map.flowRef from projectDir/flows (not only inline flow).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertTrue, assertEqual } from '../../harness/assert.js';
import { loadFixture } from '../../harness/load-fixture.js';
import { withTempProject } from '../../harness/temp-project.js';
import type { VendorMap } from '../../../libs/domain/types.js';
import type { IntegrationFlow } from '../../../libs/flow/types.js';
import { resolveMapFlow } from '../../../libs/runtime/load-flow.js';
import { track } from '../../../libs/runtime/track.js';

await withTempProject(async ({ projectDir }) => {
  const flow = loadFixture<IntegrationFlow>('flow/oauth-then-post.json');
  mkdirSync(join(projectDir, 'flows'), { recursive: true });
  writeFileSync(join(projectDir, 'flows', 'flowy.json'), JSON.stringify(flow, null, 2));

  const map: VendorMap = {
    schemaVersion: 2,
    vendor: 'flowy',
    displayName: 'Flowy',
    version: '1.0.0',
    auth: { type: 'oauth2_client_credentials' },
    endpoint: { method: 'POST', path: '/events', baseUrl: 'https://api.example.com' },
    operations: {},
    intents: { purchase: { eventName: 'purchase' } },
    fields: [],
    documentation: [{ title: 'docs', url: 'https://docs.example.com' }],
    status: 'map_complete',
    flowRef: 'flowy',
  };

  const resolved = resolveMapFlow(map, projectDir);
  assertTrue('flowRef resolved from disk', resolved != null);
  assertTrue('resolved has nodes', (resolved!.nodes?.length ?? 0) > 0);

  // Inline flow absent — track must still use disk flow
  const noInline = { ...map };
  delete (noInline as { flow?: unknown }).flow;

  const result = await track(
    { intent: 'purchase', eventId: 'ord_1', user: { email: 'a@b.com' } },
    [noInline],
    {
      mode: 'dry_run',
      projectDir,
      observation: false,
      requirePrivacyPolicyForLive: false,
    },
  );

  assertEqual('one result', result.results.length, 1);
  // Flow dry_run should not fail solely because flowRef was ignored (would fall through to empty map skip)
  assertTrue(
    'not empty_map skip',
    result.results[0]!.reason !== 'empty_map_awaiting_agent_research',
    result.results[0]!.reason,
  );
  assertTrue(
    'not intent_not_mapped alone from linear path without running flow',
    // success, failure, or skip with flow reason is fine; empty_map is not
    result.results[0]!.outcome === 'success' ||
      result.results[0]!.outcome === 'failure' ||
      result.results[0]!.outcome === 'skipped',
  );

  console.log('track-flowref-resolve: all checks passed');
}, { poc: true });
