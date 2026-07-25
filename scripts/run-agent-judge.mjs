/**
 * Nightly agent transcript judge runner (NOT merge-bar CI).
 *
 * Prefers compiled dist when present; falls back to instructing a build.
 *
 * Usage:
 *   npm run eval:agent-judge
 *   node scripts/run-agent-judge.mjs
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const compiled = join(root, 'dist', 'evals', 'agent-judge', 'run.js');

if (!existsSync(compiled)) {
  console.error(
    'Missing dist/evals/agent-judge/run.js — run `npm run build` first (eval:agent-judge does this).',
  );
  process.exit(1);
}

const mod = await import(pathToFileURL(compiled).href);
const code = typeof mod.runAgentJudge === 'function' ? mod.runAgentJudge(root) : 1;
process.exit(code ?? 0);
