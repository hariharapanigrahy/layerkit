/**
 * Load PrivacyPolicy documents from a project store (production path).
 * Promote writes under `{projectDir}/privacy/*.json`; track() must resolve the same.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { PrivacyPolicy } from './types.js';

export interface LoadPrivacyPolicyOpts {
  projectDir: string;
  /** Prefer this policy id (map.privacyPolicyId or explicit) */
  policyId?: string;
  /** Vendor id — tries privacy/{vendor}.json and vendor-prefixed files */
  vendor?: string;
}

function readPolicyFile(path: string): PrivacyPolicy | null {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as PrivacyPolicy;
    if (!raw || typeof raw !== 'object') return null;
    if (!raw.id || !raw.version) return null;
    return raw;
  } catch {
    return null;
  }
}

/**
 * Candidate basenames (no .json) in resolution order.
 */
export function privacyPolicyCandidates(opts: {
  policyId?: string;
  vendor?: string;
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (id?: string) => {
    const t = id?.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  add(opts.policyId);
  if (opts.vendor?.trim()) {
    const v = opts.vendor.trim();
    add(v);
    add(`${v}-default`);
    add(`${v}_default`);
  }
  add('default');
  add('default-allow');
  add('allow');
  return out;
}

/**
 * Resolve a privacy policy from disk.
 * Returns null when no readable policy matches (caller applies fail-closed rules).
 */
export function loadPrivacyPolicy(opts: LoadPrivacyPolicyOpts): PrivacyPolicy | null {
  const dir = join(opts.projectDir, 'privacy');
  if (!existsSync(dir)) return null;

  for (const id of privacyPolicyCandidates(opts)) {
    const path = join(dir, `${id}.json`);
    if (!existsSync(path)) continue;
    const policy = readPolicyFile(path);
    if (policy) return policy;
  }

  // Fallback: any file whose basename or internal id matches vendor loosely
  if (opts.vendor?.trim()) {
    const v = opts.vendor.trim().toLowerCase();
    try {
      for (const f of readdirSync(dir)) {
        if (!f.endsWith('.json')) continue;
        const base = f.slice(0, -'.json'.length).toLowerCase();
        if (
          base === v ||
          base.startsWith(v + '-') ||
          base.startsWith(v + '_') ||
          base.endsWith('-' + v) ||
          base.endsWith('_' + v)
        ) {
          const policy = readPolicyFile(join(dir, f));
          if (policy) return policy;
        }
      }
    } catch {
      // ignore
    }
  }

  return null;
}

/** List parseable privacy policies under projectDir/privacy. */
export function listPrivacyPolicies(
  projectDir: string,
): Array<{ id: string; path: string; policy: PrivacyPolicy }> {
  const dir = join(projectDir, 'privacy');
  if (!existsSync(dir)) return [];
  const out: Array<{ id: string; path: string; policy: PrivacyPolicy }> = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const path = join(dir, f);
    const policy = readPolicyFile(path);
    if (!policy) continue;
    out.push({ id: policy.id || f.slice(0, -'.json'.length), path, policy });
  }
  return out;
}
