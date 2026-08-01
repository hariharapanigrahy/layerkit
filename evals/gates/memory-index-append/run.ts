/**
 * Gate: append research note updates INDEX.md; list returns entry; emails redacted.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertTrue } from '../../harness/assert.js';
import {
  createMemoryStack,
  REDACTED_EMAIL,
} from '../../../libs/memory/index.js';

const root = mkdtempSync(join(tmpdir(), 'layerkit-memory-eval-'));
const projectDir = join(root, '.layerkit');

try {
  const mem = createMemoryStack(projectDir);
  mem.ensureDirs();

  const body = [
    'Research notes for Meta CAPI.',
    'Contact for questions: alice@example.com should never be stored raw.',
    'Endpoint from docs: POST /events',
  ].join('\n');

  const path = mem.append({
    type: 'research',
    vendor: 'meta',
    title: 'Meta CAPI research',
    body,
    date: '2026-07-26',
  });

  assertTrue('append wrote file', existsSync(path), path);

  const written = readFileSync(path, 'utf8');
  assertTrue('email redacted in body', written.includes(REDACTED_EMAIL), written);
  assertTrue('raw email absent', !written.includes('alice@example.com'), written);

  const indexPath = join(projectDir, 'memory', 'INDEX.md');
  assertTrue('INDEX.md exists', existsSync(indexPath));
  const index = readFileSync(indexPath, 'utf8');
  assertTrue('INDEX mentions research path', index.includes('research/meta-'), index);
  assertTrue('INDEX mentions title', index.includes('Meta CAPI research'), index);

  const listed = mem.list({ vendor: 'meta', type: 'research' });
  assertTrue('list returns at least one entry', listed.length >= 1, JSON.stringify(listed));
  assertTrue(
    'list entry title matches',
    listed.some((e) => e.title.includes('Meta CAPI')),
    JSON.stringify(listed),
  );

  const found = mem.search('POST /events', { vendor: 'meta', type: 'research' });
  assertTrue('search returns cited endpoint note', found.length === 1, JSON.stringify(found));
  assertTrue(
    'search snippet includes match',
    found[0]!.matches.some((m) => m.includes('POST /events')),
    JSON.stringify(found),
  );

  const rebuilt = mem.index();
  assertTrue('index() rewrites INDEX', existsSync(rebuilt));
  const index2 = readFileSync(rebuilt, 'utf8');
  assertTrue('rebuilt INDEX still lists research', /research/i.test(index2), index2);

  console.log('memory-index-append: all checks passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
