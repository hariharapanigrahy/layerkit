/**
 * Gate: OAuth client-credentials then POST via Flow DSL.
 * assign → call(token) responseInto/responseExtract → call(post) headersFromVars.
 */
import { assertEqual, assertTrue } from '../../harness/assert.js';
import { loadFixture } from '../../harness/load-fixture.js';
import { executeFlow, FLOW_LIMITS } from '../../../libs/flow/index.js';
import type { IntegrationFlow } from '../../../libs/flow/types.js';
import type { DomainEvent } from '../../../libs/vendor-memory/map-engine.js';

const flow = loadFixture<IntegrationFlow>('flow/oauth-then-post.json');
const event: DomainEvent = {
  intent: 'purchase',
  eventId: 'ord_1',
  user: { email: 'a@b.com' },
};

const result = executeFlow(flow, event, {
  mode: 'dry_run',
  simulatedResponses: {
    oauth_token: {
      httpStatus: 200,
      body: { access_token: 'tok_abc123', token_type: 'bearer', expires_in: 3600 },
      headers: { 'content-type': 'application/json' },
    },
    post_conversion: {
      httpStatus: 200,
      body: { events_received: 1 },
      headers: { 'content-type': 'application/json' },
    },
  },
});

assertEqual('flow status success', result.status, 'success');
assertTrue('visited multiple nodes', result.nodesVisited >= 4);
assertEqual('two calls logged', result.callLog.length, 2);

// Token call stored via responseInto
const tokenResult = result.memory.results['token'];
assertTrue('results.token present', tokenResult != null);
assertEqual(
  'token body access_token',
  (tokenResult!.body as { access_token?: string }).access_token,
  'tok_abc123',
);

// responseExtract → vars.accessToken
assertEqual(
  'vars.accessToken extracted',
  result.memory.vars['accessToken'],
  'tok_abc123',
);

// Second call Authorization header from vars
const postCall = result.callLog.find((c) => c.operationId === 'post_conversion');
assertTrue('post call present', postCall != null);
assertEqual(
  'Authorization Bearer from vars',
  postCall!.headers['Authorization'],
  'Bearer tok_abc123',
);
assertEqual(
  'post payload event_name',
  (postCall!.payload as { event_name?: string }).event_name,
  'Purchase',
);

// maxNodes limit is enforced (sanity: limit constant exported)
assertTrue('maxNodes limit defined', FLOW_LIMITS.maxNodes === 50);

// Over-limit graph aborts
const loopy: IntegrationFlow = {
  schemaVersion: 2,
  id: 'too_many',
  entry: 'n0',
  nodes: Array.from({ length: FLOW_LIMITS.maxNodes + 5 }, (_, i) => ({
    id: `n${i}`,
    type: 'assign' as const,
    set: [{ path: 'vars.i', value: i }],
    next: `n${i + 1}`,
  })),
};
// last next points past end — engine will hit maxNodes first
const over = executeFlow(loopy, event, { mode: 'dry_run' });
assertEqual('maxNodes aborts', over.status, 'abort');
assertEqual('maxNodes reasonCode', over.reasonCode, 'flow_max_nodes');

console.log('flow-oauth-then-post: all checks passed');
