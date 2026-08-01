import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  containsEmail,
  createMemoryStack,
  memoryRelative,
  redactMemoryBody,
  REDACTED_EMAIL,
  REDACTED_PHONE,
  REDACTED_SECRET,
} from '../memory/index.js';

describe('memory redaction and stack', () => {
  it('redacts emails, phones, assigned secrets, and high-entropy tokens', () => {
    const body = [
      'alice@example.com',
      '+1 (415) 555-1212',
      `API_KEY=${['sk', 'live', 'DO_NOT_COPY', 'abcdef0123456789'].join('_')}`,
      'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789',
    ].join('\n');
    const redacted = redactMemoryBody(body);
    expect(redacted).toContain(REDACTED_EMAIL);
    expect(redacted).toContain(REDACTED_PHONE);
    expect(redacted).toContain(REDACTED_SECRET);
    expect(redacted).not.toContain('alice@example.com');
    expect(redactMemoryBody('+1 (415) 555-1212', { phones: false })).toContain('415');
    expect(containsEmail('x@y.com')).toBe(true);
    expect(containsEmail('not email')).toBe(false);
  });

  it('appends, lists, shows, searches, indexes, and appends history', () => {
    const root = mkdtempSync(join(tmpdir(), 'layerkit-memory-unit-'));
    try {
      const mem = createMemoryStack(join(root, '.layerkit'));
      mem.ensureDirs();
      const first = mem.append({
        type: 'research',
        vendor: 'meta',
        title: 'Meta research',
        body: 'Endpoint POST /events\nContact alice@example.com',
        date: '2026-08-02',
      });
      const second = mem.append({
        type: 'research',
        vendor: 'meta',
        title: 'Meta research follow-up',
        body: 'Endpoint still POST /events',
        date: '2026-08-02',
      });
      expect(second).toBe(first);
      expect(existsSync(first)).toBe(true);
      expect(readFileSync(first, 'utf8')).toContain('---');
      expect(readFileSync(first, 'utf8')).toContain(REDACTED_EMAIL);
      expect(mem.list({ vendor: 'meta', type: 'research' })).toHaveLength(1);
      expect(mem.search('POST /events', { vendor: 'meta' })[0]?.matches.length).toBeGreaterThan(0);
      expect(mem.show('research/meta-2026-08-02.md')).toContain('Meta research');
      expect(memoryRelative(join(root, '.layerkit'), first)).toBe('research/meta-2026-08-02.md');
      expect(existsSync(mem.index())).toBe(true);
      expect(() => mem.show('missing')).toThrow(/not found/);
      expect(() => mem.search('   ')).toThrow(/requires a query/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('handles non-research filenames, fallback type, vendor filename matching, and malformed index', () => {
    const root = mkdtempSync(join(tmpdir(), 'layerkit-memory-unit-'));
    try {
      const mem = createMemoryStack(join(root, '.layerkit'));
      mem.ensureDirs();
      const questionnaire = mem.append({
        type: 'questionnaire',
        vendor: 'ad-glow',
        title: 'Answers',
        body: '# Heading\n- ignored: meta\nUseful summary | with pipe',
      });
      expect(questionnaire.endsWith('questionnaire/ad-glow-answers.md')).toBe(true);
      const fallback = mem.append({
        type: 'other',
        title: 'General Note With A Very Very Very Long Title That Slugs Down',
        body: '- list\n# heading\nbody line',
        filename: 'manual.md',
      });
      expect(fallback.endsWith('research/manual.md')).toBe(true);

      const indexPath = join(root, '.layerkit', 'memory', 'INDEX.md');
      expect(readFileSync(indexPath, 'utf8')).toContain('\\|');
      expect(mem.list({ vendor: 'ad-glow' })).toHaveLength(1);
      expect(mem.show('ad-glow-answers.md')).toContain('Useful summary');

      const noTitle = mem.append({
        type: 'privacy',
        title: 'Privacy',
        body: 'plain body',
        filename: 'notitle.md',
      });
      expect(mem.show(noTitle)).toContain('# Privacy');

      const before = readFileSync(indexPath, 'utf8');
      expect(before).toContain('| Type |');
      mem.append({
        type: 'approvals',
        vendor: 'pipe',
        title: 'Title | Pipe',
        body: 'Approval body',
      });
      expect(readFileSync(indexPath, 'utf8')).toContain('Title \\| Pipe');

      const mem2 = createMemoryStack(join(root, 'other-layerkit'));
      mem2.ensureDirs();
      const brokenIndex = join(root, 'other-layerkit', 'memory', 'INDEX.md');
      writeFileSync(brokenIndex, 'broken');
      mem2.append({ type: 'dry-runs', title: 'Dry Run Title', body: 'body line' });
      expect(readFileSync(brokenIndex, 'utf8')).toContain('| Type |');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
