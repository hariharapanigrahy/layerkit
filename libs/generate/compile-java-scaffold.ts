/**
 * Compile a generated Java scaffold directory (mvn preferred, javac fallback).
 * Used by evals/gates/java-ref-compile and scripts/check-java-scaffold.mjs.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

export type CompileJavaTool = 'mvn' | 'javac' | 'none';

export interface CompileJavaResult {
  tool: CompileJavaTool;
  ok: boolean;
  output: string;
}

function commandAvailable(cmd: string): boolean {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const r = spawnSync(finder, [cmd], { encoding: 'utf8' });
  return r.status === 0;
}

function combineOutput(r: { stdout?: string | null; stderr?: string | null; error?: Error }): string {
  const parts = [r.stdout ?? '', r.stderr ?? ''];
  if (r.error) parts.push(r.error.message);
  return parts.join('').trim();
}

/**
 * Compile scaffold at `scaffoldDir`.
 * - If `mvn` is on PATH: `mvn -q -DskipTests compile`
 * - Else if `javac` is on PATH: `javac --release 17` on `javaSourcePaths`
 * - Else: fail with tool `none`
 */
export function compileJavaScaffold(opts: {
  scaffoldDir: string;
  /** Paths relative to scaffoldDir (or absolute) to .java sources — used by javac path */
  javaSourcePaths: string[];
}): CompileJavaResult {
  const { scaffoldDir, javaSourcePaths } = opts;

  if (commandAvailable('mvn')) {
    const r = spawnSync('mvn', ['-q', '-DskipTests', 'compile'], {
      cwd: scaffoldDir,
      encoding: 'utf8',
      env: process.env,
    });
    return { tool: 'mvn', ok: r.status === 0, output: combineOutput(r) };
  }

  if (commandAvailable('javac')) {
    if (javaSourcePaths.length === 0) {
      return { tool: 'javac', ok: false, output: 'no Java source files to compile' };
    }
    const classesDir = join(scaffoldDir, 'target', 'classes');
    mkdirSync(classesDir, { recursive: true });
    const absSources = javaSourcePaths.map((p) => (isAbsolute(p) ? p : join(scaffoldDir, p)));
    const r = spawnSync('javac', ['--release', '17', '-d', classesDir, ...absSources], {
      cwd: scaffoldDir,
      encoding: 'utf8',
      env: process.env,
    });
    return { tool: 'javac', ok: r.status === 0, output: combineOutput(r) };
  }

  return {
    tool: 'none',
    ok: false,
    output: 'neither mvn nor javac found on PATH',
  };
}
