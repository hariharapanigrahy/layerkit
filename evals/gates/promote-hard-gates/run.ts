/**
 * Gate: promote hard gates (unit-level via promote-gates.ts + temp project).
 * - map without map_complete → blocked
 * - map_complete + dry-run ok + no secrets → evaluatePromoteGates ok
 * - secret_scan critical findings block
 * - live promotion without privacy policy block
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { assertEqual, assertTrue } from '../../harness/assert.js';
import { withTempProject } from '../../harness/temp-project.js';
import {
  checkMapStatusGate,
  collectSecretFindings,
  evaluatePromoteGates,
  formatPromoteGateFailures,
} from '../../../libs/agent/index.js';
import type { VendorMapV1 } from '../../../libs/domain/types.js';

function baseMap(
  over: {
    vendor: string;
    status?: VendorMapV1['status'];
    displayName?: string;
    fields?: VendorMapV1['fields'];
    intents?: VendorMapV1['intents'];
  },
): VendorMapV1 {
  return {
    vendor: over.vendor,
    displayName: over.displayName ?? over.vendor,
    version: '1.0.0',
    auth: { type: 'bearer' },
    endpoint: { method: 'POST', path: '/v1/events', baseUrl: 'https://api.example.com' },
    intents: over.intents ?? {
      purchase: { eventName: 'Purchase' },
    },
    fields: over.fields ?? [
      { domain: 'eventId', vendor: 'event_id', transform: { type: 'identity' } },
    ],
    documentation: [{ title: 'docs', url: 'https://docs.example.com/events' }],
    status: over.status,
  };
}

// --- pure: map without map_complete blocked ---
// status not map_complete (skeleton / missing / deprecated) must block
const draft = baseMap({ vendor: 'drafty', status: 'skeleton' });
const draftStatus = checkMapStatusGate(draft);
assertTrue('non-complete map_status fails', draftStatus !== null);
assertEqual('non-complete gate id', draftStatus!.gate, 'map_status');

const skeleton = baseMap({ vendor: 'skel', status: 'skeleton' });
assertTrue('skeleton map_status fails', checkMapStatusGate(skeleton) !== null);

const noStatus = baseMap({ vendor: 'nostatus', status: undefined });
assertTrue('missing status map_status fails', checkMapStatusGate(noStatus) !== null);

const emptyComplete = baseMap({
  vendor: 'empty',
  status: 'map_complete',
  fields: [],
  intents: {},
});
assertTrue('empty map_complete still fails', checkMapStatusGate(emptyComplete) !== null);

const good = baseMap({ vendor: 'acme', status: 'map_complete' });
assertTrue('map_complete with fields/intents passes status', checkMapStatusGate(good) === null);

await withTempProject(async ({ store, projectDir }) => {
  // 1) draft map → evaluatePromoteGates not ok
  store.saveMap(draft);
  const blocked = evaluatePromoteGates({
    maps: [draft],
    secretFindings: [],
    projectDir,
    quality: { ok: true },
    requireDryRun: true,
  });
  assertTrue('non-complete promote blocked', blocked.ok === false, blocked.lines.join('\n'));
  assertTrue(
    'non-complete fails map_status',
    blocked.failures.some((f) => f.gate === 'map_status'),
    formatPromoteGateFailures(blocked.failures).join('\n'),
  );
  assertEqual('non-complete eligible empty', blocked.eligibleVendors.length, 0);

  // 2) map_complete + no privacy policy → blocked
  store.saveMap(good);
  const noPolicy = evaluatePromoteGates({
    maps: [good],
    secretFindings: collectSecretFindings([good]),
    projectDir,
    privacyPolicyIds: [],
    quality: { ok: true },
    requireDryRun: true,
  });
  assertTrue('live promotion without policy blocked', noPolicy.ok === false);
  assertTrue(
    'missing policy fails privacy_policy',
    noPolicy.failures.some((f) => f.gate === 'privacy_policy'),
    formatPromoteGateFailures(noPolicy.failures).join('\n'),
  );

  // 3) map_complete + dry-run ok + no secrets + policy → ok
  const okResult = evaluatePromoteGates({
    maps: [good],
    secretFindings: collectSecretFindings([good]),
    projectDir,
    privacyPolicyIds: ['default'],
    quality: { ok: true },
    requireDryRun: true,
  });
  assertTrue(
    'map_complete promote ok',
    okResult.ok === true,
    [...okResult.lines, ...formatPromoteGateFailures(okResult.failures)].join('\n'),
  );
  assertTrue(
    'eligible includes acme',
    okResult.eligibleVendors.includes('acme'),
    okResult.eligibleVendors.join(','),
  );
  assertTrue('no failures on happy path', okResult.failures.length === 0);

  // Simulate promote: set live only when ok
  if (okResult.ok) {
    const m = store.loadMap('acme')!;
    m.status = 'live';
    store.saveMap(m);
  }
  assertEqual('store status live after promote', store.loadMap('acme')!.status, 'live');

  // 4) secret_scan critical blocks
  const TOKEN = 'sk_live_4eC39HqLyjWDarjtT1zdp7dc_AbCdEfGhIjKlMn';
  const leaky = baseMap({
    vendor: 'leaky',
    status: 'map_complete',
    intents: {
      purchase: {
        eventName: 'Purchase',
        staticFields: { access_token: TOKEN },
      },
    },
  });
  const secretFindings = collectSecretFindings([leaky]);
  assertTrue(
    'leaky map has secret errors',
    secretFindings.some((f) => f.level === 'error'),
    JSON.stringify(secretFindings),
  );
  const secretBlocked = evaluatePromoteGates({
    maps: [leaky],
    secretFindings,
    projectDir,
    privacyPolicyIds: ['default'],
    quality: { ok: true },
    requireDryRun: true,
  });
  assertTrue('secret leak blocks promote', secretBlocked.ok === false);
  assertTrue(
    'secret_scan in failures',
    secretBlocked.failures.some((f) => f.gate === 'secret_scan'),
    formatPromoteGateFailures(secretBlocked.failures).join('\n'),
  );

  // 5) default privacy policy ok
  mkdirSync(join(projectDir, 'privacy'), { recursive: true });
  writeFileSync(
    join(projectDir, 'privacy', 'default-allow.json'),
    JSON.stringify({
      schemaVersion: 2,
      id: 'default-allow',
      version: '1.0.0',
      description: 'eval policy',
      defaultAction: 'allow',
      rules: [],
      egressChecks: [],
    }) + '\n',
    'utf8',
  );
  const piiOk = evaluatePromoteGates({
    maps: [good],
    secretFindings: [],
    projectDir,
    quality: { ok: true },
    requireDryRun: true,
  });
  assertTrue(
    'default policy promotes',
    piiOk.ok === true,
    [...piiOk.lines, ...formatPromoteGateFailures(piiOk.failures)].join('\n'),
  );
  assertTrue('acme eligible', piiOk.eligibleVendors.includes('acme'));

  // 6) --no-dry-run-check skips dry-run (still need map_complete)
  const drySkipped = evaluatePromoteGates({
    maps: [good],
    secretFindings: [],
    projectDir,
    quality: { ok: true },
    requireDryRun: false,
  });
  assertTrue(
    'requireDryRun false still ok for good map',
    drySkipped.ok === true,
    drySkipped.lines.join('\n'),
  );
  assertTrue(
    'dry_run skipped line present',
    drySkipped.lines.some((l) => l.includes('dry_run') && l.includes('skipped')),
    drySkipped.lines.join('\n'),
  );

  console.log('promote-hard-gates: all checks passed');
}, { name: 'promote-hard-gates', prefix: 'layerkit-promote-gates-' });
