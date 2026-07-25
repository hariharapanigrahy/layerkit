/**
 * Pure builtin ops for the strategy registry.
 * No I/O. Used by dry-run, evals, and (later) Java parity.
 */
import { createHash } from 'node:crypto';
import type { BuiltinOp } from './types.js';

function asString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return JSON.stringify(value);
}

/** trim whitespace both ends */
export function opTrim(value: unknown): string {
  return asString(value).trim();
}

/** lowercase (unicode) */
export function opLowercase(value: unknown): string {
  return asString(value).toLowerCase();
}

/** trim + lowercase */
export function opStringTrimLower(value: unknown): string {
  return opLowercase(opTrim(value));
}

/**
 * Basic email normalize for hashing vendors (Meta-style):
 * trim + lowercase. No gmail-dot / plus-stripping hacks.
 */
export function opEmailNormalizeBasic(value: unknown): string {
  return opStringTrimLower(value);
}

/** strip non-digits */
export function opPhoneDigitsOnly(value: unknown): string {
  return asString(value).replace(/\D+/g, '');
}

/** UTF-8 SHA-256 hex digest */
export function opHashSha256Hex(value: unknown): string {
  const s = asString(value);
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

/** ISO-8601 / Date-parseable → unix seconds */
export function opTimestampUnixSeconds(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Heuristic: treat large values as already-ms
    return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
  }
  const ms = Date.parse(asString(value));
  if (Number.isNaN(ms)) throw new Error(`timestamp.unix_seconds: unparseable ${String(value)}`);
  return Math.floor(ms / 1000);
}

/** → unix millis */
export function opTimestampUnixMillis(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? Math.floor(value * 1000) : Math.floor(value);
  }
  const ms = Date.parse(asString(value));
  if (Number.isNaN(ms)) throw new Error(`timestamp.unix_millis: unparseable ${String(value)}`);
  return ms;
}

/** upper-case ISO 4217 currency code */
export function opCurrencyIso4217Upper(value: unknown): string {
  return opTrim(value).toUpperCase();
}

/** Execute a single builtin op. */
export function executeBuiltin(op: BuiltinOp, value: unknown, _params?: Record<string, unknown>): unknown {
  switch (op) {
    case 'identity':
      return value;
    case 'trim':
      return opTrim(value);
    case 'lowercase':
      return opLowercase(value);
    case 'string.trim_lower':
      return opStringTrimLower(value);
    case 'email.normalize_basic':
      return opEmailNormalizeBasic(value);
    case 'phone.digits_only':
      return opPhoneDigitsOnly(value);
    case 'hash.sha256_hex':
      return opHashSha256Hex(value);
    case 'timestamp.unix_seconds':
      return opTimestampUnixSeconds(value);
    case 'timestamp.unix_millis':
      return opTimestampUnixMillis(value);
    case 'currency.iso4217_upper':
      return opCurrencyIso4217Upper(value);
    default: {
      const _exhaustive: never = op;
      throw new Error(`unknown builtin op: ${String(_exhaustive)}`);
    }
  }
}
