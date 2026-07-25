import type { DomainSpec, Proposal, VendorMap } from '../domain/types.js';

export interface ValidationIssue {
  level: 'error' | 'warn';
  code: string;
  message: string;
  path?: string;
}

export function validateVendorMap(map: VendorMap, domain?: DomainSpec): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!map.vendor?.trim()) {
    issues.push({ level: 'error', code: 'vendor_id', message: 'vendor id is required' });
  }
  if (!map.documentation?.length) {
    issues.push({
      level: 'error',
      code: 'docs',
      message: 'documentation URLs required for agent re-verification',
    });
  }

  const empty =
    map.status === 'skeleton' ||
    ((!map.fields || map.fields.length === 0) && Object.keys(map.intents ?? {}).length === 0);

  if (empty) {
    issues.push({
      level: 'warn',
      code: 'empty_map',
      message: 'Map empty — run layerkit-research-vendor',
    });
    return issues;
  }

  if (!map.endpoint?.path || map.endpoint.path.includes('REPLACE')) {
    issues.push({
      level: 'error',
      code: 'endpoint',
      message: 'endpoint must come from vendor docs',
    });
  }

  const domainIntents = new Set(domain?.intents.map((i) => i.id) ?? []);
  for (const [intent, wire] of Object.entries(map.intents ?? {})) {
    if (domain && !domainIntents.has(intent)) {
      issues.push({
        level: 'warn',
        code: 'unknown_intent',
        message: `Unknown intent ${intent}`,
        path: `intents.${intent}`,
      });
    }
    if (!wire.skip && !wire.eventName) {
      issues.push({
        level: 'error',
        code: 'event_name',
        message: `Intent ${intent} needs eventName or skip`,
        path: `intents.${intent}`,
      });
    }
  }

  for (let i = 0; i < (map.fields?.length ?? 0); i++) {
    const row = map.fields[i]!;
    if (!row.domain || !row.vendor) {
      issues.push({
        level: 'error',
        code: 'field_row',
        message: 'domain and vendor paths required',
        path: `fields[${i}]`,
      });
    }
  }

  return issues;
}

/** Greplica-style: proposals without sources are invalid. */
export function validateProposal(proposal: Proposal): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (proposal.schemaVersion !== 1) {
    issues.push({ level: 'error', code: 'schema', message: 'schemaVersion must be 1' });
  }
  if (!proposal.id || !proposal.kind || !proposal.summary) {
    issues.push({ level: 'error', code: 'meta', message: 'id, kind, summary required' });
  }
  if (!proposal.sources?.length) {
    issues.push({
      level: 'error',
      code: 'sources',
      message: 'sources[] required — primary vendor documentation is the truth',
    });
  }
  for (const s of proposal.sources ?? []) {
    if (!s.url?.startsWith('http')) {
      issues.push({
        level: 'error',
        code: 'source_url',
        message: `Invalid source url: ${s.url ?? '(missing)'}`,
      });
    }
  }
  if (proposal.payload === undefined) {
    issues.push({ level: 'error', code: 'payload', message: 'payload required' });
  }
  if (proposal.kind === 'vendor_map' && proposal.payload && typeof proposal.payload === 'object') {
    issues.push(...validateVendorMap(proposal.payload as VendorMap));
  }
  if (proposal.kind === 'processor') {
    const p = proposal.payload as { sources?: unknown[] };
    if (!p?.sources?.length && !proposal.sources?.length) {
      issues.push({
        level: 'error',
        code: 'processor_sources',
        message: 'processor proposals need documentation sources',
      });
    }
  }
  return issues;
}

export function isValidProposal(proposal: Proposal): boolean {
  return validateProposal(proposal).filter((i) => i.level === 'error').length === 0;
}
