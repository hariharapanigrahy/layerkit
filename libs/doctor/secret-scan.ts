/**
 * Doctor secret-leak heuristics for map/proposal JSON.
 * Flags high-entropy strings outside allowlist paths; SecretRef shapes are safe.
 */

export type SecretFindingLevel = 'error' | 'warn';

export interface SecretFinding {
  level: SecretFindingLevel;
  path: string;
  message: string;
  /** Truncated preview of the suspect value (never full secret in doctor output). */
  preview: string;
}

/** Path prefixes that never fail (documentation/sources URLs, excerpts). */
const ALLOWLIST_PREFIXES = [
  'documentation',
  'sources',
  'implementationHint',
  'payload.documentation',
  'payload.sources',
  'payload.implementationHint',
  'summary',
  'displayName',
  'title',
  'excerpt',
  'url',
  'description',
  'notes', // handled specially as warn-only below when high entropy
];

/** Paths where a raw high-entropy string is a hard error. */
const FAIL_PATH_MARKERS = [
  '.auth.',
  '.auth',
  'auth.',
  'endpoint',
  'staticFields',
  'headers',
  'constant',
  'secret',
  'token',
  'password',
  'apiKey',
  'api_key',
  'client_secret',
  'clientSecret',
  'authorization',
];

const MIN_LENGTH = 24;

export function isSecretRef(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.provider === 'string' &&
    typeof o.name === 'string' &&
    (o.provider === 'env' ||
      o.provider === 'file' ||
      o.provider === 'vault' ||
      o.provider === 'aws_sm' ||
      o.provider === 'k8s_secret')
  );
}

/**
 * Approximate charset entropy: unique-char ratio + symbol/digit mix.
 * Tuned to catch base64/hex API tokens without flagging short labels.
 */
export function isHighEntropyString(s: string): boolean {
  if (typeof s !== 'string') return false;
  const trimmed = s.trim();
  if (trimmed.length < MIN_LENGTH) return false;

  // URLs and markdown-ish text are not secrets
  if (/^https?:\/\//i.test(trimmed)) return false;
  if (/\s/.test(trimmed) && wordy(trimmed)) return false;

  // Pure hex (e.g. sha256) — high entropy
  if (/^[0-9a-fA-F]{32,}$/.test(trimmed)) return true;

  // Base64-like (with optional padding)
  if (/^[A-Za-z0-9+/_-]{24,}={0,2}$/.test(trimmed) && hasMixedCharset(trimmed)) {
    return true;
  }

  // Shannon-ish: unique char density on long alnum strings
  const chars = [...trimmed];
  const unique = new Set(chars).size;
  const ratio = unique / chars.length;
  const hasDigit = /\d/.test(trimmed);
  const hasLower = /[a-z]/.test(trimmed);
  const hasUpper = /[A-Z]/.test(trimmed);
  const hasSymbol = /[^A-Za-z0-9]/.test(trimmed);
  const mixScore = [hasDigit, hasLower, hasUpper, hasSymbol].filter(Boolean).length;

  if (trimmed.length >= 32 && ratio >= 0.45 && mixScore >= 2) return true;
  if (trimmed.length >= 24 && ratio >= 0.55 && mixScore >= 3) return true;
  if (trimmed.length >= 40 && ratio >= 0.4 && hasDigit && (hasLower || hasUpper)) return true;

  return false;
}

function wordy(s: string): boolean {
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length < 3) return false;
  const alphaWords = words.filter((w) => /^[A-Za-z][A-Za-z'-]*$/.test(w));
  return alphaWords.length / words.length >= 0.6;
}

function hasMixedCharset(s: string): boolean {
  const hasDigit = /\d/.test(s);
  const hasAlpha = /[A-Za-z]/.test(s);
  return hasDigit && hasAlpha;
}

function pathLeaf(path: string): string {
  const parts = path.split('.');
  return parts[parts.length - 1] ?? path;
}

function isAllowlistedPath(path: string): boolean {
  const leaf = pathLeaf(path);
  // Always allow common non-secret leaves
  if (
    leaf === 'url' ||
    leaf === 'title' ||
    leaf === 'excerpt' ||
    leaf === 'description' ||
    leaf === 'displayName' ||
    leaf === 'summary' ||
    leaf === 'implementationHint' ||
    leaf === 'method' ||
    leaf === 'path' ||
    leaf === 'baseUrl' ||
    leaf === 'vendor' ||
    leaf === 'domain' ||
    leaf === 'eventName' ||
    leaf === 'id' ||
    leaf === 'kind' ||
    leaf === 'type' ||
    leaf === 'status' ||
    leaf === 'version' ||
    leaf === 'createdAt' ||
    leaf === 'processorId' ||
    leaf === 'authoredBy' ||
    leaf === 'provider' ||
    leaf === 'name'
  ) {
    return true;
  }

  for (const p of ALLOWLIST_PREFIXES) {
    if (path === p || path.startsWith(p + '.') || path.startsWith(p + '[')) return true;
    // match nested .documentation / .sources
    if (path.includes('.' + p + '.') || path.includes('.' + p + '[') || path.endsWith('.' + p)) {
      if (p === 'documentation' || p === 'sources' || p === 'implementationHint') return true;
    }
  }
  return false;
}

function isNotesPath(path: string): boolean {
  return path === 'notes' || path.endsWith('.notes') || pathLeaf(path) === 'notes';
}

function isFailPath(path: string): boolean {
  const lower = path.toLowerCase();
  for (const m of FAIL_PATH_MARKERS) {
    if (lower.includes(m.toLowerCase())) return true;
  }
  // transform.constant value paths like fields[0].transform.value
  if (/\.transform\.value$/.test(path) || path.endsWith('.value')) {
    // only when sibling type is constant — we approximate by path containing transform
    if (path.includes('transform')) return true;
  }
  return false;
}

function previewValue(s: string): string {
  if (s.length <= 12) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)} (len=${s.length})`;
}

/**
 * Walk a JSON value and collect secret-like findings.
 * @param rootLabel - prefix for paths (e.g. map:meta or proposal:id)
 */
export function scanJsonForSecrets(value: unknown, rootLabel = ''): SecretFinding[] {
  const findings: SecretFinding[] = [];
  walk(value, rootLabel, findings);
  return findings;
}

function walk(value: unknown, path: string, out: SecretFinding[]): void {
  if (value == null) return;

  if (typeof value === 'string') {
    if (!isHighEntropyString(value)) return;
    const p = path || '(root)';

    if (isAllowlistedPath(p) && !isNotesPath(p) && !isFailPath(p)) return;
    // notes: warn only even if high entropy
    if (isNotesPath(p) && !isFailPath(p)) {
      out.push({
        level: 'warn',
        path: p,
        message: `high-entropy string in notes (review; prefer digests)`,
        preview: previewValue(value),
      });
      return;
    }
    if (isAllowlistedPath(p) && !isFailPath(p)) return;

    const level: SecretFindingLevel = isFailPath(p) ? 'error' : 'warn';
    out.push({
      level,
      path: p,
      message:
        level === 'error'
          ? `possible raw secret (use SecretRef instead of inline token)`
          : `high-entropy string outside allowlist`,
      preview: previewValue(value),
    });
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, i) => walk(item, path ? `${path}[${i}]` : `[${i}]`, out));
    return;
  }

  if (typeof value === 'object') {
    // SecretRef objects are the preferred form — skip scanning their fields as secrets
    if (isSecretRef(value)) return;

    // Objects that wrap secretRef: { secretRef: { provider, name } }
    const rec = value as Record<string, unknown>;
    if (rec.secretRef && isSecretRef(rec.secretRef)) {
      // still walk other keys, skip secretRef subtree as values
      for (const [k, v] of Object.entries(rec)) {
        if (k === 'secretRef') continue;
        const child = path ? `${path}.${k}` : k;
        walk(v, child, out);
      }
      return;
    }

    for (const [k, v] of Object.entries(rec)) {
      const child = path ? `${path}.${k}` : k;
      walk(v, child, out);
    }
  }
}

/** Format findings for doctor lines. */
export function formatSecretFindings(
  findings: SecretFinding[],
  artifactLabel: string,
): string[] {
  return findings.map((f) => {
    const tag = f.level === 'error' ? 'secret_leak' : 'secret_warn';
    return `  ${f.level === 'error' ? '✗' : '!'} ${artifactLabel} ${tag}: ${f.path} — ${f.message} [${f.preview}]`;
  });
}
