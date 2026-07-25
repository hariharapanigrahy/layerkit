/**
 * Scaffold agent-authored proposal JSON for vendor maps and processors.
 * Scaffolds never invent vendor truth: missing evidence uses needs-evidence placeholders.
 */
import type {
  DocSource,
  EndpointSpec,
  FieldMapRow,
  IntentWire,
  Proposal,
  VendorMapV1,
} from '../domain/types.js';
import type { BuiltinOp, ExecutableProcessor, ProcessorImpl } from '../strategy/types.js';
import { isBuiltinOp } from '../strategy/types.js';

/** Placeholder source when evidence is not yet available. */
export const NEEDS_EVIDENCE_SOURCE: DocSource = {
  title: 'needs-evidence',
  url: 'https://example.com/needs-evidence',
  excerpt: 'Placeholder — replace with primary vendor documentation before submit/apply',
};

export interface ScaffoldVendorMapOpts {
  vendor: string;
  agentId?: string;
  sources?: DocSource[];
  endpoint?: EndpointSpec;
  intents?: Record<string, IntentWire>;
  fields?: FieldMapRow[];
}

export interface ScaffoldProcessorOpts {
  id: string;
  description: string;
  agentId?: string;
  sources?: DocSource[];
  /** When set, payload gets a builtin (or single-step) executable implementation. */
  builtinOp?: BuiltinOp | string;
}

function resolveSources(sources: DocSource[] | undefined): DocSource[] {
  if (sources?.length) return sources.map((s) => ({ ...s }));
  return [{ ...NEEDS_EVIDENCE_SOURCE }];
}

function displayNameFromVendor(vendor: string): string {
  return vendor
    .split(/[_-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

/**
 * Build a vendor_map proposal (v1 payload shape for simplicity; dual-schema proposal v2).
 * Empty endpoint/intents/fields → skeleton map (validate may warn empty_map).
 */
export function scaffoldVendorMapProposal(opts: ScaffoldVendorMapOpts): Proposal {
  if (!opts.vendor?.trim()) {
    throw new Error('scaffoldVendorMapProposal requires vendor');
  }

  const sources = resolveSources(opts.sources);
  const intents = opts.intents ?? {};
  const fields = opts.fields ?? [];
  const hasIntents = Object.keys(intents).length > 0;
  const hasFields = fields.length > 0;
  const hasEndpoint = !!opts.endpoint?.path && !opts.endpoint.path.includes('REPLACE');
  const hasContent = hasEndpoint || hasIntents || hasFields;

  const endpoint: EndpointSpec = opts.endpoint ?? {
    method: 'POST',
    path: '/REPLACE_FROM_DOCS',
    baseUrl: 'https://api.example.com',
  };

  const payload: VendorMapV1 = {
    schemaVersion: 1,
    vendor: opts.vendor,
    displayName: displayNameFromVendor(opts.vendor),
    version: '1',
    auth: { type: 'bearer', notes: 'needs-evidence — set from vendor docs' },
    endpoint,
    intents,
    fields,
    documentation: sources.map((s) => ({
      title: s.title,
      url: s.url,
      ...(s.excerpt ? { excerpt: s.excerpt } : {}),
    })),
    status: hasContent ? 'map_complete' : 'skeleton',
    notes: hasContent
      ? undefined
      : 'Scaffold only — fill endpoint, intents, and fields from cited evidence',
  };

  const agentId = opts.agentId?.trim() || 'cli';
  const now = new Date().toISOString();

  return {
    schemaVersion: 2,
    kind: 'vendor_map',
    id: `map-${opts.vendor}-v1`,
    vendor: opts.vendor,
    summary: hasContent
      ? `Scaffold vendor map for ${opts.vendor}`
      : `Scaffold vendor map for ${opts.vendor} — needs-evidence`,
    payload,
    sources,
    authoredBy: 'agent',
    createdAt: now,
    status: 'draft',
    maker: { type: 'agent', id: agentId },
    changeLog: 'Scaffolded via layerkit proposal write map',
  };
}

function builtinImpl(op: string): ProcessorImpl {
  if (!isBuiltinOp(op)) {
    throw new Error(
      `Unknown builtin op "${op}". Use a BuiltinOp id (e.g. email.normalize_basic, hash.sha256_hex)`,
    );
  }
  return { type: 'builtin', op };
}

/**
 * Build a processor proposal with executable processor payload
 * (matches evals/fixtures/agent/processor-email-sha256.json shape).
 */
export function scaffoldProcessorProposal(opts: ScaffoldProcessorOpts): Proposal {
  if (!opts.id?.trim()) {
    throw new Error('scaffoldProcessorProposal requires id');
  }
  const description = opts.description?.trim() || `Processor ${opts.id} — needs-evidence`;
  const sources = resolveSources(opts.sources);
  const agentId = opts.agentId?.trim() || 'cli';
  const now = new Date().toISOString();

  const payload: ExecutableProcessor = {
    id: opts.id,
    kind: opts.builtinOp ? 'builtin' : 'agent',
    description,
    sources: sources.map((s) => ({ ...s })),
    status: 'draft',
    version: '1.0.0',
    inputTypes: ['string'],
    outputType: 'string',
  };

  if (opts.builtinOp) {
    payload.implementation = builtinImpl(opts.builtinOp);
    payload.implementationHint = `builtin:${opts.builtinOp}`;
  } else {
    payload.implementationHint =
      'needs-evidence — document pure transform steps (or set builtinOp)';
  }

  const safeId = opts.id.replace(/[^a-zA-Z0-9._-]+/g, '-');

  return {
    schemaVersion: 2,
    kind: 'processor',
    id: `proc-${safeId}-v1`,
    processorId: opts.id,
    summary: description,
    payload,
    sources,
    authoredBy: 'agent',
    createdAt: now,
    status: 'draft',
    maker: { type: 'agent', id: agentId },
    changeLog: 'Scaffolded via layerkit proposal write processor',
  };
}

/** Parse CLI `--source title=url` (optional `|excerpt`). */
export function parseSourceFlag(raw: string): DocSource {
  const eq = raw.indexOf('=');
  if (eq <= 0) {
    throw new Error(`Invalid --source (expected title=url): ${raw}`);
  }
  const title = raw.slice(0, eq).trim();
  let rest = raw.slice(eq + 1).trim();
  let excerpt: string | undefined;
  const pipe = rest.indexOf('|');
  if (pipe >= 0) {
    excerpt = rest.slice(pipe + 1).trim() || undefined;
    rest = rest.slice(0, pipe).trim();
  }
  if (!title || !rest) {
    throw new Error(`Invalid --source (expected title=url): ${raw}`);
  }
  if (!rest.startsWith('http://') && !rest.startsWith('https://')) {
    throw new Error(`Invalid --source url (must start with http): ${rest}`);
  }
  return excerpt ? { title, url: rest, excerpt } : { title, url: rest };
}

/** Parse `METHOD:path` or `METHOD:path@baseUrl`. */
export function parseEndpointFlag(raw: string): EndpointSpec {
  const colon = raw.indexOf(':');
  if (colon <= 0) {
    throw new Error(`Invalid --endpoint (expected METHOD:path): ${raw}`);
  }
  const method = raw.slice(0, colon).toUpperCase();
  let rest = raw.slice(colon + 1);
  let baseUrl: string | undefined;
  const at = rest.lastIndexOf('@');
  if (at > 0 && rest.slice(at + 1).startsWith('http')) {
    baseUrl = rest.slice(at + 1);
    rest = rest.slice(0, at);
  }
  const path = rest.startsWith('/') ? rest : `/${rest}`;
  const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
  if (!(methods as readonly string[]).includes(method)) {
    throw new Error(`Invalid --endpoint method: ${method}`);
  }
  return {
    method: method as EndpointSpec['method'],
    path,
    ...(baseUrl ? { baseUrl } : { baseUrl: 'https://api.example.com' }),
  };
}

/** Parse `intentId:EventName` (EventName may contain colons after first). */
export function parseIntentFlag(raw: string): { intent: string; eventName: string } {
  const colon = raw.indexOf(':');
  if (colon <= 0) {
    throw new Error(`Invalid --intent (expected intent:EventName): ${raw}`);
  }
  const intent = raw.slice(0, colon).trim();
  const eventName = raw.slice(colon + 1).trim();
  if (!intent || !eventName) {
    throw new Error(`Invalid --intent (expected intent:EventName): ${raw}`);
  }
  return { intent, eventName };
}

/** Parse `domainPath:vendorPath` (first colon only). */
export function parseFieldFlag(raw: string): FieldMapRow {
  const colon = raw.indexOf(':');
  if (colon <= 0) {
    throw new Error(`Invalid --field (expected domain:vendor): ${raw}`);
  }
  const domain = raw.slice(0, colon).trim();
  const vendor = raw.slice(colon + 1).trim();
  if (!domain || !vendor) {
    throw new Error(`Invalid --field (expected domain:vendor): ${raw}`);
  }
  return {
    domain,
    vendor,
    transform: { type: 'identity' },
  };
}
