/**
 * Open or update a client package PR for handoff.
 *
 * 1) If an open PR matches the PR-match key (same author, layerkit/ head, title/body/head tokens),
 *    push to that branch and return the existing PR URL (update, not duplicate).
 * 2) Else if collaborator on origin: push branch → create PR.
 * 3) Else: fork → push → PR into upstream.
 *
 * `--pr-match` is a free-form PR dedupe string only — not a vendor API registry or contract store.
 * Deterministic CLI helper; no LLM.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pickBestPrMatch, type PrMatchCandidate } from './pr-match.js';

/** Attribution link appended to client PR bodies. */
export const LAYERKIT_PRODUCT_URL = 'https://github.com/hariharapanigrahy/layerkit';

export interface OpenClientPrOpts {
  /** Customer package git root (usually projectDir or repoRoot). */
  cwd: string;
  /** Branch to create/push when opening a new PR. */
  branch?: string;
  title: string;
  body: string;
  /** Base branch on upstream (default main). */
  base?: string;
  /** Commit message if there are uncommitted production changes. */
  commitMessage?: string;
  /**
   * Free-form PR dedupe key (e.g. "heal multilang surfaces").
   * Matched against open PR title/body/head (author=@me, head contains layerkit/).
   * Not a vendor version registry — tokens only.
   */
  prMatch?: string;
  /**
   * @deprecated Alias of `prMatch` (CLI: `--usecase`). Prefer `--pr-match`.
   */
  usecase?: string;
  /** Default true: prefer updating an open matching PR over opening a new one. */
  reuseOpenPr?: boolean;
}

export interface OpenClientPrResult {
  prUrl: string;
  mode: 'direct' | 'fork';
  /** true when an existing open PR was updated instead of created */
  reused: boolean;
  head: string;
  base: string;
  branch: string;
  prNumber?: number;
}

function run(
  cmd: string,
  args: string[],
  cwd: string,
): { status: number; stdout: string; stderr: string } {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: 120_000 });
  return {
    status: r.status ?? 1,
    stdout: (r.stdout ?? '').trim(),
    stderr: (r.stderr ?? '').trim(),
  };
}

function requireGitRepo(cwd: string): void {
  if (!existsSync(join(cwd, '.git'))) {
    throw new Error(`not_a_git_repo: ${cwd}`);
  }
}

/** Parse owner/repo from git remote URL. */
export function parseGithubOwnerRepo(remoteUrl: string): { owner: string; repo: string } | null {
  const m = remoteUrl.match(/github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?$/i);
  if (!m) return null;
  return { owner: m[1]!, repo: m[2]! };
}

function remoteUrl(cwd: string, name: string): string | null {
  const r = run('git', ['remote', 'get-url', name], cwd);
  if (r.status !== 0) return null;
  return r.stdout;
}

/** True when the logged-in gh user can push to owner/repo. */
export function canPushToGithubRepo(owner: string, repo: string, cwd: string): boolean {
  const r = run(
    'gh',
    ['api', `repos/${owner}/${repo}`, '--jq', '.permissions.push // false'],
    cwd,
  );
  if (r.status !== 0) return false;
  return r.stdout === 'true' || r.stdout === 'True';
}

function currentUserLogin(cwd: string): string {
  const r = run('gh', ['api', 'user', '--jq', '.login'], cwd);
  if (r.status !== 0 || !r.stdout) {
    throw new Error(`gh_user_required: ${r.stderr || 'not logged in'}`);
  }
  return r.stdout;
}

/**
 * Switch to branch without resetting an existing tip.
 * - already on branch → no-op
 * - local branch exists → checkout (no -B)
 * - otherwise → create with -b from current HEAD
 */
function ensureOnBranch(cwd: string, branch: string): void {
  const cur = run('git', ['branch', '--show-current'], cwd);
  if (cur.stdout === branch) return;

  const exists = run('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], cwd);
  if (exists.status === 0) {
    const co = run('git', ['checkout', branch], cwd);
    if (co.status !== 0) {
      throw new Error(`git_checkout_failed: ${co.stderr || co.stdout}`);
    }
    return;
  }

  const co = run('git', ['checkout', '-b', branch], cwd);
  if (co.status !== 0) {
    throw new Error(`git_checkout_failed: ${co.stderr || co.stdout}`);
  }
}

const LAYERKIT_JUNK =
  /^(memory\/|\.cursor\/|\.layerkit\/|layerkit\.path\.json$|project\.json$|domain\.json$|AGENTS\.md$)/;

function commitIfNeeded(cwd: string, message: string): void {
  const st = run('git', ['status', '--porcelain'], cwd);
  if (!st.stdout.trim()) return;
  const lines = st.stdout.split('\n').filter(Boolean);
  let staged = 0;
  for (const line of lines) {
    const path = line.slice(3).trim().replace(/^"|"$/g, '');
    if (!path || LAYERKIT_JUNK.test(path)) continue;
    if (run('git', ['add', '--', path], cwd).status === 0) staged++;
  }
  if (staged === 0) return;
  const c = run('git', ['commit', '-m', message], cwd);
  if (c.status !== 0) {
    throw new Error(`git_commit_failed: ${c.stderr || c.stdout}`);
  }
}

interface ExistingPr {
  number: number;
  url: string;
  title: string;
  body: string;
  headRefName: string;
  headRepositoryOwner: string;
}

/**
 * Find an open PR matching the PR-dedupe key (author = me, layerkit head, title/body/head tokens).
 * Not a vendor contract lookup — string match only.
 * When several PRs match, picks the best score (head token hits preferred over body-only).
 */
export function findOpenPrByMatch(
  owner: string,
  repo: string,
  login: string,
  prMatch: string,
  cwd: string,
  opts?: { explicitMatch?: boolean },
): ExistingPr | null {
  const list = run(
    'gh',
    [
      'pr',
      'list',
      '--repo',
      `${owner}/${repo}`,
      '--author',
      '@me',
      '--state',
      'open',
      '--limit',
      '30',
      '--json',
      'number,url,title,body,headRefName,headRepositoryOwner',
    ],
    cwd,
  );
  if (list.status !== 0 || !list.stdout) return null;

  type Raw = {
    number: number;
    url: string;
    title: string;
    body: string;
    headRefName: string;
    headRepositoryOwner?: { login?: string } | string;
  };
  let prs: Raw[] = [];
  try {
    prs = JSON.parse(list.stdout) as Raw[];
  } catch {
    return null;
  }

  const candidates: PrMatchCandidate[] = prs.map((pr) => {
    const ownerLogin =
      typeof pr.headRepositoryOwner === 'string'
        ? pr.headRepositoryOwner
        : pr.headRepositoryOwner?.login ?? '';
    return {
      number: pr.number,
      url: pr.url,
      title: pr.title,
      body: pr.body ?? '',
      headRefName: pr.headRefName,
      headRepositoryOwner: ownerLogin || login,
    };
  });

  const best = pickBestPrMatch(candidates, prMatch, opts);
  if (!best) return null;
  return {
    number: best.number,
    url: best.url,
    title: best.title,
    body: best.body,
    headRefName: best.headRefName,
    headRepositoryOwner: best.headRepositoryOwner || login,
  };
}

/** @deprecated Use findOpenPrByMatch */
export function findOpenPrForUsecase(
  owner: string,
  repo: string,
  login: string,
  usecase: string,
  cwd: string,
): ExistingPr | null {
  return findOpenPrByMatch(owner, repo, login, usecase, cwd, { explicitMatch: true });
}

function ensureForkRemote(cwd: string, forkSlug: string): void {
  const hasFork = remoteUrl(cwd, 'fork');
  if (!hasFork) {
    const add = run('git', ['remote', 'add', 'fork', `https://github.com/${forkSlug}.git`], cwd);
    if (add.status !== 0 && !/already exists/i.test(add.stderr)) {
      run('git', ['remote', 'set-url', 'fork', `https://github.com/${forkSlug}.git`], cwd);
    }
  } else {
    run('git', ['remote', 'set-url', 'fork', `https://github.com/${forkSlug}.git`], cwd);
  }
}

function pushBranch(cwd: string, remote: 'origin' | 'fork', branch: string): void {
  const push = run('git', ['push', '-u', remote, branch], cwd);
  if (push.status !== 0) {
    throw new Error(`git_push_failed (${remote}): ${push.stderr || push.stdout}`);
  }
}

function layerkitAttributionBody(body: string): string {
  if (new RegExp(LAYERKIT_PRODUCT_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(body)) {
    return body;
  }
  return `${body}\n\n---\nProduced with [Layerkit](${LAYERKIT_PRODUCT_URL}).\n`;
}

/**
 * Open or update PR: reuse open matching PR when possible; else direct or fork path.
 */
export function openClientPr(opts: OpenClientPrOpts): OpenClientPrResult {
  const cwd = opts.cwd;
  requireGitRepo(cwd);
  const base = opts.base ?? 'main';
  const reuse = opts.reuseOpenPr !== false;
  const login = currentUserLogin(cwd);

  const origin =
    remoteUrl(cwd, 'origin') ||
    (() => {
      throw new Error('git_remote_missing: origin');
    })();
  const parsed = parseGithubOwnerRepo(origin);
  if (!parsed) {
    throw new Error(`git_remote_not_github: ${origin}`);
  }

  const canPush = canPushToGithubRepo(parsed.owner, parsed.repo, cwd);
  const explicitKey = (opts.prMatch ?? opts.usecase)?.trim() || '';
  const prMatch =
    explicitKey ||
    opts.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48);

  // 1) Reuse open PR for same workstream match key
  if (reuse) {
    const existing = findOpenPrByMatch(parsed.owner, parsed.repo, login, prMatch, cwd, {
      explicitMatch: Boolean(explicitKey),
    });
    if (existing) {
      const branch = existing.headRefName;
      ensureOnBranch(cwd, branch);
      if (opts.commitMessage) commitIfNeeded(cwd, opts.commitMessage);

      const remote: 'origin' | 'fork' = canPush ? 'origin' : 'fork';
      if (!canPush) {
        run(
          'gh',
          ['repo', 'fork', `${parsed.owner}/${parsed.repo}`, '--remote=false', '--clone=false'],
          cwd,
        );
        ensureForkRemote(cwd, `${login}/${parsed.repo}`);
      }
      pushBranch(cwd, remote, branch);

      if (!new RegExp(LAYERKIT_PRODUCT_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(existing.body)) {
        run(
          'gh',
          [
            'pr',
            'edit',
            String(existing.number),
            '--repo',
            `${parsed.owner}/${parsed.repo}`,
            '--body',
            layerkitAttributionBody(opts.body),
          ],
          cwd,
        );
      }

      const head = canPush ? branch : `${login}:${branch}`;
      return {
        prUrl: existing.url,
        mode: canPush ? 'direct' : 'fork',
        reused: true,
        head,
        base,
        branch,
        prNumber: existing.number,
      };
    }
  }

  // 2) New PR
  const branch =
    opts.branch ??
    `layerkit/heal-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;

  ensureOnBranch(cwd, branch);
  if (opts.commitMessage) commitIfNeeded(cwd, opts.commitMessage);

  const bodyWithLk = layerkitAttributionBody(opts.body);

  if (canPush) {
    pushBranch(cwd, 'origin', branch);
    const pr = run(
      'gh',
      [
        'pr',
        'create',
        '--repo',
        `${parsed.owner}/${parsed.repo}`,
        '--base',
        base,
        '--head',
        branch,
        '--title',
        opts.title,
        '--body',
        bodyWithLk,
      ],
      cwd,
    );
    if (pr.status !== 0) {
      throw new Error(`gh_pr_create_failed: ${pr.stderr || pr.stdout}`);
    }
    const prUrl = pr.stdout.split(/\s+/).find((s) => s.startsWith('http')) || pr.stdout;
    return { prUrl, mode: 'direct', reused: false, head: branch, base, branch };
  }

  // fork path
  run(
    'gh',
    ['repo', 'fork', `${parsed.owner}/${parsed.repo}`, '--remote=false', '--clone=false'],
    cwd,
  );
  ensureForkRemote(cwd, `${login}/${parsed.repo}`);
  pushBranch(cwd, 'fork', branch);

  const head = `${login}:${branch}`;
  const pr = run(
    'gh',
    [
      'pr',
      'create',
      '--repo',
      `${parsed.owner}/${parsed.repo}`,
      '--base',
      base,
      '--head',
      head,
      '--title',
      opts.title,
      '--body',
      bodyWithLk,
    ],
    cwd,
  );
  if (pr.status !== 0) {
    throw new Error(`gh_pr_create_fork_failed: ${pr.stderr || pr.stdout}`);
  }
  const prUrl = pr.stdout.split(/\s+/).find((s) => s.startsWith('http')) || pr.stdout;
  return { prUrl, mode: 'fork', reused: false, head, base, branch };
}
