/**
 * Session handoff runbook — durable markdown so the next agent can resume
 * without re-inventing context. Written under memory/runbooks/.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createMemoryStack } from '../memory/index.js';
import { formatPipelineStatus, loadCompletedSteps } from './pipeline.js';

/** Canonical section headings required in every handoff runbook. */
export const HANDOFF_REQUIRED_HEADINGS = [
  'Goal',
  'Done',
  'In progress',
  'Blocked',
  'Evidence index',
  'Next 3 actions',
  'Forbidden',
  'Quality',
] as const;

/**
 * Empty handoff template (skill-aligned). Agents fill sections; CLI may
 * inject lists and pipeline status.
 */
export const HANDOFF_TEMPLATE = `# Handoff runbook — <vendor or project>

## Goal

_(one sentence: what integration outcome this session aimed for)_

## Done

- _(skills completed, proposal ids, validate status)_

## In progress

- _(current skill, open files, partial drafts)_

## Blocked

- _(exact residual human questions; who to ask)_

## Evidence index

- _(key source URLs + memory paths)_

## Next 3 actions

1. _(skill-named, ordered)_
2. ...
3. ...

## Forbidden

- do not invent endpoints or fields
- do not apply without checker
- do not open deny-paths / dump secrets
- do not mark handoff complete with store/memory only — require client PR URL or residual-no-pr break-glass

## Quality

- _(last client package verification result; coverage if any)_
- _(pr: https://github.com/org/repo/pull/N — or outcome: residual-no-pr + allow_residual_no_pr: true + residual: …)_
`;

export interface HandoffRunbookInput {
  vendor?: string;
  goal?: string;
  done?: string[];
  inProgress?: string[];
  blocked?: string[];
  evidence?: string[];
  nextActions?: string[];
  quality?: string;
  /** Pre-formatted pipeline status; when omitted with projectDir, auto-loaded. */
  pipelineStatus?: string;
}

export interface WriteHandoffRunbookInput extends HandoffRunbookInput {
  projectDir: string;
  /** `memory` (default) or absolute/relative filesystem path. */
  out?: string;
  /**
   * When true (default for out=memory), rebuild memory INDEX so the handoff is listed.
   */
  appendMemory?: boolean;
}

/** Relative path under projectDir for the default handoff file. */
export function handoffRunbookRel(vendorOrProject = 'project'): string {
  const safe = slug(vendorOrProject);
  return join('memory', 'runbooks', `handoff-${safe}.md`);
}

/**
 * Build a filled handoff runbook markdown string from structured input.
 * Always includes the required section headings.
 */
export function buildHandoffRunbook(input: HandoffRunbookInput = {}): string {
  const label = input.vendor?.trim() || 'project';
  const goal =
    input.goal?.trim() ||
    '_(one sentence: what integration outcome this session aimed for)_';

  const lines: string[] = [
    `# Handoff runbook — ${label}`,
    '',
    '## Goal',
    '',
    goal,
    '',
    '## Done',
    '',
    ...bulletOrPlaceholder(input.done, '_(skills completed, proposal ids, validate status)_'),
    '',
    '## In progress',
    '',
    ...bulletOrPlaceholder(input.inProgress, '_(current skill, open files, partial drafts)_'),
    '',
    '## Blocked',
    '',
    ...bulletOrPlaceholder(input.blocked, '_(exact residual human questions; who to ask)_'),
    '',
    '## Evidence index',
    '',
    ...bulletOrPlaceholder(input.evidence, '_(key source URLs + memory paths)_'),
    '',
    '## Next 3 actions',
    '',
    ...numberedOrPlaceholder(input.nextActions),
    '',
    '## Forbidden',
    '',
    '- do not invent endpoints or fields',
    '- do not apply without checker',
    '- do not open deny-paths / dump secrets',
    '',
    '## Quality',
    '',
    input.quality?.trim() || '_(last client package verification result; coverage if any)_',
    '',
  ];

  if (input.pipelineStatus?.trim()) {
    lines.push('## Pipeline status', '', input.pipelineStatus.trim(), '');
  }

  return lines.join('\n');
}

/**
 * Write handoff runbook under `{projectDir}/memory/runbooks/handoff-<vendor|project>.md`
 * (or custom --out path). Auto-includes pipeline status from markers when projectDir
 * is set and pipelineStatus was not provided.
 *
 * Returns absolute path written.
 */
export function writeHandoffRunbook(input: WriteHandoffRunbookInput): string {
  const vendorOrProject = input.vendor?.trim() || 'project';
  let pipelineStatus = input.pipelineStatus;
  if (pipelineStatus === undefined && input.projectDir) {
    try {
      const completed = loadCompletedSteps(input.projectDir);
      pipelineStatus = formatPipelineStatus(completed);
    } catch {
      // leave undefined if markers unreadable
    }
  }

  const md = buildHandoffRunbook({
    vendor: input.vendor,
    goal: input.goal,
    done: input.done,
    inProgress: input.inProgress,
    blocked: input.blocked,
    evidence: input.evidence,
    nextActions: input.nextActions,
    quality: input.quality,
    pipelineStatus,
  });

  const out = input.out ?? 'memory';
  let abs: string;
  if (out === 'memory') {
    abs = join(input.projectDir, handoffRunbookRel(vendorOrProject));
  } else {
    abs = resolve(out);
  }

  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, md.endsWith('\n') ? md : `${md}\n`, 'utf8');

  // Best-effort: rebuild INDEX so the runbook is discoverable under memory/
  const shouldIndex = input.appendMemory ?? out === 'memory';
  if (shouldIndex && existsSync(input.projectDir)) {
    try {
      const mem = createMemoryStack(input.projectDir);
      mem.ensureDirs();
      mem.index();
    } catch {
      // primary file already written
    }
  }

  return abs;
}

/** True when markdown contains all required handoff section headings. */
export function handoffHasRequiredHeadings(md: string): boolean {
  for (const h of HANDOFF_REQUIRED_HEADINGS) {
    const re = new RegExp(`^##\\s+${escapeRegExp(h)}\\b`, 'im');
    if (!re.test(md)) return false;
  }
  return true;
}

// --- internals ---

function bulletOrPlaceholder(items: string[] | undefined, placeholder: string): string[] {
  if (items && items.length > 0) {
    return items.map((d) => `- ${d.trim()}`).filter((l) => l.length > 2);
  }
  return [`- ${placeholder}`];
}

function numberedOrPlaceholder(items: string[] | undefined): string[] {
  if (items && items.length > 0) {
    return items.map((a, i) => `${i + 1}. ${a.trim()}`);
  }
  return ['1. _(skill-named, ordered)_', '2. ...', '3. ...'];
}

function slug(s: string): string {
  const t = s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return t || 'project';
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
