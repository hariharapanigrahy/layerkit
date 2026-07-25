/**
 * Markdown memory stack under `{projectDir}/memory/`.
 * Append / list / index — session-durable agent+human narrative (not audit sinks).
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, relative } from 'node:path';
import { redactMemoryBody } from './redact.js';

export type MemoryEntryType =
  | 'questionnaire'
  | 'research'
  | 'proposals'
  | 'dry-runs'
  | 'privacy'
  | 'approvals'
  | 'runbooks'
  | 'other';

export interface MemoryAppendInput {
  type: MemoryEntryType;
  title: string;
  body: string;
  vendor?: string;
  /** Optional fixed date stamp YYYY-MM-DD (default: today UTC) */
  date?: string;
  /** Optional explicit relative filename under type dir */
  filename?: string;
}

export interface MemoryEntry {
  type: MemoryEntryType;
  path: string;
  relativePath: string;
  vendor?: string;
  title: string;
  summary: string;
  mtimeMs: number;
}

const TYPE_DIRS: MemoryEntryType[] = [
  'questionnaire',
  'research',
  'proposals',
  'dry-runs',
  'privacy',
  'approvals',
  'runbooks',
];

export class MemoryStack {
  readonly memoryDir: string;

  constructor(readonly projectDir: string) {
    this.memoryDir = join(projectDir, 'memory');
  }

  ensureDirs(): void {
    mkdirSync(this.memoryDir, { recursive: true });
    for (const d of TYPE_DIRS) {
      mkdirSync(join(this.memoryDir, d), { recursive: true });
    }
    const indexPath = join(this.memoryDir, 'INDEX.md');
    if (!existsSync(indexPath)) {
      writeFileSync(indexPath, defaultIndexMd(), 'utf8');
    }
  }

  /**
   * Append a redacted markdown note and update INDEX.md.
   * Returns absolute path of the written file.
   */
  append(input: MemoryAppendInput): string {
    this.ensureDirs();
    const date = input.date ?? utcDate();
    const typeDir = TYPE_DIRS.includes(input.type) ? input.type : 'research';
    const safeVendor = (input.vendor ?? 'general').replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename =
      input.filename ??
      (typeDir === 'research'
        ? `${safeVendor}-${date}.md`
        : typeDir === 'questionnaire'
          ? `${safeVendor}-answers.md`
          : `${safeVendor}-${slug(input.title)}-${date}.md`);

    const abs = join(this.memoryDir, typeDir, filename);
    const redactedBody = redactMemoryBody(input.body);
    const md = [
      `# ${input.title}`,
      '',
      `- type: ${typeDir}`,
      input.vendor ? `- vendor: ${input.vendor}` : null,
      `- date: ${date}`,
      `- createdAt: ${new Date().toISOString()}`,
      '',
      redactedBody,
      '',
    ]
      .filter((line) => line !== null)
      .join('\n');

    // Append-oriented: if file exists, append a dated section rather than erase history
    if (existsSync(abs)) {
      const prev = readFileSync(abs, 'utf8');
      writeFileSync(
        abs,
        `${prev.trimEnd()}\n\n---\n\n## ${input.title} (${new Date().toISOString()})\n\n${redactedBody}\n`,
        'utf8',
      );
    } else {
      writeFileSync(abs, md, 'utf8');
    }

    this.touchIndex({
      type: typeDir as MemoryEntryType,
      vendor: input.vendor,
      title: input.title,
      relativePath: join(typeDir, filename).replace(/\\/g, '/'),
      summary: firstLine(redactedBody) || input.title,
    });

    return abs;
  }

  list(opts?: { vendor?: string; type?: MemoryEntryType }): MemoryEntry[] {
    this.ensureDirs();
    const entries: MemoryEntry[] = [];
    const types = opts?.type ? [opts.type] : TYPE_DIRS;

    for (const type of types) {
      const dir = join(this.memoryDir, type);
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir)) {
        if (!f.endsWith('.md')) continue;
        const abs = join(dir, f);
        const st = statSync(abs);
        if (!st.isFile()) continue;
        const text = readFileSync(abs, 'utf8');
        const title = extractTitle(text) ?? f;
        const vendor = extractMeta(text, 'vendor') ?? guessVendorFromName(f);
        if (opts?.vendor && vendor !== opts.vendor && !f.startsWith(opts.vendor)) {
          continue;
        }
        entries.push({
          type,
          path: abs,
          relativePath: join(type, f).replace(/\\/g, '/'),
          vendor,
          title,
          summary: firstLine(stripFront(text)) || title,
          mtimeMs: st.mtimeMs,
        });
      }
    }

    entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return entries;
  }

  show(pathOrId: string): string {
    this.ensureDirs();
    const candidates = [
      pathOrId,
      join(this.memoryDir, pathOrId),
      join(this.projectDir, pathOrId),
    ];
    for (const c of candidates) {
      if (existsSync(c) && statSync(c).isFile()) {
        return readFileSync(c, 'utf8');
      }
    }
    // try relative match from list
    const hit = this.list().find(
      (e) => e.relativePath === pathOrId || e.relativePath.endsWith(pathOrId) || basename(e.path) === pathOrId,
    );
    if (hit) return readFileSync(hit.path, 'utf8');
    throw new Error(`Memory entry not found: ${pathOrId}`);
  }

  /**
   * Rebuild INDEX.md from directory scan.
   */
  index(): string {
    this.ensureDirs();
    const entries = this.list();
    const lines = [
      '# Layerkit memory INDEX',
      '',
      `Last rebuilt: ${new Date().toISOString()}`,
      '',
      '| Type | Vendor | Title | Path | Summary |',
      '|------|--------|-------|------|---------|',
    ];
    for (const e of entries) {
      lines.push(
        `| ${e.type} | ${e.vendor ?? ''} | ${escapeCell(e.title)} | ${e.relativePath} | ${escapeCell(e.summary)} |`,
      );
    }
    lines.push('');
    const content = lines.join('\n');
    const indexPath = join(this.memoryDir, 'INDEX.md');
    writeFileSync(indexPath, content, 'utf8');
    return indexPath;
  }

  private touchIndex(row: {
    type: MemoryEntryType;
    vendor?: string;
    title: string;
    relativePath: string;
    summary: string;
  }): void {
    const indexPath = join(this.memoryDir, 'INDEX.md');
    let existing = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : defaultIndexMd();
    if (!existing.includes('| Type |')) {
      existing = defaultIndexMd();
    }
    const line = `| ${row.type} | ${row.vendor ?? ''} | ${escapeCell(row.title)} | ${row.relativePath} | ${escapeCell(row.summary)} |`;
    // de-dupe by path: drop prior lines with same path
    const kept = existing
      .split('\n')
      .filter((l) => !l.includes(`| ${row.relativePath} |`));
    // ensure table ends properly
    const withoutTrailingEmpty = kept.join('\n').trimEnd();
    writeFileSync(
      indexPath,
      `${withoutTrailingEmpty}\n${line}\n\n_Last append: ${new Date().toISOString()}_\n`,
      'utf8',
    );
  }
}

export function createMemoryStack(projectDir: string): MemoryStack {
  return new MemoryStack(projectDir);
}

function defaultIndexMd(): string {
  return [
    '# Layerkit memory INDEX',
    '',
    'Manifest of session-durable research, questionnaire, and approval notes.',
    '',
    '| Type | Vendor | Title | Path | Summary |',
    '|------|--------|-------|------|---------|',
    '',
  ].join('\n');
}

function utcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'note';
}

function firstLine(body: string): string {
  return (
    body
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('#') && !l.startsWith('-')) ?? ''
  ).slice(0, 120);
}

function extractTitle(md: string): string | undefined {
  const m = md.match(/^#\s+(.+)$/m);
  return m?.[1]?.trim();
}

function extractMeta(md: string, key: string): string | undefined {
  const re = new RegExp(`^-\\s*${key}:\\s*(.+)$`, 'm');
  const m = md.match(re);
  return m?.[1]?.trim();
}

function guessVendorFromName(filename: string): string | undefined {
  const base = filename.replace(/\.md$/, '');
  const parts = base.split('-');
  return parts[0] || undefined;
}

function stripFront(md: string): string {
  return md.replace(/^#[^\n]*\n/, '').replace(/^- [^\n]*\n/gm, '');
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/** Relative path helper for tests */
export function memoryRelative(projectDir: string, absPath: string): string {
  return relative(join(projectDir, 'memory'), absPath);
}
