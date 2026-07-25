/**
 * Privacy gate — fail-closed for live egress without policy.
 *
 * Normative postures (design-doc):
 * | Mode              | No policy                         |
 * | dry_run / shadow  | allow + warn privacy_policy_missing |
 * | live              | hard fail privacy_policy_required   |
 */
import { createHash } from 'node:crypto';
import { evalCondition, getPath } from './conditions.js';
import type {
  EgressCheck,
  PrivacyEvent,
  PrivacyPolicy,
  PrivacyResult,
  PrivacyRule,
  RuntimeMode,
} from './types.js';

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    if (cur[p] == null || typeof cur[p] !== 'object') cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

function deletePath(obj: Record<string, unknown>, path: string): boolean {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur == null || typeof cur !== 'object') return false;
    cur = (cur as Record<string, unknown>)[parts[i]!];
  }
  if (cur == null || typeof cur !== 'object') return false;
  const key = parts[parts.length - 1]!;
  if (!(key in (cur as Record<string, unknown>))) return false;
  delete (cur as Record<string, unknown>)[key];
  return true;
}

function sha256Hex(value: unknown): string {
  const s = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

function ruleMatches(rule: PrivacyRule, event: PrivacyEvent): boolean {
  if (!rule.when) return true;
  return evalCondition(rule.when, event);
}

function applyFieldAction(
  wire: Record<string, unknown>,
  fields: string[],
  action: 'redact' | 'hash',
  redactedPaths: string[],
): void {
  for (const field of fields) {
    const cur = getPath(wire, field);
    if (cur === undefined) continue;
    if (action === 'redact') {
      setPath(wire, field, null);
      redactedPaths.push(field);
    } else if (action === 'hash') {
      setPath(wire, field, sha256Hex(cur));
      redactedPaths.push(field);
    }
  }
}

function applyEgressChecks(
  wire: Record<string, unknown>,
  checks: EgressCheck[],
  event: PrivacyEvent,
  redactedPaths: string[],
): { drop?: string } {
  for (const check of checks) {
    if (check.type === 'field_denylist') {
      const fields = (check.config.fields as string[] | undefined) ?? [];
      for (const f of fields) {
        if (deletePath(wire, f)) redactedPaths.push(f);
      }
    } else if (check.type === 'field_allowlist') {
      const allowed = new Set((check.config.fields as string[] | undefined) ?? []);
      // Strip top-level keys not in allowlist (simple path roots)
      for (const key of Object.keys(wire)) {
        const keep = [...allowed].some((a) => a === key || a.startsWith(`${key}.`));
        if (!keep && !allowed.has(key)) {
          delete wire[key];
          redactedPaths.push(key);
        }
      }
    } else if (check.type === 'consent_required') {
      const purposes = (check.config.purposes as string[] | undefined) ?? [];
      const granted = event.consent?.purposes ?? [];
      if (!event.consent) {
        return { drop: 'privacy_consent_missing' };
      }
      for (const p of purposes) {
        if (!granted.includes(p)) {
          return { drop: 'privacy_consent_purpose' };
        }
      }
    } else if (check.type === 'region_lock') {
      const allowedRegions = (check.config.regions as string[] | undefined) ?? [];
      const region =
        (event.context?.region as string | undefined) ??
        (event.context?.country as string | undefined);
      if (allowedRegions.length && region && !allowedRegions.includes(region)) {
        return { drop: 'privacy_region_lock' };
      }
    }
  }
  return {};
}

export interface EvaluatePrivacyOptions {
  /**
   * When true (default), live mode without a policy hard-fails with
   * `privacy_policy_required`. When false, live uses the dry_run posture
   * (allow + warn `privacy_policy_missing`).
   */
  requirePrivacyPolicyForLive?: boolean;
}

/**
 * Evaluate privacy before vendor egress.
 *
 * @param event Domain event (may include consent)
 * @param wire  Mapped vendor payload (mutated copy; original not modified)
 * @param policy Applied policy or null
 * @param mode  live | dry_run | shadow
 * @param options Optional; `requirePrivacyPolicyForLive` defaults true
 */
export function evaluatePrivacy(
  event: PrivacyEvent,
  wire: Record<string, unknown> | null,
  policy: PrivacyPolicy | null,
  mode: RuntimeMode,
  options?: EvaluatePrivacyOptions,
): PrivacyResult {
  const warnings: string[] = [];
  const redactedPaths: string[] = [];
  const requirePolicyForLive = options?.requirePrivacyPolicyForLive !== false;

  if (!policy) {
    if (mode === 'live' && requirePolicyForLive) {
      return {
        action: 'fail',
        payload: null,
        redactedPaths: [],
        reasonCode: 'privacy_policy_required',
        warnings: [],
      };
    }
    // dry_run / shadow, or live with requirePrivacyPolicyForLive=false: allow with warn
    warnings.push('privacy_policy_missing');
    return {
      action: 'allow',
      payload: wire ? deepClone(wire) : null,
      redactedPaths: [],
      reasonCode: 'privacy_policy_missing',
      warnings,
    };
  }

  if (wire == null) {
    return {
      action: 'allow',
      payload: null,
      redactedPaths: [],
      warnings,
    };
  }

  const payload = deepClone(wire);

  // --- Event-level pass ---
  for (const rule of policy.rules) {
    if (!ruleMatches(rule, event)) continue;

    if (rule.action === 'drop_event') {
      return {
        action: 'drop',
        payload: null,
        redactedPaths,
        reasonCode: `privacy_drop:${rule.id}`,
        warnings,
      };
    }

    if (rule.action === 'require_consent') {
      const purposes = rule.purposes ?? [];
      if (!event.consent) {
        return {
          action: 'drop',
          payload: null,
          redactedPaths,
          reasonCode: 'privacy_consent_missing',
          warnings,
        };
      }
      const granted = event.consent.purposes ?? [];
      for (const p of purposes) {
        if (!granted.includes(p)) {
          return {
            action: 'drop',
            payload: null,
            redactedPaths,
            reasonCode: 'privacy_consent_purpose',
            warnings,
          };
        }
      }
    }
    // allow → continue
  }

  // --- Field-level pass (redact / hash) ---
  for (const rule of policy.rules) {
    if (!ruleMatches(rule, event)) continue;
    if (rule.action === 'redact' || rule.action === 'hash') {
      const fields = rule.fields ?? [];
      if (fields.length) applyFieldAction(payload, fields, rule.action, redactedPaths);
    }
  }

  // --- Egress checks ---
  const egress = applyEgressChecks(payload, policy.egressChecks ?? [], event, redactedPaths);
  if (egress.drop) {
    return {
      action: 'drop',
      payload: null,
      redactedPaths,
      reasonCode: egress.drop,
      warnings,
    };
  }

  // defaultAction deny with no explicit allow is soft — only deny empty-policy-style
  // when defaultAction is deny and wire would otherwise leave unrestricted.
  // Normative: empty rules + defaultAction allow → allow; deny → drop.
  if ((policy.rules?.length ?? 0) === 0 && policy.defaultAction === 'deny') {
    return {
      action: 'drop',
      payload: null,
      redactedPaths,
      reasonCode: 'privacy_default_deny',
      warnings,
    };
  }

  return {
    action: 'allow',
    payload,
    redactedPaths,
    warnings,
  };
}
