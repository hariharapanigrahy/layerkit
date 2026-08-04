/**
 * Skill work packets — front-load the current skill so agents cannot freestyle.
 * Deterministic; no LLM.
 *
 * Terminal evidence (source-edit paths, handoff PR/residual) lives here with
 * other mark-done evidence checks — not a separate abstraction.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  INTEGRATION_PIPELINE,
  type PipelineStep,
  getNextStepForProject,
  loadPipelineMode,
  pipelineStatusPath,
} from './pipeline.js';
import {
  assertAllSurfacesResolved,
  assertSurfacesStepComplete,
} from './surfaces.js';

/** Relative path under projectDir memory/ for the current skill packet. */
export const SKILL_PACKET_REL = 'runbooks/current-skill-packet.md';

export function skillPacketPath(projectDir: string): string {
  return join(projectDir, 'memory', SKILL_PACKET_REL);
}

/** Minimum evidence file size (bytes) — empty stubs fail. */
export const MIN_EVIDENCE_BYTES = 40;

/** GitHub PR URL — product terminal for integrate/heal (any package). */
const CLIENT_PR_URL_RE =
  /https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/\d+/i;

/** Per-step content patterns required in at least one evidence file. */
const EVIDENCE_PATTERNS: Record<string, RegExp> = {
  discover: /intent|field|domain|source:code|file:\/\//i,
  surfaces: /language|surface|inventory|roots|node|python|ruby|php|java|go|source:code/i,
  research: /https?:\/\/|openapi|changelog|drift|docs\.|severity|residual/i,
  design: /shape|linear|flow|mapper|adapter|existing/i,
  author: /field|map|source|vendor|intent|proposal/i,
  privacy: /pii|privacy|consent|no new|residual/i,
  'deletion-first': /delete|remov|stale|replace|net-|loc/i,
  'source-edit': /edit|diff|residual|field|applied|source|files?|paths?|residual-no-field-edit/i,
  handoff: /goal|next|blocked|handoff|quality|pr:|pull\/\d+|residual-no-pr/i,
};

function isResidualNoPrBreakGlass(text: string): boolean {
  return (
    /outcome:\s*residual-no-pr/i.test(text) &&
    /allow_residual_no_pr:\s*true/i.test(text) &&
    /residual\s*:/i.test(text)
  );
}

const PROD_EXT = /\.(ts|js|tsx|jsx|py|rb|go|java|php)$/i;

/** Extract production paths listed in source-edit / handoff evidence. */
export function extractProductionPaths(text: string): string[] {
  const paths = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const labeled = line.match(
      /(?:files?|edited|changed|paths?)\s*[:=]\s*(.+)/i,
    );
    if (labeled?.[1]) {
      for (const part of labeled[1].split(/[,]+/)) {
        const p = part.trim().replace(/^[-*`\s]+|[-*`\s]+$/g, '');
        if (PROD_EXT.test(p)) paths.add(p.replace(/^\.\//, ''));
      }
    }
    const bullet = line.match(/^\s*[-*]\s+([^\s]+)/);
    if (bullet?.[1] && PROD_EXT.test(bullet[1])) {
      paths.add(bullet[1].replace(/^\.\//, ''));
    }
    const diff = line.match(/(?:diff --git a\/|modified:\s+|\+\+\+ b\/)(\S+)/);
    if (diff?.[1] && PROD_EXT.test(diff[1])) {
      paths.add(diff[1].replace(/^\.\//, ''));
    }
  }
  return [...paths];
}

function isResidualNoFieldEdit(text: string): boolean {
  return (
    /residual-no-field-edit/i.test(text) ||
    (/residual/i.test(text) && /no field/i.test(text) && /no production/i.test(text))
  );
}

/** Source-edit: production paths or residual-no-field-edit (generic any package). */
function assertSourceEditEvidence(bodies: string[]): void {
  const joined = bodies.join('\n\n');
  const paths = extractProductionPaths(joined);
  if (paths.length > 0 || isResidualNoFieldEdit(joined)) return;
  throw new Error(
    'source_edit_requires_paths_or_residual: list production files edited (paths with extensions) ' +
      'from map/drift, or attest `residual-no-field-edit` with residual justification.',
  );
}

/**
 * Source-edit paths must exist on disk under projectDir (not freestyle invented paths).
 */
function assertSourceEditOnDisk(projectDir: string, bodies: string[]): void {
  const joined = bodies.join('\n\n');
  if (isResidualNoFieldEdit(joined)) return;
  const paths = extractProductionPaths(joined);
  if (paths.length === 0) {
    throw new Error(
      'source_edit_paths_missing: list production paths that exist under the package root',
    );
  }
  const missing: string[] = [];
  for (const p of paths) {
    const abs = resolve(projectDir, p);
    if (!existsSync(abs)) missing.push(p);
  }
  if (missing.length) {
    throw new Error(
      `source_edit_paths_not_on_disk: freestyle path list blocked — missing under projectDir: ${missing.join(', ')}. ` +
        `Edit real production files then list those paths.`,
    );
  }
}

/**
 * Handoff requires package verification attestation (merge readiness).
 * Optionally runs a light syntax check on edited .js/.ts files.
 */
function assertPackageVerify(bodies: string[], projectDir: string | undefined): void {
  const joined = bodies.join('\n\n');
  if (isResidualNoPrBreakGlass(joined)) return;

  const attested =
    /package[_\s-]?(verify|verification|tests?)\s*[:=]\s*(green|pass|passed|ok)/i.test(
      joined,
    ) ||
    /verification\s*green|tests?\s*green|npm test.*(pass|ok|green)/i.test(joined) ||
    /quality\s*:\s*.*(green|pass|verified)/i.test(joined);

  if (!attested) {
    throw new Error(
      'handoff_requires_package_verify: attest package verification before complete, e.g. ' +
        '`package_verify: green` after running the package build/test command, or ' +
        '`package_verify: residual` with residual: <why keys/tests blocked> and residual-no-pr if no PR. ' +
        'Blind merge requires green package verify — not store-only handoff.',
    );
  }

  // residual verify (keys missing) still requires residual-no-pr OR real PR
  const residualVerify =
    /package[_\s-]?(verify|verification|tests?)\s*[:=]\s*residual/i.test(joined);
  if (residualVerify && !isResidualNoPrBreakGlass(joined) && !CLIENT_PR_URL_RE.test(joined)) {
    throw new Error(
      'handoff_package_verify_residual: package_verify: residual requires residual-no-pr break-glass ' +
        'or a live PR URL after partial verify.',
    );
  }

  if (!projectDir || process.env.LAYERKIT_SKIP_PACKAGE_VERIFY === '1') return;
  if (residualVerify) return;

  // Light fail-closed check: node --check on listed production JS paths from evidence
  const paths = extractProductionPaths(joined);
  for (const p of paths) {
    if (!/\.(js|mjs|cjs|ts)$/i.test(p)) continue;
    const abs = resolve(projectDir, p);
    if (!existsSync(abs)) continue;
    if (/\.ts$/i.test(p)) continue; // node --check is for JS; TS left to package test script
    const r = spawnSync(process.execPath, ['--check', abs], {
      encoding: 'utf8',
      timeout: 15_000,
    });
    if (r.status !== 0) {
      throw new Error(
        `handoff_package_verify_failed: node --check ${p} failed — fix syntax before claiming mergeable. ` +
          `${(r.stderr || r.stdout || '').slice(0, 400)}`,
      );
    }
  }
}

/**
 * Verify PR exists on GitHub (not a freestyle fake URL in a markdown note).
 * Uses `gh pr view` when available; otherwise GitHub API. Fail-closed unless
 * LAYERKIT_ALLOW_UNVERIFIED_PR=1 (explicit break-glass for offline CI only).
 */
function assertClientPrExists(prUrl: string): void {
  if (process.env.LAYERKIT_ALLOW_UNVERIFIED_PR === '1') return;

  const m = prUrl.match(
    /https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/(\d+)/i,
  );
  if (!m) {
    throw new Error(`handoff_pr_invalid_url: ${prUrl}`);
  }
  const owner = m[1]!;
  const repo = m[2]!;
  const num = m[3]!;

  const gh = spawnSync(
    'gh',
    ['pr', 'view', num, '--repo', `${owner}/${repo}`, '--json', 'state,url'],
    { encoding: 'utf8', timeout: 30_000 },
  );
  if (gh.status === 0 && gh.stdout) {
    try {
      const j = JSON.parse(gh.stdout) as { state?: string; url?: string };
      if (j.state === 'OPEN' || j.state === 'MERGED') return;
      throw new Error(`handoff_pr_not_mergeable: state=${j.state ?? 'unknown'}`);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('handoff_pr_')) throw e;
    }
  }

  // Fallback: unauthenticated API (rate-limited) — 404 means freestyle fake PR
  const api = spawnSync(
    'curl',
    [
      '-sS',
      '-o',
      '/dev/null',
      '-w',
      '%{http_code}',
      '-H',
      'Accept: application/vnd.github+json',
      `https://api.github.com/repos/${owner}/${repo}/pulls/${num}`,
    ],
    { encoding: 'utf8', timeout: 30_000 },
  );
  const code = (api.stdout ?? '').trim();
  if (code === '200') return;

  throw new Error(
    `handoff_pr_not_found: ${prUrl} is not a live GitHub PR (http ${code || 'n/a'}; gh exit ${gh.status ?? 'n/a'}). ` +
      `Freestyle fake pr: lines are blocked. Create a real PR with gh pr create, or use residual-no-pr break-glass. ` +
      `Offline exception only: LAYERKIT_ALLOW_UNVERIFIED_PR=1.`,
  );
}

/** Handoff: live client PR or residual-no-pr break-glass — store-only / fake PR text is not done. */
function assertHandoffTerminal(bodies: string[]): void {
  const joined = bodies.join('\n\n');
  if (isResidualNoPrBreakGlass(joined)) return;

  const m = joined.match(CLIENT_PR_URL_RE);
  if (!m) {
    throw new Error(
      'handoff_requires_pr: Layerkit integrate/heal is not complete until a client package PR exists. ' +
        'After source-edit: commit, push, `gh pr create`, then put the URL in handoff evidence as ' +
        '`pr: https://github.com/org/repo/pull/123`. ' +
        'Only when research proved zero production change: ' +
        '`outcome: residual-no-pr` + `allow_residual_no_pr: true` + `residual: <why>`.',
    );
  }
  assertClientPrExists(m[0]!);
}

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
    'Do not claim pipeline complete without a client PR (or residual-no-pr break-glass)',
    'Do not open PRs before handoff quality gates',
  ];

  const evidenceHint =
    next.id === 'research'
      ? 'Research note with citations (http URLs) and drift/residual severity'
      : next.id === 'discover'
        ? 'domain_spec proposal or discovery note with source:code / file paths'
        : next.id === 'surfaces'
          ? 'surface-inventory.json: every package language/surface (id, roots[], status=pending) from source:code'
          : next.id === 'author'
            ? 'Validated map proposal path (fields + sources[])'
            : next.id === 'source-edit'
              ? 'Update surface-inventory statuses (updated|residual for ALL languages) + production paths OR residual-no-field-edit'
              : next.id === 'handoff'
                ? 'REQUIRED all surfaces resolved + package_verify: green + live pr: URL — OR residual-no-pr. Fake PR URLs blocked.'
                : 'Non-empty note path describing step completion';

  const lines = [
    '# Current skill packet (Layerkit — fail-closed process)',
    '',
    '## Intent (why rails are on)',
    'This packet exists because the user opted into Layerkit integrate/heal',
    '(layerkit: … / agent start). It does not govern unrelated app work.',
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
    '## Forbidden (this step — integration purpose only)',
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

export interface AssertEvidenceOpts {
  /** Customer package root — enables on-disk path checks and package verify. */
  projectDir?: string;
}

/**
 * Validate evidence paths for a step: exists, min size, content pattern.
 * Throws on failure. Prefer passing projectDir so freestyle path lists fail closed.
 */
export function assertEvidenceForStep(
  stepId: string,
  evidencePaths: string[],
  resolveContent: (p: string) => string | null,
  opts?: AssertEvidenceOpts,
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

  const bodies: string[] = [];
  for (const p of clean) {
    const body = resolveContent(p);
    if (body) bodies.push(body);
  }
  if (stepId === 'surfaces') {
    if (!opts?.projectDir) {
      throw new Error(
        'surfaces_requires_project_dir: mark-done surfaces needs projectDir to write session inventory',
      );
    }
    assertSurfacesStepComplete(opts.projectDir, bodies);
  }
  if (stepId === 'source-edit') {
    assertSourceEditEvidence(bodies);
    if (opts?.projectDir) {
      assertSourceEditOnDisk(opts.projectDir, bodies);
      // Multi-lang gate: every inventoried language must be updated|residual (no pending)
      assertAllSurfacesResolved(opts.projectDir);
    }
  }
  if (stepId === 'handoff') {
    if (opts?.projectDir) {
      assertAllSurfacesResolved(opts.projectDir);
    }
    assertPackageVerify(bodies, opts?.projectDir);
    assertHandoffTerminal(bodies);
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


/**
 * mark-done requires a current skill packet from `agent next` for this exact step.
 * Prevents freelancing mark-done without loading the skill packet.
 */
export function assertSkillPacketForMarkDone(projectDir: string, stepId: string): void {
  const path = skillPacketPath(projectDir);
  if (!existsSync(path)) {
    throw new Error(
      'skill_packet_required: run `layerkit agent next` first so the current skill packet is written. ' +
        'Mark-done without a packet is freelancing and is blocked while the session is open.',
    );
  }
  const body = readFileSync(path, 'utf8');
  const m = body.match(/^step:\s*(\S+)/m);
  const packetStep = m?.[1];
  if (!packetStep) {
    throw new Error(
      'skill_packet_invalid: current-skill-packet.md missing step: line. Re-run `layerkit agent next`.',
    );
  }
  if (packetStep !== stepId) {
    throw new Error(
      `skill_packet_step_mismatch: packet is for step "${packetStep}" but mark-done requested "${stepId}". ` +
        `Run \`layerkit agent next\` and complete skill for "${packetStep}" only.`,
    );
  }
}

/** Whether pipeline has been started (status file present). */
export function requirePipelineStarted(projectDir: string): void {
  if (!existsSync(pipelineStatusPath(projectDir))) {
    throw new Error(
      'pipeline_not_started: intentional Layerkit session required. ' +
        'User should opt in with `layerkit: …` (or integrate/heal via Layerkit), then: ' +
        '`layerkit help` → `layerkit agent start --mode full|heal --vendor <v>` → `layerkit agent next`. ' +
        'Do not freestyle contract PRs without a session. Unrelated coding does not need Layerkit.',
    );
  }
}
