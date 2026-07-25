/**
 * Deterministic integration checklist runner (not an LLM).
 * Ordered skill pipeline for agent-driven vendor integration work.
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

/**
 * Canonical integration order:
 * discover → research → design → author → privacy → generate → handoff
 */
export const INTEGRATION_PIPELINE: readonly PipelineStep[] = [
  {
    id: 'discover',
    skill: 'layerkit-discover-data-layer',
    cliHints: [
      'layerkit discover scan --root .',
      'layerkit doctor',
      'layerkit memory list --type research',
      'layerkit memory append --type research --title "domain discovery" --body "..."',
    ],
    doneWhen:
      'Customer domain events/fields discovered from code; questionnaire Q3–Q4 seeded with sources',
  },
  {
    id: 'research',
    skill: 'layerkit-research-vendor',
    cliHints: [
      'layerkit map show <vendor>',
      'layerkit map list',
      'layerkit proposal validate ./proposal.json',
      'layerkit proposal apply ./proposal.json',
    ],
    doneWhen: 'vendor_map proposal validated and applied with sources[] (evidence-first)',
  },
  {
    id: 'design',
    skill: 'layerkit-design-flow',
    cliHints: [
      'layerkit design decide --vendor <v> [--sequence] [--oauth] [--shape linear_map|flow|hybrid]',
      'layerkit proposal validate ./flow.json',
      'layerkit process dry-run --vendor <v> --intent <i>',
    ],
    doneWhen:
      'Design decision recorded (map vs flow); IntegrationFlow when sequence/branching required; flat VendorMap preferred first',
  },
  {
    id: 'author',
    skill: 'layerkit-author-processor',
    cliHints: [
      'layerkit proposal validate ./proc.json',
      'layerkit proposal apply ./proc.json',
    ],
    doneWhen: 'Processors authored with citations; map field rows point at processorId',
  },
  {
    id: 'privacy',
    skill: 'layerkit-privacy-review',
    cliHints: ['layerkit doctor', 'layerkit memory list --type privacy'],
    requiresHuman: true,
    doneWhen: 'PrivacyPolicy reviewed; consent/hash/redact rules with sources before live egress',
  },
  {
    id: 'generate',
    skill: 'layerkit-generate-java',
    cliHints: [
      'layerkit generate --lang java',
      'cd <projectDir>/out/java && mvn test',
      'layerkit doctor --quality --strict',
    ],
    doneWhen: 'Java client scaffold filled; JaCoCo line ≥ 0.95; quality gate green',
  },
  {
    id: 'handoff',
    skill: 'handoff',
    cliHints: [
      'layerkit promote --vendor <id>',
      'layerkit agent status',
      'Use skill layerkit-checker-assist (read-only risk checklist)',
    ],
    requiresHuman: true,
    doneWhen:
      'Maps promoted live; checker risk checklist complete; handoff to runtime owners',
  },
] as const;

/** Relative path under memory/ for pipeline markers. */
export const PIPELINE_STATUS_REL = 'runbooks/pipeline-status.md';

/** Absolute path to the pipeline status marker file. */
export function pipelineStatusPath(projectDir: string): string {
  return join(projectDir, 'memory', PIPELINE_STATUS_REL);
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
 * Multi-line status for CLI / doctor: checkbox list + next step summary.
 */
export function formatPipelineStatus(completed: string[]): string {
  const done = new Set(completed.map((c) => c.trim()).filter(Boolean));
  const next = getNextStep(completed);
  const lines: string[] = ['Integration pipeline:'];

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
export function formatNextStepLine(completed: string[]): string {
  const next = getNextStep(completed);
  if (!next) return 'Next agent step: (pipeline complete)';
  return `Next agent step: ${next.id} (skill ${next.skill})`;
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
  // Ensure a Completed section exists for readability
  if (!/^##\s+Completed\b/m.test(trimmed)) {
    writeFileSync(path, `${trimmed}\n\n## Completed\n\n${markerLine}\n`, 'utf8');
  } else {
    writeFileSync(path, `${trimmed}\n${markerLine}\n`, 'utf8');
  }
  return path;
}
