/**
 * Java client style profile — structure agents write under
 * `{projectDir}/memory/runbooks/java-style-profile.md` (or JSON).
 *
 * Required keys (process quality): package, di, http, test.
 */

export const STYLE_PROFILE_REQUIRED_KEYS = ['package', 'di', 'http', 'test'] as const;

export type StyleProfileRequiredKey = (typeof STYLE_PROFILE_REQUIRED_KEYS)[number];

/** Optional extended keys from design doc (logging, config, nullability, …). */
export interface StyleProfile {
  /** Package naming + layering (api / domain / infrastructure) */
  package: string;
  /** DI style (constructor injection, Spring @Component, plain factories) */
  di: string;
  /** HTTP client library (JDK HttpClient, OkHttp, WebClient, …) */
  http: string;
  /** Test stack (JUnit 5, AssertJ, WireMock, Mockito) */
  test: string;
  logging?: string;
  config?: string;
  nullability?: string;
  notes?: string;
}

export interface StyleProfileValidation {
  ok: boolean;
  missing: StyleProfileRequiredKey[];
  empty: StyleProfileRequiredKey[];
}

/**
 * Validate that a style profile object has all required keys with non-empty strings.
 */
export function validateStyleProfile(
  profile: Partial<StyleProfile> | Record<string, unknown> | null | undefined,
): StyleProfileValidation {
  const missing: StyleProfileRequiredKey[] = [];
  const empty: StyleProfileRequiredKey[] = [];

  if (!profile || typeof profile !== 'object') {
    return {
      ok: false,
      missing: [...STYLE_PROFILE_REQUIRED_KEYS],
      empty: [],
    };
  }

  for (const key of STYLE_PROFILE_REQUIRED_KEYS) {
    if (!(key in profile)) {
      missing.push(key);
      continue;
    }
    const val = (profile as Record<string, unknown>)[key];
    if (typeof val !== 'string' || val.trim().length === 0) {
      empty.push(key);
    }
  }

  return {
    ok: missing.length === 0 && empty.length === 0,
    missing,
    empty,
  };
}

/**
 * Parse a markdown style profile written by the helper.
 * Expects headings or bold labels like `## package` / `**package**: value`.
 */
type StyleProfileKey = keyof StyleProfile;

const STYLE_PROFILE_KEY_SET = new Set<string>([
  'package',
  'di',
  'http',
  'test',
  'logging',
  'config',
  'nullability',
  'notes',
]);

function asStyleProfileKey(raw: string): StyleProfileKey | undefined {
  const k = raw.toLowerCase();
  return STYLE_PROFILE_KEY_SET.has(k) ? (k as StyleProfileKey) : undefined;
}

export function parseStyleProfileMarkdown(md: string): Partial<StyleProfile> {
  const out: Partial<StyleProfile> = {};
  const lines = md.split(/\r?\n/);

  // ## key\n value  OR  **key**: value  OR  - key: value
  const headingRe = /^#{1,3}\s+(package|di|http|test|logging|config|nullability|notes)\s*$/i;
  const boldRe =
    /^\*\*(package|di|http|test|logging|config|nullability|notes)\*\*\s*:\s*(.+)\s*$/i;
  const listRe =
    /^[-*]\s+(package|di|http|test|logging|config|nullability|notes)\s*:\s*(.+)\s*$/i;

  let pendingKey: StyleProfileKey | undefined;

  for (const line of lines) {
    const bold = line.match(boldRe);
    if (bold) {
      const key = asStyleProfileKey(bold[1]!);
      if (key) out[key] = bold[2]!.trim();
      pendingKey = undefined;
      continue;
    }
    const list = line.match(listRe);
    if (list) {
      const key = asStyleProfileKey(list[1]!);
      if (key) out[key] = list[2]!.trim();
      pendingKey = undefined;
      continue;
    }
    const head = line.match(headingRe);
    if (head) {
      pendingKey = asStyleProfileKey(head[1]!);
      continue;
    }
    if (pendingKey && line.trim().length > 0 && !line.startsWith('#')) {
      out[pendingKey] = line.trim();
      pendingKey = undefined;
    }
  }

  return out;
}

/**
 * Parse JSON style profile (object or JSON string).
 */
export function parseStyleProfileJson(input: unknown): Partial<StyleProfile> {
  let obj: unknown = input;
  if (typeof input === 'string') {
    obj = JSON.parse(input) as unknown;
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return {};
  }
  const src = obj as Record<string, unknown>;
  const out: Partial<StyleProfile> = {};
  for (const key of [
    ...STYLE_PROFILE_REQUIRED_KEYS,
    'logging',
    'config',
    'nullability',
    'notes',
  ] as const) {
    if (typeof src[key] === 'string') {
      out[key] = src[key] as string;
    }
  }
  return out;
}

/**
 * Format a validated style profile as markdown for memory/runbooks.
 */
export function formatStyleProfileMarkdown(profile: StyleProfile): string {
  const lines = [
    '# Java style profile',
    '',
    'Agent-authored client code must match this profile.',
    '',
    '## package',
    profile.package,
    '',
    '## di',
    profile.di,
    '',
    '## http',
    profile.http,
    '',
    '## test',
    profile.test,
    '',
  ];
  if (profile.logging) {
    lines.push('## logging', profile.logging, '');
  }
  if (profile.config) {
    lines.push('## config', profile.config, '');
  }
  if (profile.nullability) {
    lines.push('## nullability', profile.nullability, '');
  }
  if (profile.notes) {
    lines.push('## notes', profile.notes, '');
  }
  return lines.join('\n');
}

/**
 * Build a complete StyleProfile or throw if validation fails.
 */
export function requireStyleProfile(
  profile: Partial<StyleProfile> | Record<string, unknown>,
): StyleProfile {
  const v = validateStyleProfile(profile);
  if (!v.ok) {
    const parts: string[] = [];
    if (v.missing.length) parts.push(`missing: ${v.missing.join(', ')}`);
    if (v.empty.length) parts.push(`empty: ${v.empty.join(', ')}`);
    throw new Error(`Invalid style profile (${parts.join('; ')})`);
  }
  return profile as StyleProfile;
}
