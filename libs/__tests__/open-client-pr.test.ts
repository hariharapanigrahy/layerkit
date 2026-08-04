import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  openClientPr,
  setOpenClientPrProcessRunnerForTests,
  type ProcessRunner,
  type ProcessRunResult,
} from '../agent/open-client-pr.js';

function ok(stdout = ''): ProcessRunResult {
  return { status: 0, stdout, stderr: '' };
}
function fail(stderr = 'err'): ProcessRunResult {
  return { status: 1, stdout: '', stderr };
}

function tempGitRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'layerkit-pr-'));
  mkdirSync(join(root, '.git'), { recursive: true });
  return root;
}

type Scenario = {
  canPush: boolean;
  /** Open PRs JSON for `gh pr list` */
  openPrs?: unknown[];
  branchExists?: boolean;
  currentBranch?: string;
};

function mockRunner(scenario: Scenario): { run: ProcessRunner; calls: string[] } {
  const calls: string[] = [];
  const openPrs = scenario.openPrs ?? [];
  const run: ProcessRunner = (cmd, args) => {
    const line = `${cmd} ${args.join(' ')}`;
    calls.push(line);

    if (cmd === 'gh' && args[0] === 'api' && args.includes('user')) {
      return ok('tester');
    }
    if (cmd === 'git' && args[0] === 'remote' && args[1] === 'get-url' && args[2] === 'origin') {
      return ok('https://github.com/acme/customer-package.git');
    }
    if (cmd === 'git' && args[0] === 'remote' && args[1] === 'get-url' && args[2] === 'fork') {
      return fail('no fork');
    }
    if (
      cmd === 'gh' &&
      args[0] === 'api' &&
      args[1]?.startsWith('repos/acme/customer-package') &&
      args.includes('.permissions.push // false')
    ) {
      return ok(scenario.canPush ? 'true' : 'false');
    }
    if (cmd === 'gh' && args[0] === 'pr' && args[1] === 'list') {
      return ok(JSON.stringify(openPrs));
    }
    if (cmd === 'git' && args[0] === 'branch' && args[1] === '--show-current') {
      return ok(scenario.currentBranch ?? 'main');
    }
    if (cmd === 'git' && args[0] === 'show-ref') {
      return scenario.branchExists ? ok() : fail();
    }
    if (cmd === 'git' && args[0] === 'checkout') {
      return ok();
    }
    if (cmd === 'git' && args[0] === 'status') {
      return ok('');
    }
    if (cmd === 'git' && args[0] === 'push') {
      return ok();
    }
    if (cmd === 'git' && args[0] === 'remote' && args[1] === 'add') {
      return ok();
    }
    if (cmd === 'git' && args[0] === 'remote' && args[1] === 'set-url') {
      return ok();
    }
    if (cmd === 'gh' && args[0] === 'repo' && args[1] === 'fork') {
      return ok();
    }
    if (cmd === 'gh' && args[0] === 'pr' && args[1] === 'create') {
      return ok('https://github.com/acme/customer-package/pull/99');
    }
    if (cmd === 'gh' && args[0] === 'pr' && args[1] === 'edit') {
      return ok();
    }
    return fail(`unmocked: ${line}`);
  };
  return { run, calls };
}

afterEach(() => {
  setOpenClientPrProcessRunnerForTests(null);
});

describe('openClientPr (mocked git/gh)', () => {
  it('opens a direct PR when collaborator can push', () => {
    const cwd = tempGitRoot();
    try {
      const { run, calls } = mockRunner({ canPush: true, openPrs: [] });
      setOpenClientPrProcessRunnerForTests(run);

      const result = openClientPr({
        cwd,
        title: 'Heal acme multilang',
        body: 'body',
        branch: 'layerkit/heal-test',
        reuseOpenPr: true,
        prMatch: 'no-match-key-zzzz',
      });

      expect(result.mode).toBe('direct');
      expect(result.reused).toBe(false);
      expect(result.prUrl).toContain('/pull/99');
      expect(calls.some((c) => c.includes('git push -u origin'))).toBe(true);
      expect(calls.some((c) => c.includes('gh pr create'))).toBe(true);
      expect(calls.some((c) => c.includes('repo fork'))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('forks when not a collaborator', () => {
    const cwd = tempGitRoot();
    try {
      const { run, calls } = mockRunner({ canPush: false, openPrs: [] });
      setOpenClientPrProcessRunnerForTests(run);

      const result = openClientPr({
        cwd,
        title: 'Heal acme multilang',
        body: 'body',
        branch: 'layerkit/heal-fork',
        reuseOpenPr: false,
      });

      expect(result.mode).toBe('fork');
      expect(result.reused).toBe(false);
      expect(result.head).toBe('tester:layerkit/heal-fork');
      expect(calls.some((c) => c.includes('repo fork'))).toBe(true);
      expect(calls.some((c) => c.includes('git push -u fork'))).toBe(true);
      expect(calls.some((c) => c.includes('--head tester:layerkit/heal-fork'))).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('reuses an open matching PR and pushes without create', () => {
    const cwd = tempGitRoot();
    try {
      const { run, calls } = mockRunner({
        canPush: false,
        branchExists: true,
        currentBranch: 'main',
        openPrs: [
          {
            number: 42,
            url: 'https://github.com/acme/customer-package/pull/42',
            title: 'heal multilang surfaces',
            body: 'work',
            headRefName: 'layerkit/heal-multilang-surfaces',
            headRepositoryOwner: { login: 'tester' },
          },
        ],
      });
      setOpenClientPrProcessRunnerForTests(run);

      const result = openClientPr({
        cwd,
        title: 'ignored when prMatch set',
        body: 'updated body',
        prMatch: 'heal multilang surfaces',
        reuseOpenPr: true,
      });

      expect(result.reused).toBe(true);
      expect(result.prNumber).toBe(42);
      expect(result.prUrl).toContain('/pull/42');
      expect(result.mode).toBe('fork');
      expect(result.branch).toBe('layerkit/heal-multilang-surfaces');
      expect(calls.some((c) => c.includes('git checkout layerkit/heal-multilang-surfaces'))).toBe(
        true,
      );
      expect(calls.some((c) => c.includes('git push -u fork'))).toBe(true);
      expect(calls.some((c) => c.includes('gh pr create'))).toBe(false);
      expect(calls.some((c) => c.includes('gh pr edit'))).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
