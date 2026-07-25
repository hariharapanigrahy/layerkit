/**
 * Gate: email.normalize_basic → hash.sha256_hex matches golden for a@b.com.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { assertEqual, assertTrue } from '../../harness/assert.js';
import { loadFixture } from '../../harness/load-fixture.js';
import { withTempProject } from '../../harness/temp-project.js';
import type { VendorMap } from '../../../libs/domain/types.js';
import {
  createStrategyRegistry,
  executeProcessor,
  opHashSha256Hex,
  type ExecutableProcessor,
} from '../../../libs/strategy/index.js';
import { applyVendorMap } from '../../../libs/vendor-memory/map-engine.js';

const processor = loadFixture<ExecutableProcessor>('agent/processor-email-sha256.json');
const map = loadFixture<VendorMap>('agent/map-v1.json');
const golden = loadFixture<{
  inputEmail: string;
  sha256Hex: string;
  normalized: string;
}>('agent/golden-email-sha256.json');

const registry = createStrategyRegistry({ processors: [processor] });
const hashed = executeProcessor(processor.id, golden.inputEmail, registry);
assertEqual('pipeline hash matches golden', hashed, golden.sha256Hex);

assertEqual(
  'builtin hash.sha256_hex of normalized',
  opHashSha256Hex(golden.normalized),
  golden.sha256Hex,
);

await withTempProject(async ({ store, projectDir }) => {
  const procDir = join(projectDir, 'processors');
  mkdirSync(procDir, { recursive: true });
  writeFileSync(
    join(procDir, 'example_email_sha256_normalized.json'),
    JSON.stringify(processor, null, 2) + '\n',
    'utf8',
  );
  store.saveMap(map);

  const result = applyVendorMap(
    { intent: 'purchase', eventId: 'ord_1', user: { email: golden.inputEmail } },
    map,
    { processorsDir: procDir },
  );

  assertTrue('not skipped', result.skipped === false);
  assertEqual('event_name purchase', result.wire?.event_name, 'purchase');
  const em = (result.wire?.user as Record<string, unknown> | undefined)?.email_hash;
  assertEqual('user.email_hash is golden hash', em, golden.sha256Hex);
  assertTrue(
    'no __processor placeholder',
    !(em && typeof em === 'object' && em !== null && '__processor' in (em as object)),
  );
});

const upper = executeProcessor(processor.id, '  A@B.COM  ', registry);
assertEqual('normalize upper+spaces → same golden', upper, golden.sha256Hex);

console.log('strategy-execute-sha256: all checks passed');
