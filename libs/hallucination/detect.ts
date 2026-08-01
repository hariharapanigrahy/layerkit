/**
 * Pure placeholder / invent-signal guards for proposals and VendorMap payloads.
 * Deterministic — no network, no LLM. Used before store mutation (applyProposal).
 *
 * Break-glass for apply path only: process.env.LAYERKIT_ALLOW_HALLUCINATION === '1'
 * (see VendorMemoryStore.applyProposal). Prefer fixing sources over the env override.
 */
import {
  isVendorMapV2,
  type DocSource,
  type EndpointSpec,
  type FieldMapRow,
  type Proposal,
  type VendorMap,
} from '../domain/types.js';
import type {
  AssertNoHallucinationIssuesOpts,
  HallucinationIssue,
  HallucinationReport,
} from './types.js';

/** Hard invent markers in paths/URLs (case-sensitive where noted). */
const HARD_MARKERS = ['REPLACE', 'TODO', 'TBD', 'YOUR_'] as const;

/** Hosts / host fragments that are invent placeholders (errors). */
const ERROR_HOST_FRAGMENTS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  'your-api.com',
  'example-vendor.com',
] as const;

function push(
  issues: HallucinationIssue[],
  issue: HallucinationIssue,
): void {
  issues.push(issue);
}

function hasHardMarker(s: string): boolean {
  for (const m of HARD_MARKERS) {
    if (s.includes(m)) return true;
  }
  return false;
}

function tryHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isExampleComHost(host: string): boolean {
  return host === 'example.com' || host.endsWith('.example.com');
}

function isErrorPlaceholderHost(host: string): boolean {
  const h = host.toLowerCase();
  // example.com (and subdomains) are warn-only — see isExampleComHost
  if (isExampleComHost(h)) return false;
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  for (const frag of ERROR_HOST_FRAGMENTS) {
    if (h === frag || h.endsWith(`.${frag}`) || h.includes(frag)) return true;
  }
  // Bare multi-label invent host used in LLM fakes (not under .example.com)
  if (h === 'api.example') return true;
  return false;
}

function isEmptyMap(map: VendorMap): boolean {
  if (map.status === 'skeleton') return true;
  const fieldCount = map.fields?.length ?? 0;
  const intentCount = Object.keys(map.intents ?? {}).length;
  return fieldCount === 0 && intentCount === 0;
}

function scanEndpoint(
  endpoint: EndpointSpec | undefined,
  pathPrefix: string,
  sources: DocSource[],
  issues: HallucinationIssue[],
): void {
  if (!endpoint) return;

  const path = endpoint.path ?? '';
  // Exact `/path` only — many real APIs contain the substring "/path".
  if (
    hasHardMarker(path) ||
    /placeholder/i.test(path) ||
    path === '/path'
  ) {
    push(issues, {
      level: 'error',
      code: 'placeholder_endpoint_path',
      message: `endpoint path looks invented or placeholder: ${path || '(empty)'}`,
      path: `${pathPrefix}.path`,
    });
  }

  const baseUrl = endpoint.baseUrl;
  if (baseUrl == null || baseUrl === '') return;

  if (hasHardMarker(baseUrl) || /placeholder/i.test(baseUrl)) {
    push(issues, {
      level: 'error',
      code: 'placeholder_base_url',
      message: `baseUrl contains invent marker: ${baseUrl}`,
      path: `${pathPrefix}.baseUrl`,
    });
    return;
  }

  const host = tryHostname(baseUrl);
  if (!host) {
    // Non-URL baseUrl with invent-ish text already covered; bare strings still scan markers
    if (/example-vendor\.com/i.test(baseUrl) || /your-api\.com/i.test(baseUrl)) {
      push(issues, {
        level: 'error',
        code: 'placeholder_base_url',
        message: `baseUrl looks like a placeholder host: ${baseUrl}`,
        path: `${pathPrefix}.baseUrl`,
      });
    }
    return;
  }

  if (isErrorPlaceholderHost(host)) {
    push(issues, {
      level: 'error',
      code: 'placeholder_base_url',
      message: `baseUrl host is a known invent placeholder: ${host}`,
      path: `${pathPrefix}.baseUrl`,
    });
  } else if (isExampleComHost(host)) {
    // Fixtures often use example.com — warn only (strict assert / CI can elevate)
    push(issues, {
      level: 'warn',
      code: 'example_host',
      message: `baseUrl uses example.com (${host}) — replace with real vendor host before production`,
      path: `${pathPrefix}.baseUrl`,
    });
  }

  void sources;
}

function scanFieldRows(fields: FieldMapRow[] | undefined, pathPrefix: string, issues: HallucinationIssue[]): void {
  if (!fields?.length) return;
  for (let i = 0; i < fields.length; i++) {
    const row = fields[i]!;
    const vendorPath = row.vendor ?? '';
    if (
      /^invent_/i.test(vendorPath) ||
      /^guessed_/i.test(vendorPath) ||
      vendorPath === 'unknown' ||
      vendorPath.startsWith('unknown.') ||
      vendorPath.startsWith('unknown/')
    ) {
      push(issues, {
        level: 'error',
        code: 'invent_field_path',
        message: `field vendor path looks invented: ${vendorPath}`,
        path: `${pathPrefix}[${i}].vendor`,
      });
    }
  }
}

function scanSourceUrl(url: string, issuePath: string, issues: HallucinationIssue[]): void {
  if (!url) {
    push(issues, {
      level: 'error',
      code: 'placeholder_source_url',
      message: 'source url missing',
      path: issuePath,
    });
    return;
  }

  if (hasHardMarker(url) || /placeholder/i.test(url)) {
    push(issues, {
      level: 'error',
      code: 'placeholder_source_url',
      message: `source url contains invent marker: ${url}`,
      path: issuePath,
    });
    return;
  }

  const host = tryHostname(url);
  if (!host) {
    // file:// and other schemes may not parse as http host — skip host checks
    if (url.startsWith('file://')) return;
    push(issues, {
      level: 'error',
      code: 'placeholder_source_url',
      message: `source url is not a parseable URL: ${url}`,
      path: issuePath,
    });
    return;
  }

  if (isErrorPlaceholderHost(host)) {
    push(issues, {
      level: 'error',
      code: 'placeholder_source_url',
      message: `source url host is a known invent placeholder: ${host}`,
      path: issuePath,
    });
    return;
  }

  if (isExampleComHost(host)) {
    push(issues, {
      level: 'warn',
      code: 'example_host',
      message: `source uses example.com (${host}) — acceptable in fixtures; use real vendor docs in production`,
      path: issuePath,
    });
  }
}

function scanVendorMap(map: VendorMap, sources: DocSource[], issues: HallucinationIssue[]): void {
  const empty = isEmptyMap(map);

  if (!map.documentation?.length && !empty) {
    push(issues, {
      level: 'error',
      code: 'empty_documentation',
      message: 'documentation[] empty on non-empty map — invent risk',
      path: 'payload.documentation',
    });
  }

  for (let i = 0; i < (map.documentation?.length ?? 0); i++) {
    const d = map.documentation![i]!;
    scanSourceUrl(d.url ?? '', `payload.documentation[${i}].url`, issues);
  }

  if (isVendorMapV2(map)) {
    for (const [opId, op] of Object.entries(map.operations ?? {})) {
      scanEndpoint(op.endpoint, `payload.operations.${opId}.endpoint`, sources, issues);
    }
    // optional legacy mirror
    if (map.endpoint) {
      scanEndpoint(map.endpoint, 'payload.endpoint', sources, issues);
    }
  } else {
    scanEndpoint(map.endpoint, 'payload.endpoint', sources, issues);
  }

  scanFieldRows(map.fields, 'payload.fields', issues);
}

/**
 * Scan a Proposal (+ VendorMap payload when kind=vendor_map) for invent signals.
 */
export function detectHallucinationIssues(proposal: Proposal): HallucinationReport {
  const issues: HallucinationIssue[] = [];
  const sources = proposal.sources ?? [];

  if (!sources.length) {
    push(issues, {
      level: 'error',
      code: 'empty_sources',
      message: 'sources[] empty or missing — invent risk (primary vendor docs required)',
      path: 'sources',
    });
  } else {
    for (let i = 0; i < sources.length; i++) {
      scanSourceUrl(sources[i]!.url ?? '', `sources[${i}].url`, issues);
    }
  }

  if (proposal.kind === 'vendor_map' && proposal.payload && typeof proposal.payload === 'object') {
    scanVendorMap(proposal.payload as VendorMap, sources, issues);
  }

  return { issues };
}

/**
 * Throw if the proposal has guard errors (and warnings when strict).
 * Message format: `hallucination_blocked: code1, code2`
 */
export function assertNoHallucinationIssues(
  proposal: Proposal,
  opts?: AssertNoHallucinationIssuesOpts,
): void {
  const report = detectHallucinationIssues(proposal);
  const blocking = opts?.strict
    ? report.issues
    : report.issues.filter((i) => i.level === 'error');
  if (!blocking.length) return;
  const codes = [...new Set(blocking.map((i) => i.code))].join(', ');
  throw new Error(`hallucination_blocked: ${codes}`);
}

/** True when any issue is level=error. */
export function hasHallucinationErrors(report: HallucinationReport): boolean {
  return report.issues.some((i) => i.level === 'error');
}
