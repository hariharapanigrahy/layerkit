/**
 * Deterministic eval harness runner.
 *
 * Usage:
 *   node dist/evals/harness/runner.js --suite ci
 *   node dist/evals/harness/runner.js --case proposal-sources-required
 *   node dist/evals/harness/runner.js --list
 *   node dist/evals/harness/runner.js --suite ci --json   # JSON only on stdout; logs on stderr
 *
 * Exit codes:
 *   0 — all cases passed (or suite intentionally empty: nightly only)
 *   1 — failure, missing gate, unknown suite, or empty non-nightly suite
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CaseMeta, GateCheckResult, GateResult, SuitesConfig } from './types.js';

/** Default per-gate timeout (ms). Override with EVAL_GATE_TIMEOUT_MS. */
const DEFAULT_GATE_TIMEOUT_MS = 60_000;

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

function gateTimeoutMs(): number {
  const raw = process.env.EVAL_GATE_TIMEOUT_MS;
  if (raw && /^\d+$/.test(raw)) return Number(raw);
  return DEFAULT_GATE_TIMEOUT_MS;
}

function resolveCaseIds(
  repoRoot: string,
  suite: string | undefined,
  single: string | undefined,
): { ids: string[]; suiteName: string } {
  if (single) return { ids: [single], suiteName: `case:${single}` };
  const suites = loadSuites(repoRoot);
  const name = suite ?? 'ci';
  const ids = suites[name];
  if (!ids) {
    throw new Error(
      `Unknown suite "${name}". Known: ${Object.keys(suites).sort().join(', ')}`,
    );
  }
  return { ids, suiteName: name };
}

/** Parse PASS/FAIL lines from gate stdout into GateCheckResult[]. */
function parseChecks(output: string): GateCheckResult[] {
  const checks: GateCheckResult[] = [];
  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith('PASS ')) {
      checks.push({ name: line.slice(5).trim(), ok: true });
    } else if (line.startsWith('FAIL ')) {
      const rest = line.slice(5);
      const colon = rest.indexOf(':');
      if (colon === -1) {
        checks.push({ name: rest.trim(), ok: false });
      } else {
        checks.push({
          name: rest.slice(0, colon).trim(),
          ok: false,
          detail: rest.slice(colon + 1).trim(),
        });
      }
    }
  }
  return checks;
}

function log(jsonMode: boolean, stream: 'out' | 'err', msg: string): void {
  // In --json mode, human-readable lines go to stderr so stdout is pure JSON.
  if (jsonMode || stream === 'err') {
    console.error(msg);
  } else {
    console.log(msg);
  }
}

function runGate(repoRoot: string, id: string, jsonMode: boolean): GateResult {
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

  const timeout = gateTimeoutMs();
  log(jsonMode, 'out', `\n── gate: ${id} ──`);

  // Capture stdout/stderr so we can parse PASS/FAIL and still show them.
  const result = spawnSync(process.execPath, [runJs], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: process.env,
    timeout,
    killSignal: 'SIGKILL',
    maxBuffer: 8 * 1024 * 1024,
  });
  const ms = Date.now() - start;
  const combined = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.stdout) {
    for (const line of result.stdout.split(/\r?\n/)) {
      if (line.length) log(jsonMode, 'out', line);
    }
  }
  if (result.stderr) {
    for (const line of result.stderr.split(/\r?\n/)) {
      if (line.length) log(jsonMode, 'err', line);
    }
  }

  const checks = parseChecks(combined);
  const timedOut = result.error?.message?.includes('TIMEDOUT') === true || result.signal === 'SIGKILL';

  if (timedOut && result.status === null) {
    const detail = `timeout after ${timeout}ms (set EVAL_GATE_TIMEOUT_MS to override)`;
    log(jsonMode, 'err', `GATE FAIL ${id} (${ms}ms): ${detail}`);
    return { id, ok: false, checks, ms, error: detail };
  }

  const ok = result.status === 0;
  if (!ok) {
    const detail =
      result.error?.message ??
      (result.signal ? `signal ${result.signal}` : `exit ${result.status ?? 1}`);
    log(jsonMode, 'err', `GATE FAIL ${id} (${ms}ms): ${detail}`);
    return { id, ok: false, checks, ms, error: detail };
  }
  log(jsonMode, 'out', `GATE PASS ${id} (${ms}ms)`);
  return { id, ok: true, checks, ms };
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
  console.log(
    '\nNote: empty suites fail with exit 1 except suite "nightly" (exit 0 + warning until agent judges land).',
  );
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
      console.log(
        `Usage: runner [--suite ci|all|nightly] [--case <id>] [--list] [--json]
  --json   Human logs on stderr; single JSON document on stdout
  Empty suite "nightly" exits 0; other empty suites exit 1
  Per-gate timeout: EVAL_GATE_TIMEOUT_MS (default ${DEFAULT_GATE_TIMEOUT_MS})`,
      );
      process.exit(0);
    }
  }
  return out;
}

async function main(): Promise<void> {
  const repoRoot = findRepoRoot();
  const args = parseArgs(process.argv.slice(2));
  const jsonMode = args.json === true;

  if (args.list) {
    printList(repoRoot);
    return;
  }

  const { ids, suiteName } = resolveCaseIds(repoRoot, args.suite, args.caseId);
  if (ids.length === 0) {
    // nightly may be empty until agent judges land; other suites fail closed.
    if (suiteName === 'nightly') {
      log(jsonMode, 'err', 'Suite "nightly" is empty — nothing to run (exit 0).');
      if (jsonMode) {
        console.log(
          JSON.stringify({
            suite: suiteName,
            results: [],
            passed: 0,
            failed: 0,
            empty: true,
          }),
        );
      }
      process.exit(0);
    }
    log(jsonMode, 'err', `No cases to run for suite "${suiteName}" (empty suites fail closed except nightly)`);
    process.exit(1);
  }

  log(jsonMode, 'out', `Eval harness — suite=${suiteName} root=${repoRoot}`);
  log(jsonMode, 'out', `Cases: ${ids.join(', ')}`);

  const results: GateResult[] = [];
  for (const id of ids) {
    results.push(runGate(repoRoot, id, jsonMode));
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  const totalMs = results.reduce((s, r) => s + r.ms, 0);

  log(jsonMode, 'out', '\n══ summary ══');
  log(jsonMode, 'out', `passed: ${passed}/${results.length}  failed: ${failed.length}  ${totalMs}ms`);
  if (failed.length) {
    for (const f of failed) {
      log(jsonMode, 'err', `  FAIL ${f.id}${f.error ? `: ${f.error}` : ''}`);
    }
  }

  if (jsonMode) {
    // Pure JSON on stdout for machine consumers.
    console.log(
      JSON.stringify(
        {
          suite: suiteName,
          results,
          passed,
          failed: failed.length,
          totalMs,
        },
        null,
        2,
      ),
    );
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
