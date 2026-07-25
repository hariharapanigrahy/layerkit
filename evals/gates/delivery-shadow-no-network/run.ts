/**
 * Gate: mode shadow never opens TCP (networkCalls stay 0; simulated success).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertEqual, assertTrue } from '../../harness/assert.js';
import {
  createDeliverySimulator,
  MemoryIdempotencyStore,
} from '../../../libs/delivery/index.js';

const root = mkdtempSync(join(tmpdir(), 'layerkit-delivery-eval-'));
const projectDir = join(root, '.layerkit');

try {
  const probe = { calls: 0 };
  const idemp = new MemoryIdempotencyStore();
  const sim = createDeliverySimulator({
    projectDir,
    policy: { mode: 'shadow' },
    idempotency: idemp,
    allowNetwork: false,
    networkProbe: probe,
  });

  const result = await sim.shadow({
    vendor: 'meta',
    operationId: 'post_events',
    intent: 'purchase',
    eventId: 'evt-shadow-1',
    wire: { event_name: 'Purchase', event_id: 'evt-shadow-1' },
    headers: { Authorization: 'Bearer secret-token' },
    url: 'https://graph.facebook.com/v18.0/123/events',
    method: 'POST',
  });

  assertEqual('outcome is shadow', result.outcome, 'shadow');
  assertTrue('simulated true', result.simulated === true);
  assertEqual('networkCalls is 0', result.networkCalls, 0);
  assertEqual('probe.calls is 0', probe.calls, 0);
  assertTrue('idempotent replay false on first send', result.idempotentReplay !== true);

  // Second shadow same key → idempotent, still no network
  const result2 = await sim.shadow({
    vendor: 'meta',
    operationId: 'post_events',
    intent: 'purchase',
    eventId: 'evt-shadow-1',
    wire: { event_name: 'Purchase', event_id: 'evt-shadow-1' },
  });
  assertEqual('second still zero network', result2.networkCalls, 0);
  assertEqual('probe still 0', probe.calls, 0);
  assertTrue('second is idempotent replay', result2.idempotentReplay === true);

  // dry_run also zero network
  const dry = await sim.dryRun({
    vendor: 'meta',
    operationId: 'post_events',
    intent: 'purchase',
    eventId: 'evt-dry-2',
    wire: { event_name: 'Purchase' },
  });
  assertEqual('dry_run networkCalls 0', dry.networkCalls, 0);
  assertEqual('probe still 0 after dry_run', probe.calls, 0);

  console.log('delivery-shadow-no-network: all checks passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
