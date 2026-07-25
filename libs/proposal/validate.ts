import type {
  DomainSpec,
  IntentBinding,
  IntentWire,
  Proposal,
  ProposalKind,
  VendorMap,
  VendorMapV2,
} from '../domain/types.js';
import {
  isVendorMapV2,
  PROPOSAL_KINDS,
  PROPOSAL_STATUS_V1,
  PROPOSAL_STATUS_V2,
} from '../domain/types.js';

export interface ValidationIssue {
  level: 'error' | 'warn';
  code: string;
  message: string;
  path?: string;
}

function isEmptyMap(map: VendorMap): boolean {
  if (map.status === 'skeleton') return true;
  const fieldCount = map.fields?.length ?? 0;
  const intentCount = Object.keys(map.intents ?? {}).length;
  return fieldCount === 0 && intentCount === 0;
}

function validateVendorMapV1(map: VendorMap, domain: DomainSpec | undefined, issues: ValidationIssue[]): void {
  if (isEmptyMap(map)) {
    issues.push({
      level: 'warn',
      code: 'empty_map',
      message: 'Map empty — run layerkit-research-vendor',
    });
    return;
  }

  // V1 requires top-level endpoint (when not empty)
  const endpoint = 'endpoint' in map ? map.endpoint : undefined;
  if (!endpoint?.path || endpoint.path.includes('REPLACE')) {
    issues.push({
      level: 'error',
      code: 'endpoint',
      message: 'endpoint must come from vendor docs',
    });
  }

  const domainIntents = new Set(domain?.intents.map((i) => i.id) ?? []);
  for (const [intent, wire] of Object.entries(map.intents ?? {})) {
    const w = wire as IntentWire;
    if (domain && !domainIntents.has(intent)) {
      issues.push({
        level: 'warn',
        code: 'unknown_intent',
        message: `Unknown intent ${intent}`,
        path: `intents.${intent}`,
      });
    }
    if (!w.skip && !w.eventName) {
      issues.push({
        level: 'error',
        code: 'event_name',
        message: `Intent ${intent} needs eventName or skip`,
        path: `intents.${intent}`,
      });
    }
  }

  validateFieldRows(map, issues);
}

function validateVendorMapV2(map: VendorMapV2, domain: DomainSpec | undefined, issues: ValidationIssue[]): void {
  if (isEmptyMap(map)) {
    issues.push({
      level: 'warn',
      code: 'empty_map',
      message: 'Map empty — run layerkit-research-vendor',
    });
    return;
  }

  const ops = map.operations ?? {};
  if (Object.keys(ops).length === 0) {
    issues.push({
      level: 'error',
      code: 'operations',
      message: 'v2 non-empty maps need ≥1 operation',
    });
  }
  for (const [opId, op] of Object.entries(ops)) {
    if (!op.endpoint?.path || op.endpoint.path.includes('REPLACE')) {
      issues.push({
        level: 'error',
        code: 'endpoint',
        message: `operations.${opId}.endpoint must come from vendor docs`,
        path: `operations.${opId}.endpoint`,
      });
    }
  }

  const domainIntents = new Set(domain?.intents.map((i) => i.id) ?? []);
  for (const [intent, binding] of Object.entries(map.intents ?? {})) {
    const b = binding as IntentBinding;
    if (domain && !domainIntents.has(intent)) {
      issues.push({
        level: 'warn',
        code: 'unknown_intent',
        message: `Unknown intent ${intent}`,
        path: `intents.${intent}`,
      });
    }
    if (!b.skip && !b.eventName) {
      issues.push({
        level: 'error',
        code: 'event_name',
        message: `Intent ${intent} needs eventName or skip`,
        path: `intents.${intent}`,
      });
    }
    if (!b.skip) {
      if (!b.operationId) {
        issues.push({
          level: 'error',
          code: 'operation_id',
          message: `Intent ${intent} needs operationId or skip`,
          path: `intents.${intent}.operationId`,
        });
      } else if (!(b.operationId in ops)) {
        issues.push({
          level: 'error',
          code: 'operation_missing',
          message: `Intent ${intent} operationId "${b.operationId}" not in operations`,
          path: `intents.${intent}.operationId`,
        });
      }
    }
  }

  validateFieldRows(map, issues);
}

function validateFieldRows(map: VendorMap, issues: ValidationIssue[]): void {
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

  if (isVendorMapV2(map)) {
    validateVendorMapV2(map, domain, issues);
  } else {
    validateVendorMapV1(map, domain, issues);
  }

  return issues;
}

/** Proposals without documentation sources are invalid. Dual-schema: 1|2. */
export function validateProposal(proposal: Proposal): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ver = proposal.schemaVersion ?? 1;

  if (ver !== 1 && ver !== 2) {
    issues.push({
      level: 'error',
      code: 'schema',
      message: 'schemaVersion must be 1 or 2',
    });
    // continue with shared checks so callers still get sources errors etc.
  }

  if (!proposal.id || !proposal.kind || !proposal.summary) {
    issues.push({ level: 'error', code: 'meta', message: 'id, kind, summary required' });
  }

  if (proposal.kind && !PROPOSAL_KINDS.includes(proposal.kind as ProposalKind)) {
    issues.push({
      level: 'error',
      code: 'kind',
      message: `unknown proposal kind: ${String(proposal.kind)}`,
    });
  }

  if (!proposal.sources?.length) {
    issues.push({
      level: 'error',
      code: 'sources',
      message: 'sources[] required — primary vendor documentation is the truth',
    });
  }
  for (const s of proposal.sources ?? []) {
    // http(s) for vendor docs; file:// for in-repo domain discovery / code evidence
    const url = s.url ?? '';
    const ok =
      url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://');
    if (!ok) {
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

  // Status sets by schema version
  if (ver === 1) {
    if (proposal.status && !(PROPOSAL_STATUS_V1 as readonly string[]).includes(proposal.status)) {
      issues.push({
        level: 'error',
        code: 'status',
        message: `v1 status must be one of: ${PROPOSAL_STATUS_V1.join('|')}`,
      });
    }
  } else if (ver === 2) {
    if (proposal.status && !(PROPOSAL_STATUS_V2 as readonly string[]).includes(proposal.status)) {
      issues.push({
        level: 'error',
        code: 'status',
        message: `v2 status must be one of: ${PROPOSAL_STATUS_V2.join('|')}`,
      });
    }
    // Maker required when not draft (matrix); do not require checks yet (legacy path)
    if (proposal.status && proposal.status !== 'draft' && !proposal.maker) {
      issues.push({
        level: 'error',
        code: 'maker',
        message: 'v2 proposals require maker when status is not draft',
      });
    }
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
