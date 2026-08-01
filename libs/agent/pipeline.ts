/**
 * Deterministic integration checklist runner (not an LLM).
 * Order: discover → research → design → author → privacy → deletion-first → source-edit → handoff
 * mode=heal skips discover when the customer domain model is already known.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** One ordered step in the integration pipeline. */
export interface PipelineStep {
  id: string;
  /** Packaged skill name (or logical id for non-skill handoff). */
  skill: string;
  /** CLI commands / hints an agent or human should run for this step. */
  cliHints: string[];
  /** When true, a human must complete or approve before advancing. */
  requiresHuman?: boolean;
  /** Human-readable completion criterion. */
  doneWhen: string;
}

/** full = first map; heal = contract update (discover treated complete) */
export type PipelineMode = 'full' | 'heal';

/** Canonical order (unchanged ids so markers stay valid). */
export const INTEGRATION_PIPELINE: readonly PipelineStep[] = [
  {
    id: 'discover',
    skill: 'layerkit-discover-data-layer',
    cliHints: [
      'layerkit doctor',
      'layerkit memory list --type research',
      'Agent reads source files directly and writes cited domain notes/proposals',
    ],
    doneWhen:
      'Customer domain events/fields discovered from code with source:code (skip when pipeline mode=heal)',
  },
  {
    id: 'research',
    skill: 'layerkit-research-vendor',
    cliHints: [
      'Agent reads/cites vendor docs or OpenAPI directly',
      'Agent updates existing map/source/test files from evidence',
      'layerkit map show <vendor>',
      'layerkit proposal validate <file> when an explicit proposal artifact is written',
    ],
    doneWhen:
      'Vendor change understood from evidence; map/source files updated or explicit TODOs left for unsupported data-layer gaps',
  },
  {
    id: 'design',
    skill: 'layerkit-design-flow',
    cliHints: [
      'Agent chooses map vs flow from cited evidence and existing code',
      'Run the client package tests that cover the chosen path',
    ],
    doneWhen:
      'Shape still valid under new contract; prefer editing existing mappers/adapters',
  },
  {
    id: 'author',
    skill: 'layerkit-author-processor',
    cliHints: [
      'Agent updates existing client transform/helper code directly',
      'layerkit proposal validate <file> only when an explicit artifact is written',
    ],
    doneWhen:
      'Transforms cited and implemented in client source; heal only touches fields affected by drift',
  },
  {
    id: 'privacy',
    skill: 'layerkit-privacy-review',
    cliHints: ['layerkit doctor', 'layerkit memory list --type privacy'],
    requiresHuman: true,
    doneWhen:
      'Client privacy/consent behavior still valid; any new PII fields re-reviewed with sources',
  },
  {
    id: 'deletion-first',
    skill: 'layerkit-deletion-first',
    cliHints: [
      'Review stale generated docs/tests/package surfaces before adding code',
      'Prefer modifying or deleting existing code; list what each new file/function/export replaces',
      'Keep LOC net-negative or near-neutral unless the contract truly expands behavior',
    ],
    doneWhen:
      'Stale code/docs/tests/package surfaces removed or rewritten; new additions justify what they replace',
  },
  {
    id: 'source-edit',
    skill: 'layerkit-generate-java',
    cliHints: [
      'Agent edits existing production source/tests directly from evidence',
      'Run the package tests/build for the edited module',
      'layerkit doctor',
    ],
    doneWhen:
      'Production datalayer updated by the agent; client package verification green',
  },
  {
    id: 'handoff',
    skill: 'handoff',
    cliHints: [
      'layerkit agent status',
      'layerkit handoff write --vendor <id> --goal "contract heal" --next "review when package verification is green"',
      'Use skill layerkit-checker-assist (read-only risk checklist)',
    ],
    requiresHuman: true,
    doneWhen:
      'Package verification green; checker risk checklist complete; PR-ready handoff',
  },
] as const;

/** Relative path under memory/ for pipeline markers. */
export const PIPELINE_STATUS_REL = 'runbooks/pipeline-status.md';

/** Absolute path to the pipeline status marker file. */
export function pipelineStatusPath(projectDir: string): string {
  return join(projectDir, 'memory', PIPELINE_STATUS_REL);
}

/**
 * Read pipeline mode from status file header (`mode: heal` / `mode: full`).
 * Default full when unset.
 */
export function loadPipelineMode(projectDir: string): PipelineMode {
  const path = pipelineStatusPath(projectDir);
  if (!existsSync(path)) return 'full';
  const text = readFileSync(path, 'utf8');
  const m = text.match(/^\s*mode:\s*(heal|full)\b/im);
  if (m?.[1] === 'heal') return 'heal';
  return 'full';
}

/**
 * Ensure status file exists and set mode line (heal | full).
 * Heal marks discover complete so agent next starts at research.
 */
export function setPipelineMode(
  projectDir: string,
  mode: PipelineMode,
  meta?: { vendor?: string; note?: string },
): string {
  const path = pipelineStatusPath(projectDir);
  mkdirSync(dirname(path), { recursive: true });

  const iso = new Date().toISOString();
  const vendorLine = meta?.vendor ? `vendor: ${meta.vendor}` : '';
  const noteLine = meta?.note ? `note: ${meta.note}` : '';

  if (!existsSync(path)) {
    const header = [
      '# Integration pipeline status',
      '',
      `mode: ${mode}`,
      vendorLine,
      noteLine,
      '',
      'Agent orchestration markers.',
      'Mark steps complete with `layerkit agent mark-done --step <id>`.',
      '',
      '## Completed',
      '',
      mode === 'heal' ? `- [x] discover — ${iso} (heal: domain already known)` : '',
      '',
    ]
      .filter((l) => l !== undefined)
      .join('\n');
    writeFileSync(path, header.replace(/\n{3,}/g, '\n\n'), 'utf8');
    return path;
  }

  let prev = readFileSync(path, 'utf8');
  if (/^\s*mode:\s*/im.test(prev)) {
    prev = prev.replace(/^\s*mode:\s*(heal|full)\b.*$/im, `mode: ${mode}`);
  } else {
    prev = prev.replace(
      /^(# Integration pipeline status\s*\n)/m,
      `$1\nmode: ${mode}\n`,
    );
  }
  if (meta?.vendor) {
    if (/^\s*vendor:\s*/im.test(prev)) {
      prev = prev.replace(/^\s*vendor:\s*.*$/im, `vendor: ${meta.vendor}`);
    } else {
      prev = prev.replace(/^\s*mode:\s*.*$/im, (line) => `${line}\nvendor: ${meta.vendor}`);
    }
  }
  writeFileSync(path, prev, 'utf8');

  if (mode === 'heal') {
    markStepDone(projectDir, 'discover');
  }
  return path;
}

/**
 * Steps treated as complete: explicit markers plus heal-mode discover skip.
 */
export function effectiveCompletedSteps(projectDir: string, completed?: string[]): string[] {
  const done = [...(completed ?? loadCompletedSteps(projectDir))];
  if (loadPipelineMode(projectDir) === 'heal' && !done.includes('discover')) {
    done.unshift('discover');
  }
  return done;
}

/**
 * First incomplete step given completed step ids, or null when the pipeline is done.
 * Completeness is by step `id` (not skill name).
 */
export function getNextStep(completed: string[]): PipelineStep | null {
  const done = new Set(completed.map((c) => c.trim()).filter(Boolean));
  for (const step of INTEGRATION_PIPELINE) {
    if (!done.has(step.id)) return step;
  }
  return null;
}

/**
 * Next step using project heal mode (discover auto-done when mode=heal).
 */
export function getNextStepForProject(projectDir: string): PipelineStep | null {
  return getNextStep(effectiveCompletedSteps(projectDir));
}

/**
 * Multi-line status for CLI / doctor: checkbox list + next step summary.
 */
export function formatPipelineStatus(completed: string[], mode: PipelineMode = 'full'): string {
  const done = new Set(completed.map((c) => c.trim()).filter(Boolean));
  if (mode === 'heal') done.add('discover');
  const next = getNextStep([...done]);
  const lines: string[] = [
    'Integration pipeline:',
    `  mode: ${mode}`,
  ];

  for (const step of INTEGRATION_PIPELINE) {
    const mark = done.has(step.id) ? 'x' : ' ';
    const nextTag = next?.id === step.id ? '  ← next' : '';
    const human = step.requiresHuman ? ' (human)' : '';
    lines.push(`  [${mark}] ${step.id} — ${step.skill}${human}${nextTag}`);
  }

  if (next) {
    lines.push('');
    lines.push(`Next: ${next.id} (skill ${next.skill})`);
    lines.push(`Done when: ${next.doneWhen}`);
    if (next.cliHints.length) {
      lines.push('Hints:');
      for (const h of next.cliHints) lines.push(`  - ${h}`);
    }
  } else {
    lines.push('');
    lines.push('Next: (pipeline complete)');
  }

  return lines.join('\n');
}

/** One-line summary for doctor. */
export function formatNextStepLine(completed: string[], mode: PipelineMode = 'full'): string {
  const done = mode === 'heal' && !completed.includes('discover')
    ? ['discover', ...completed]
    : completed;
  const next = getNextStep(done);
  if (!next) return 'Next agent step: (pipeline complete)';
  return `Next agent step: ${next.id} (skill ${next.skill})${mode === 'heal' ? ' [heal]' : ''}`;
}

/**
 * Parse completed step ids from pipeline-status.md.
 * Recognizes lines: `- [x] <id>` or `- [X] <id>` optionally followed by em-dash/date.
 */
export function loadCompletedSteps(projectDir: string): string[] {
  const path = pipelineStatusPath(projectDir);
  if (!existsSync(path)) return [];
  const text = readFileSync(path, 'utf8');
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*-\s*\[x\]\s+([a-zA-Z0-9_-]+)/i);
    if (!m) continue;
    const id = m[1]!;
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/** Valid pipeline step ids. */
export function isPipelineStepId(id: string): boolean {
  return INTEGRATION_PIPELINE.some((s) => s.id === id);
}

/**
 * Append a completed marker for `stepId` under memory/runbooks/pipeline-status.md.
 * Returns absolute path of the marker file.
 */
export function markStepDone(projectDir: string, stepId: string): string {
  if (!isPipelineStepId(stepId)) {
    const known = INTEGRATION_PIPELINE.map((s) => s.id).join(', ');
    throw new Error(`Unknown pipeline step "${stepId}". Known: ${known}`);
  }

  const path = pipelineStatusPath(projectDir);
  mkdirSync(dirname(path), { recursive: true });

  const already = loadCompletedSteps(projectDir);
  if (already.includes(stepId)) {
    return path;
  }

  const iso = new Date().toISOString();
  const markerLine = `- [x] ${stepId} — ${iso}`;

  if (!existsSync(path)) {
    const header = [
      '# Integration pipeline status',
      '',
      'mode: full',
      '',
      'Agent orchestration markers (deterministic checklist — not an LLM).',
      'Mark steps complete with `layerkit agent mark-done --step <id>`.',
      '',
      '## Completed',
      '',
      markerLine,
      '',
    ].join('\n');
    writeFileSync(path, header, 'utf8');
    return path;
  }

  const prev = readFileSync(path, 'utf8');
  const trimmed = prev.trimEnd();
  if (!/^##\s+Completed\b/m.test(trimmed)) {
    writeFileSync(path, `${trimmed}\n\n## Completed\n\n${markerLine}\n`, 'utf8');
  } else {
    writeFileSync(path, `${trimmed}\n${markerLine}\n`, 'utf8');
  }
  return path;
}
