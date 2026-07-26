/**
 * Load RoutingPolicy from project store.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { RoutingPolicy } from './types.js';
import { validateRoutingPolicy } from './validate.js';

export function routingPolicyPath(projectDir: string, id?: string): string {
  if (id && id !== 'default') {
    return join(projectDir, 'routing', `${id}.json`);
  }
  return join(projectDir, 'routing.json');
}

export function loadRoutingPolicy(
  projectDir: string,
  id?: string,
): RoutingPolicy | null {
  const primary = routingPolicyPath(projectDir, id);
  if (existsSync(primary)) {
    return readPolicyFile(primary);
  }
  // fallback: routing/default.json
  const fallback = join(projectDir, 'routing', 'default.json');
  if (!id && existsSync(fallback)) {
    return readPolicyFile(fallback);
  }
  return null;
}

function readPolicyFile(path: string): RoutingPolicy | null {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as RoutingPolicy;
    const issues = validateRoutingPolicy(raw);
    if (issues.some((i) => i.level === 'error')) {
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

export function listRoutingPolicies(
  projectDir: string,
): Array<{ id: string; path: string }> {
  const out: Array<{ id: string; path: string }> = [];
  const root = join(projectDir, 'routing.json');
  if (existsSync(root)) {
    try {
      const p = JSON.parse(readFileSync(root, 'utf8')) as RoutingPolicy;
      out.push({ id: p.id || 'default', path: root });
    } catch {
      out.push({ id: 'default', path: root });
    }
  }
  const dir = join(projectDir, 'routing');
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      out.push({ id: f.slice(0, -'.json'.length), path: join(dir, f) });
    }
  }
  return out;
}
