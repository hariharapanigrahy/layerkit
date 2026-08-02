/**
 * Skill work packets — front-load the current skill so agents cannot freestyle.
 * Deterministic; no LLM.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  INTEGRATION_PIPELINE,
  type PipelineStep,
  getNextStepForProject,
  loadPipelineMode,
  pipelineStatusPath,
} from './pipeline.js';

/** Relative path under projectDir memory/ for the current skill packet. */
export const SKILL_PACKET_REL = 'runbooks/current-skill-packet.md';

export function skillPacketPath(projectDir: string): string {
  return join(projectDir, 'memory', SKILL_PACKET_REL);
}

/** Minimum evidence file size (bytes) — empty stubs fail. */
export const MIN_EVIDENCE_BYTES = 40;

/** Per-step content patterns required in at least one evidence file. */
const EVIDENCE_PATTERNS: Record<string, RegExp> = {
  discover: /intent|field|domain|source:code|file:\/\//i,
  research: /https?:\/\/|openapi|changelog|drift|docs\.|severity|residual/i,
  design: /shape|linear|flow|mapper|adapter|existing/i,
  author: /field|map|source|vendor|intent|proposal/i,
  privacy: /pii|privacy|consent|no new|residual/i,
  'deletion-first': /delete|remov|stale|replace|net-|loc/i,
  'source-edit': /edit|diff|residual|field|applied|confirmation|createPreview|source/i,
  handoff: /goal|next|blocked|handoff|residual|quality/i,
};

/**
 * Build markdown packet for the current next skill (or null if pipeline complete).
 */
export function buildSkillPacket(projectDir: string): { step: PipelineStep; markdown: string } | null {
  const mode = loadPipelineMode(projectDir);
  const next = getNextStepForProject(projectDir);
  if (!next) return null;

  const forbidden = [
    'Do not freestyle production source edits outside this skill',
    'Do not bump apiVersion/SDK alone and call it full integrate',
    'Do not mark-done a later step (order is enforced)',
    'Do not invent map fields without OpenAPI/docs citations',
    'Do not open PRs before handoff quality gates',
  ];

  const evidenceHint =
    next.id === 'research'
      ? 'Research note with citations (http URLs) and drift/residual severity'
      : next.id === 'discover'
        ? 'domain_spec proposal or discovery note with source:code / file paths'
        : next.id === 'author'
          ? 'Validated map proposal path (fields + sources[])'
          : next.id === 'source-edit'
            ? 'Source-edit report of production edits OR residual no-field-drift attestation'
            : 'Non-empty note path describing step completion';

  const lines = [
    '# Current skill packet (Layerkit — fail-closed process)',
    '',
    `mode: ${mode}`,
    `step: ${next.id}`,
    `skill: ${next.skill}`,
    `generatedAt: ${new Date().toISOString()}`,
    '',
    '## You must',
    `1. Open and follow skill \`${next.skill}\` (packaged SKILL.md).`,
    `2. Complete: ${next.doneWhen}`,
    '3. Write evidence files that satisfy mark-done content checks.',
    `4. \`layerkit agent mark-done --step ${next.id} --evidence <path>\``,
    '',
    '## Forbidden (this step)',
    ...forbidden.map((f) => `- ${f}`),
    '',
    '## CLI hints',
    ...next.cliHints.map((h) => `- ${h}`),
    '',
    '## Evidence required',
    `- ${evidenceHint}`,
    `- Each --evidence path must exist and be ≥ ${MIN_EVIDENCE_BYTES} bytes`,
    `- Content must match step pattern for \`${next.id}\``,
    '',
    '## Pipeline skills (order)',
    ...INTEGRATION_PIPELINE.map((s) => `- ${s.id} → ${s.skill}`),
    '',
  ];

  return { step: next, markdown: lines.join('\n') };
}

/** Write packet under memory/runbooks/; return absolute path or null if complete. */
export function writeSkillPacket(projectDir: string): string | null {
  const built = buildSkillPacket(projectDir);
  if (!built) return null;
  const path = skillPacketPath(projectDir);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, built.markdown, 'utf8');
  return path;
}

/**
 * Validate evidence paths for a step: exists, min size, content pattern.
 * Throws on failure.
 */
export function assertEvidenceForStep(
  stepId: string,
  evidencePaths: string[],
  resolveContent: (p: string) => string | null,
): void {
  const clean = evidencePaths.map((p) => p.trim()).filter(Boolean);
  if (clean.length === 0) {
    throw new Error('mark_done_requires_evidence: pass --evidence <path>');
  }
  const pattern = EVIDENCE_PATTERNS[stepId];
  let anyMatch = !pattern;
  for (const p of clean) {
    const body = resolveContent(p);
    if (body == null) {
      throw new Error(`evidence_not_found: ${p}`);
    }
    const bytes = Buffer.byteLength(body, 'utf8');
    if (bytes < MIN_EVIDENCE_BYTES) {
      throw new Error(
        `evidence_too_thin: ${p} is ${bytes} bytes (min ${MIN_EVIDENCE_BYTES}). ` +
          `Freestyle empty stubs are rejected — write real skill evidence.`,
      );
    }
    if (pattern && pattern.test(body)) anyMatch = true;
  }
  if (pattern && !anyMatch) {
    throw new Error(
      `evidence_content_mismatch: step "${stepId}" requires evidence matching ${pattern}. ` +
        `Load skill for this step and write a real note (not a one-line stub).`,
    );
  }
}

/** Read evidence file from repo root, projectDir, or absolute path. */
export function readEvidenceFile(
  p: string,
  repoRoot: string,
  projectDir: string,
): string | null {
  const candidates = [resolve(repoRoot, p), resolve(projectDir, p), resolve(p)];
  for (const c of candidates) {
    if (existsSync(c)) {
      try {
        return readFileSync(c, 'utf8');
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Whether pipeline has been started (status file present). */
export function requirePipelineStarted(projectDir: string): void {
  if (!existsSync(pipelineStatusPath(projectDir))) {
    throw new Error(
      'pipeline_not_started: run `layerkit agent start --mode full|heal [--vendor <v>]` before agent next/mark-done. ' +
        'Skills are not optional — freestyle without a session is blocked.',
    );
  }
}
