/**
 * Hard gates for promote (map_complete → live).
 * Pure / store-light checks so evals can exercise without CLI or JaCoCo.
 *
 * Gates (all required unless skipped by flag):
 * 1. map_status — map_complete with fields or intents
 * 2. quality — JaCoCo (CLI supplies result; skip with --no-strict)
 * 3. secret_scan — no doctor secret-scan error findings
 * 4. privacy_policy — explicit policy before live promotion
 * 5. dry_run — applyVendorMap produces wire for purchase or first intent
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DomainEvent } from '../domain/event.js';
import type { VendorMap } from '../domain/types.js';
import {
  scanJsonForSecrets,
  type SecretFinding,
} from '../doctor/secret-scan.js';
import { applyVendorMap } from '../vendor-memory/map-engine.js';

export type PromoteGateId =
  | 'map_status'
  | 'quality'
  | 'secret_scan'
  | 'privacy_policy'
  | 'dry_run';

export interface PromoteGateFailure {
  gate: PromoteGateId;
  /** Vendor when the failure is map-scoped */
  vendor?: string;
  message: string;
}

export interface PromoteGatesInput {
  /** Maps considered for promote (typically one vendor or all non-live maps). */
  maps: VendorMap[];
  /**
   * Project-wide secret findings (from store.doctor().secretFindings or scan).
   * Error-level findings fail the secret_scan gate.
   */
  secretFindings?: SecretFinding[];
  /**
   * Privacy policy ids present under projectDir/privacy (or supplied for tests).
   * When omitted and projectDir is set, policies are listed from disk.
   */
  privacyPolicyIds?: string[];
  /** Store root; used to list privacy/*.json when privacyPolicyIds not given. */
  projectDir?: string;
  /**
   * Quality check result from checkJavaQuality.
   * When skipQuality is false (default), quality.ok must be true.
   */
  quality?: { ok: boolean; lines?: string[] };
  /** Skip quality gate (--no-strict). Default false. */
  skipQuality?: boolean;
  /**
   * Require dry-run applyVendorMap success (default true).
   * Set false for --no-dry-run-check break-glass.
   */
  requireDryRun?: boolean;
  /** Optional dry-run event overrides (defaults: purchase + minimal ids). */
  dryRunEvent?: Partial<DomainEvent>;
  /**
   * Optional processorsDir for applyVendorMap during dry-run
   * (e.g. projectDir/processors).
   */
  processorsDir?: string;
}

export interface PromoteGatesResult {
  ok: boolean;
  failures: PromoteGateFailure[];
  /** Human-readable lines for CLI (includes ✓ / ✗ per gate). */
  lines: string[];
  /** Vendors that passed all map-scoped gates (ready to set live). */
  eligibleVendors: string[];
}

/**
 * List privacy policy ids from `{projectDir}/privacy/*.json`.
 * Ids are file basenames without `.json`, plus optional `id` field inside JSON.
 */
export function listPrivacyPolicyIds(projectDir: string): string[] {
  const dir = join(projectDir, 'privacy');
  if (!existsSync(dir)) return [];
  const ids = new Set<string>();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const base = f.slice(0, -'.json'.length);
    ids.add(base);
    try {
      const raw = JSON.parse(readFileSync(join(dir, f), 'utf8')) as { id?: string };
      if (typeof raw.id === 'string' && raw.id) ids.add(raw.id);
    } catch {
      // ignore unreadable policy files
    }
  }
  return [...ids];
}

/**
 * Whether a privacy policy exists for this vendor (exact id, vendor-prefixed, or default).
 */
export function hasPrivacyPolicyForVendor(
  vendor: string,
  policyIds: string[],
): boolean {
  if (policyIds.length === 0) return false;
  const v = vendor.toLowerCase();
  for (const id of policyIds) {
    const lower = id.toLowerCase();
    if (lower === v) return true;
    if (lower.startsWith(v + '-') || lower.startsWith(v + '_')) return true;
    if (lower.endsWith('-' + v) || lower.endsWith('_' + v)) return true;
    // common defaults that cover all vendors in a project
    if (lower === 'default' || lower === 'default-allow' || lower === 'allow') return true;
  }
  return false;
}

/**
 * Map status gate: must be map_complete (not draft/skeleton) with fields or intents.
 * Already-live maps are not "failed" — they are skipped by the caller.
 */
export function checkMapStatusGate(map: VendorMap): PromoteGateFailure | null {
  const filled =
    (map.fields?.length ?? 0) > 0 || Object.keys(map.intents ?? {}).length > 0;
  if (!filled) {
    return {
      gate: 'map_status',
      vendor: map.vendor,
      message: `map ${map.vendor}: empty (need fields or intents)`,
    };
  }
  if (map.status === 'live') {
    return null; // already live — not a gate failure
  }
  if (map.status !== 'map_complete') {
    return {
      gate: 'map_status',
      vendor: map.vendor,
      message: `map ${map.vendor}: status=${map.status ?? '?'} (need map_complete with fields/intents)`,
    };
  }
  return null;
}

/**
 * Collect secret findings for maps (and optional proposals) via doctor scan APIs.
 */
export function collectSecretFindings(
  maps: VendorMap[],
  proposals: unknown[] = [],
): SecretFinding[] {
  const out: SecretFinding[] = [];
  for (const m of maps) {
    for (const f of scanJsonForSecrets(m, '')) {
      out.push({ ...f, path: `map:${m.vendor}/${f.path}` });
    }
  }
  proposals.forEach((p, i) => {
    const id =
      p && typeof p === 'object' && typeof (p as { id?: string }).id === 'string'
        ? (p as { id: string }).id
        : String(i);
    for (const f of scanJsonForSecrets(p, '')) {
      out.push({ ...f, path: `proposal:${id}/${f.path}` });
    }
  });
  return out;
}

/** Critical secret findings (level === 'error'). */
export function criticalSecretFindings(findings: SecretFinding[]): SecretFinding[] {
  return findings.filter((f) => f.level === 'error');
}

/**
 * Dry-run gate: applyVendorMap must not throw and must produce a non-null wire
 * for intent `purchase` when present, else the first intent key.
 */
export function checkDryRunGate(
  map: VendorMap,
  opts?: {
    dryRunEvent?: Partial<DomainEvent>;
    processorsDir?: string;
  },
): PromoteGateFailure | null {
  const intentKeys = Object.keys(map.intents ?? {});
  const intent =
    intentKeys.includes('purchase') ? 'purchase' : intentKeys[0] ?? 'purchase';

  const overrides = { ...(opts?.dryRunEvent ?? {}) };
  delete (overrides as { intent?: string }).intent;
  const event: DomainEvent = {
    eventId: 'promote-gate-dry-run',
    user: { email: 'promote-gate@example.com' },
    ...overrides,
    intent,
  };

  try {
    const result = applyVendorMap(event, map, {
      processorsDir: opts?.processorsDir,
      onUnresolved: 'skip',
    });
    if (result.skipped) {
      return {
        gate: 'dry_run',
        vendor: map.vendor,
        message: `map ${map.vendor}: dry-run skipped for intent=${intent} (${result.reason ?? 'unknown'})`,
      };
    }
    if (result.wire == null || Object.keys(result.wire).length === 0) {
      return {
        gate: 'dry_run',
        vendor: map.vendor,
        message: `map ${map.vendor}: dry-run produced empty wire for intent=${intent}`,
      };
    }
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      gate: 'dry_run',
      vendor: map.vendor,
      message: `map ${map.vendor}: dry-run threw for intent=${intent}: ${msg}`,
    };
  }
}

/**
 * Evaluate all promote hard gates. Fail-closed: any failure → ok=false.
 */
export function evaluatePromoteGates(input: PromoteGatesInput): PromoteGatesResult {
  const failures: PromoteGateFailure[] = [];
  const lines: string[] = [];
  const requireDryRun = input.requireDryRun !== false;
  const skipQuality = input.skipQuality === true;

  // --- quality (project-level) ---
  if (!skipQuality) {
    if (input.quality && !input.quality.ok) {
      failures.push({
        gate: 'quality',
        message: 'quality gate failed (JaCoCo report missing or below floor)',
      });
      lines.push('  ✗ quality: JaCoCo report missing or below floor');
      if (input.quality.lines) {
        for (const l of input.quality.lines) lines.push(`    ${l}`);
      }
    } else if (input.quality?.ok) {
      lines.push('  ✓ quality');
    } else {
      // CLI always supplies quality when strict. Unit tests pass quality: { ok: true }.
      failures.push({
        gate: 'quality',
        message: 'quality gate result not provided (pass quality or skipQuality)',
      });
      lines.push('  ✗ quality: result not provided');
    }
  } else {
    lines.push('  · quality: skipped (--no-strict)');
  }

  // --- secret_scan (project-level) ---
  const findings = input.secretFindings ?? collectSecretFindings(input.maps);
  const critical = criticalSecretFindings(findings);
  if (critical.length > 0) {
    failures.push({
      gate: 'secret_scan',
      message: `secret_scan: ${critical.length} critical finding(s) — use SecretRef, not inline tokens`,
    });
    lines.push(`  ✗ secret_scan: ${critical.length} critical finding(s)`);
    for (const f of critical.slice(0, 8)) {
      lines.push(`    - ${f.path}: ${f.message}`);
    }
  } else {
    lines.push('  ✓ secret_scan');
  }

  // --- privacy ids ---
  const privacyIds =
    input.privacyPolicyIds ??
    (input.projectDir ? listPrivacyPolicyIds(input.projectDir) : []);

  const eligibleVendors: string[] = [];

  for (const map of input.maps) {
    if (map.status === 'live') {
      lines.push(`  · ${map.vendor}: already live (skip)`);
      continue;
    }

    let mapOk = true;

    // map_status
    const statusFail = checkMapStatusGate(map);
    if (statusFail) {
      failures.push(statusFail);
      lines.push(`  ✗ map_status [${map.vendor}]: ${statusFail.message}`);
      mapOk = false;
    } else {
      lines.push(`  ✓ map_status [${map.vendor}]`);
    }

    // privacy_policy: do not classify fields in core; require explicit policy for live.
    if (!hasPrivacyPolicyForVendor(map.vendor, privacyIds)) {
      const fail: PromoteGateFailure = {
        gate: 'privacy_policy',
        vendor: map.vendor,
        message:
          `map ${map.vendor}: no privacy policy for live promotion ` +
          `(add privacy/${map.vendor}.json or default policy under projectDir/privacy/)`,
      };
      failures.push(fail);
      lines.push(`  ✗ privacy_policy [${map.vendor}]: ${fail.message}`);
      mapOk = false;
    } else {
      lines.push(`  ✓ privacy_policy [${map.vendor}]`);
    }

    // dry_run
    if (requireDryRun) {
      // Only run dry-run if status is map_complete with content — otherwise noise
      if (!statusFail) {
        const dryFail = checkDryRunGate(map, {
          dryRunEvent: input.dryRunEvent,
          processorsDir: input.processorsDir,
        });
        if (dryFail) {
          failures.push(dryFail);
          lines.push(`  ✗ dry_run [${map.vendor}]: ${dryFail.message}`);
          mapOk = false;
        } else {
          lines.push(`  ✓ dry_run [${map.vendor}]`);
        }
      } else {
        lines.push(`  · dry_run [${map.vendor}]: skipped (map_status failed)`);
      }
    } else {
      lines.push(`  · dry_run [${map.vendor}]: skipped (--no-dry-run-check)`);
    }

    if (mapOk && !statusFail && map.status === 'map_complete') {
      eligibleVendors.push(map.vendor);
    }
  }

  // Project-level gates block all promotions
  const projectBlocked = failures.some(
    (f) => f.gate === 'quality' || f.gate === 'secret_scan',
  );
  const finalEligible = projectBlocked ? [] : eligibleVendors;

  const allLive =
    input.maps.length > 0 && input.maps.every((m) => m.status === 'live');
  const ok =
    failures.length === 0 &&
    (input.maps.length === 0 || finalEligible.length > 0 || allLive);

  return {
    ok,
    failures,
    lines,
    eligibleVendors: finalEligible,
  };
}

/**
 * Format fail-closed summary for CLI / evals.
 */
export function formatPromoteGateFailures(failures: PromoteGateFailure[]): string[] {
  if (failures.length === 0) return ['Promote gates: all passed'];
  const lines = [`Promote blocked: ${failures.length} gate(s) failed:`];
  for (const f of failures) {
    const scope = f.vendor ? ` [${f.vendor}]` : '';
    lines.push(`  - ${f.gate}${scope}: ${f.message}`);
  }
  return lines;
}
