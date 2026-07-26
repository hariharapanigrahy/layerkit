/**
 * Gate: track() emits audit events when projectDir / observation bus is set.
 */
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertTrue } from '../../harness/assert.js';
import { withTempProject } from '../../harness/temp-project.js';
import type { VendorMap } from '../../../libs/domain/types.js';
import {
  clearSinkSpi,
  registerSinkSpi,
  type AuditEvent,
} from '../../../libs/observation/index.js';
import { track } from '../../../libs/runtime/track.js';

await withTempProject(async ({ projectDir }) => {
  clearSinkSpi();
  const received: AuditEvent[] = [];
  registerSinkSpi({
    name: 'track-obs-gate',
    emitAudit(event) {
      received.push(event);
    },
  });

  mkdirSync(join(projectDir, 'audit'), { recursive: true });

  const map: VendorMap = {
    vendor: 'obs_v',
    displayName: 'Obs',
    version: '1.0.0',
    auth: { type: 'bearer' },
    endpoint: { method: 'POST', path: '/e', baseUrl: 'https://api.example.com' },
    intents: { purchase: { eventName: 'purchase' } },
    fields: [{ domain: 'eventId', vendor: 'event_id', transform: { type: 'identity' } }],
    documentation: [{ title: 'd', url: 'https://docs.example.com' }],
    status: 'map_complete',
  };

  await track(
    { intent: 'purchase', eventId: 'evt_obs_1' },
    [map],
    {
      mode: 'dry_run',
      projectDir,
      requirePrivacyPolicyForLive: false,
      observation: {
        schemaVersion: 2,
        tracing: [{ type: 'noop' }],
        metrics: [{ type: 'noop' }],
        logs: [{ type: 'noop' }],
        audit: [
          { type: 'spi', name: 'track-obs-gate' },
          { type: 'file', path: join(projectDir, 'audit') },
        ],
        events: {
          mapApply: true,
          privacyDecision: true,
          deliveryAttempt: true,
          deliverySuccess: true,
          deliveryFailure: true,
          skip: true,
        },
        telemetryPii: 'never',
        emitFailurePolicy: 'best_effort',
      },
    },
  );

  assertTrue('SPI received audit', received.length >= 1, `got ${received.length}`);
  assertTrue(
    'vendor on audit',
    received.some((e) => e.vendor === 'obs_v'),
  );
  assertTrue(
    'eventId on audit',
    received.some((e) => e.eventId === 'evt_obs_1'),
  );

  const dayFiles = readdirSync(join(projectDir, 'audit')).filter((f) => f.endsWith('.jsonl'));
  assertTrue('file audit written', dayFiles.length >= 1);
  const body = readFileSync(join(projectDir, 'audit', dayFiles[0]!), 'utf8');
  assertTrue('file contains vendor', body.includes('obs_v'));

  clearSinkSpi();
  console.log('track-observation-emit: all checks passed');
}, { poc: true });
