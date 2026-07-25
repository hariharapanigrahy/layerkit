/**
 * PII redaction helpers for memory stack markdown bodies.
 */

/** Simple email pattern — redact for durable committed memory notes. */
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/** Phone-ish sequences (optional; keep conservative). */
const PHONE_RE = /(?<!\w)(?:\+?\d[\d\s().-]{7,}\d)(?!\w)/g;

export const REDACTED_EMAIL = '[REDACTED_EMAIL]';
export const REDACTED_PHONE = '[REDACTED_PHONE]';

/**
 * Redact emails (and optional phones) from memory body text.
 * Always applied on append so memory MD is safe to commit.
 */
export function redactMemoryBody(body: string, opts?: { phones?: boolean }): string {
  let out = body.replace(EMAIL_RE, REDACTED_EMAIL);
  if (opts?.phones !== false) {
    out = out.replace(PHONE_RE, REDACTED_PHONE);
  }
  return out;
}

export function containsEmail(text: string): boolean {
  EMAIL_RE.lastIndex = 0;
  return EMAIL_RE.test(text);
}
