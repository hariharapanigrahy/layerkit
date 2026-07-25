/**
 * Deterministic eval harness runner.
 *
 * Usage:
 *   node dist/evals/harness/runner.js --suite ci
 *   node dist/evals/harness/runner.js --case proposal-sources-required
 *   node dist/evals/harness/runner.js --list
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CaseMeta, GateResult, SuitesConfig } from './types.js';

function findRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'evals'))) {
      return dir;
    }
    dir = dirname(dir);
  }
  return process.cwd();
}

function loadSuites(repoRoot: string): SuitesConfig {
  const path = join(repoRoot, 'evals', 'suites.json');
  if (!existsSync(path)) {
    throw new Error(`Missing evals/suites.json at ${path}`);
  }
  return JSON.parse(readFileSync(path, 'utf8')) as SuitesConfig;
}

function gatesDir(repoRoot: string): string {
  return join(repoRoot, 'evals', 'gates');
}

function compiledGateRun(repoRoot: string, id: string): string {
  return join(repoRoot, 'dist', 'evals', 'gates', id, 'run.js');
}

function discoverGateIds(repoRoot: string): string[] {
  const dir = gatesDir(repoRoot);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((id) => existsSync(join(dir, id, 'run.ts')) || existsSync(compiledGateRun(repoRoot, id)))
    .sort();
}

function loadCaseMeta(repoRoot: string, id: string): CaseMeta | null {
  const path = join(gatesDir(repoRoot), id, 'case.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as CaseMeta;
}

function resolveCaseIds(repoRoot: string, suite: string | undefined, single: string | undefined): string[] {
  if (single) return [single];
  const suites = loadSuites(repoRoot);
  const name = suite ?? 'ci';
  const ids = suites[name];
  if (!ids) {
    throw new Error(
      `Unknown suite "${name}". Known: ${Object.keys(suites).sort().join(', ')}`,
    );
  }
  return ids;
}

function runGate(repoRoot: string, id: string): GateResult {
  const runJs = compiledGateRun(repoRoot, id);
  const start = Date.now();
  if (!existsSync(runJs)) {
    return {
      id,
      ok: false,
      checks: [],
      ms: Date.now() - start,
      error: `Compiled gate missing: ${runJs} (run npm run build)`,
    };
  }

  console.log(`\n── gate: ${id} ──`);
  const result = spawnSync(process.execPath, [runJs], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  });
  const ms = Date.now() - start;
  const ok = result.status === 0;
  if (!ok) {
    const detail =
      result.error?.message ??
      (result.signal ? `signal ${result.signal}` : `exit ${result.status ?? 1}`);
    console.error(`GATE FAIL ${id} (${ms}ms): ${detail}`);
    return { id, ok: false, checks: [], ms, error: detail };
  }
  console.log(`GATE PASS ${id} (${ms}ms)`);
  return { id, ok: true, checks: [], ms };
}

function printList(repoRoot: string): void {
  const suites = loadSuites(repoRoot);
  const discovered = discoverGateIds(repoRoot);
  console.log('Suites (evals/suites.json):');
  for (const [name, ids] of Object.entries(suites)) {
    console.log(`  ${name}: ${ids.length} case(s)`);
    for (const id of ids) {
      const meta = loadCaseMeta(repoRoot, id);
      const mark = discovered.includes(id) ? '✓' : '✗ missing';
      console.log(`    - ${id} ${mark}${meta?.title ? ` — ${meta.title}` : ''}`);
    }
  }
  console.log('\nDiscovered gates:');
  for (const id of discovered) {
    console.log(`  - ${id}`);
  }
}

function parseArgs(argv: string[]): {
  suite?: string;
  caseId?: string;
  list?: boolean;
  json?: boolean;
} {
  const out: { suite?: string; caseId?: string; list?: boolean; json?: boolean } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--suite' && argv[i + 1]) {
      out.suite = argv[++i];
    } else if (a === '--case' && argv[i + 1]) {
      out.caseId = argv[++i];
    } else if (a === '--list') {
      out.list = true;
    } else if (a === '--json') {
      out.json = true;
    } else if (a === '--help' || a === '-h') {
      console.log(`Usage: runner [--suite ci|all|nightly] [--case <id>] [--list] [--json]`);
      process.exit(0);
    }
  }
  return out;
}

async function main(): Promise<void> {
  const repoRoot = findRepoRoot();
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    printList(repoRoot);
    return;
  }

  const ids = resolveCaseIds(repoRoot, args.suite, args.caseId);
  if (ids.length === 0) {
    console.error('No cases to run');
    process.exit(1);
  }

  const suiteLabel = args.caseId ? `case:${args.caseId}` : (args.suite ?? 'ci');
  console.log(`Eval harness — suite=${suiteLabel} root=${repoRoot}`);
  console.log(`Cases: ${ids.join(', ')}`);

  const results: GateResult[] = [];
  for (const id of ids) {
    results.push(runGate(repoRoot, id));
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  const totalMs = results.reduce((s, r) => s + r.ms, 0);

  console.log('\n══ summary ══');
  console.log(`passed: ${passed}/${results.length}  failed: ${failed.length}  ${totalMs}ms`);
  if (failed.length) {
    for (const f of failed) {
      console.error(`  FAIL ${f.id}${f.error ? `: ${f.error}` : ''}`);
    }
  }

  if (args.json) {
    console.log(JSON.stringify({ suite: suiteLabel, results, passed, failed: failed.length }, null, 2));
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
