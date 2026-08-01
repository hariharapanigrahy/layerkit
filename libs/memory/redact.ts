/**
 * PII redaction helpers for memory stack markdown bodies.
 */

/** Simple email pattern — redact for durable committed memory notes. */
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/** Phone-ish sequences (optional; keep conservative). */
const PHONE_RE = /(?<!\w)(?:\+?\d[\d\s().-]{7,}\d)(?!\w)/g;
const SECRET_ASSIGNMENT_RE =
  /\b([A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|PRIVATE[_-]?KEY)[A-Z0-9_]*)\s*[:=]\s*['"]?([^\s'"]{8,})['"]?/gi;
const HIGH_ENTROPY_RE = /(?<![A-Za-z0-9])[A-Za-z0-9+/_-]{32,}={0,2}(?![A-Za-z0-9])/g;

export const REDACTED_EMAIL = '[REDACTED_EMAIL]';
export const REDACTED_PHONE = '[REDACTED_PHONE]';
export const REDACTED_SECRET = '[REDACTED_SECRET]';

/**
 * Redact emails (and optional phones) from memory body text.
 * Always applied on append so memory MD is safe to commit.
 */
export function redactMemoryBody(body: string, opts?: { phones?: boolean }): string {
  let out = body.replace(EMAIL_RE, REDACTED_EMAIL);
  out = out.replace(SECRET_ASSIGNMENT_RE, (_m, key) => `${key}=${REDACTED_SECRET}`);
  out = out.replace(HIGH_ENTROPY_RE, REDACTED_SECRET);
  if (opts?.phones !== false) {
    out = out.replace(PHONE_RE, REDACTED_PHONE);
  }
  return out;
}

export function containsEmail(text: string): boolean {
  EMAIL_RE.lastIndex = 0;
  return EMAIL_RE.test(text);
}
