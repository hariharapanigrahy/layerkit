/** Durable artifact schema versions. Missing or 1 = v1 rules forever on read. */
export type ArtifactSchemaVersion = 1 | 2;

export interface VersionedArtifact {
  schemaVersion?: ArtifactSchemaVersion;
}

export type AuthType =
  | 'bearer'
  | 'api_key'
  | 'basic'
  | 'oauth2_client_credentials'
  | 'custom'
  | 'signed_payload'
  | 'mtls';

export interface SecretRef {
  provider: 'env' | 'file' | 'vault' | 'aws_sm' | 'k8s_secret';
  name: string;
  version?: string;
}

export interface AuthSpec {
  type: AuthType;
  name?: string;
  in?: 'header' | 'query';
  notes?: string;
  docUrl?: string;
  secretRef?: SecretRef;
  rotation?: {
    strategy: 'env' | 'vault' | 'aws_secrets_manager' | 'manual';
    refreshSkewSeconds?: number;
  };
}

/** Alias for v2 maps; same shape as AuthSpec with optional secretRef/rotation. */
export type AuthSpecV2 = AuthSpec;

export interface DocSource {
  title: string;
  url: string;
  excerpt?: string;
}

export type FieldTransform =
  | { type: 'identity' }
  | { type: 'constant'; value: unknown };

export interface FieldMapRow {
  domain: string;
  vendor: string;
  transform: FieldTransform;
  optional?: boolean;
  notes?: string;
}

export interface IntentWire {
  eventName: string;
  staticFields?: Record<string, unknown>;
  skip?: boolean;
}

export interface EndpointSpec {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  baseUrl?: string;
}

export interface OperationSpec {
  id: string;
  endpoint: EndpointSpec;
  auth?: AuthSpecV2;
  contentType?: string;
  headers?: Record<string, string | { secretRef: SecretRef }>;
  batch?: { maxItems: number; arrayPath: string };
}

export interface IntentBinding {
  /**
   * Required when skip is not true (validated by validateVendorMapV2).
   * Optional for skip-only bindings.
   */
  operationId?: string;
  eventName?: string;
  staticFields?: Record<string, unknown>;
  skip?: boolean;
  fields?: FieldMapRow[];
}

/** v1 vendor map (missing schemaVersion ≡ 1). */
export interface VendorMapV1 {
  schemaVersion?: 1;
  vendor: string;
  displayName: string;
  version: string;
  auth: AuthSpec;
  endpoint: EndpointSpec;
  intents: Record<string, IntentWire>;
  fields: FieldMapRow[];
  extensionKeys?: string[];
  documentation: DocSource[];
  status?: 'skeleton' | 'map_complete' | 'live';
  notes?: string;
}

/** v2 multi-operation vendor map. */
export interface VendorMapV2 {
  schemaVersion: 2;
  vendor: string;
  displayName: string;
  version: string;
  status: 'skeleton' | 'map_complete' | 'live' | 'deprecated';
  documentation: DocSource[];
  notes?: string;
  auth: AuthSpecV2;
  operations: Record<string, OperationSpec>;
  intents: Record<string, IntentBinding>;
  fields: FieldMapRow[];
  /** Optional legacy mirror for human readability */
  endpoint?: EndpointSpec;
  extensionKeys?: string[];
}

/** Discriminated by schemaVersion (missing|1 → V1, 2 → V2). */
export type VendorMap = VendorMapV1 | VendorMapV2;

export function isVendorMapV2(map: VendorMap): map is VendorMapV2 {
  return map.schemaVersion === 2;
}

export function isVendorMapV1(map: VendorMap): map is VendorMapV1 {
  return map.schemaVersion !== 2;
}

export interface DomainField {
  path: string;
  type: string;
  description: string;
  required?: boolean;
}

export interface DomainSpec {
  id: string;
  version: string;
  description: string;
  intents: Array<{ id: string; description: string }>;
  fields: DomainField[];
}

export interface SourceEditConfig {
  /**
   * Customer module root (repo-relative or absolute).
   * Example: apps/platform/integrations
   */
  moduleRoot?: string;
  /** Optional roots agents may use to find client verification artifacts */
  qualityRoots?: string[];
  /** Override package when style profile is missing */
  package?: string;
  /** Glob-ish path prefixes agents must not edit (secrets, legacy) */
  denyEdit?: string[];
}

export interface LayerProject {
  name: string;
  version: string;
  languages: Array<'java' | 'typescript' | 'python'>;
  javaPackage?: string;
  domain: DomainSpec;
  vendors: string[];
  dataLayerVersionId?: string;
  schemaVersion?: ArtifactSchemaVersion;
  security?: {
    reviewers: Array<{
      id: string;
      roles: Array<'checker' | 'privacy_reviewer' | 'admin'>;
    }>;
  };
  makerChecker?: {
    requireDistinctChecker?: boolean;
    requirePrivacyReviewForPii?: boolean;
    allowSelfApprove?: boolean;
    legacyApplyWithoutApprove?: boolean;
  };
  /** Client source-edit boundaries for agent-owned integration work */
  sourceEdit?: SourceEditConfig;
}

export type ProposalKind =
  | 'vendor_map'
  | 'field_row'
  | 'intent_wire'
  | 'auth'
  | 'domain_spec';

export type ProposalStatusV1 = 'pending' | 'validated' | 'applied' | 'rejected';

export type ProposalStatusV2 =
  | 'draft'
  | 'pending'
  | 'validated'
  | 'approved'
  | 'privacy_hold'
  | 'ready_to_apply'
  | 'applied'
  | 'promoted'
  | 'rejected'
  | 'superseded';

export type ProposalStatus = ProposalStatusV1 | ProposalStatusV2;

export interface Identity {
  type: 'user' | 'agent' | 'ci';
  id: string;
}

export interface CheckRecord {
  at: string;
  by: Identity;
  role: 'checker' | 'privacy_reviewer' | 'admin';
  decision: 'approve' | 'reject';
  comment?: string;
}

/**
 * Proposal dual-schema: missing schemaVersion ≡ 1.
 * v2 adds maker-checker fields (optional until strict mode).
 */
export interface Proposal {
  schemaVersion?: ArtifactSchemaVersion;
  kind: ProposalKind;
  id: string;
  summary: string;
  vendor?: string;
  payload: unknown;
  sources: DocSource[];
  authoredBy: 'agent' | 'human';
  createdAt: string;
  status: ProposalStatus;
  maker?: Identity;
  checks?: CheckRecord[];
  requiresPrivacyReview?: boolean;
  baseArtifactVersion?: string;
  changeLog?: string;
}

export const PROPOSAL_KINDS: readonly ProposalKind[] = [
  'vendor_map',
  'field_row',
  'intent_wire',
  'auth',
  'domain_spec',
] as const;

export const PROPOSAL_STATUS_V1: readonly ProposalStatusV1[] = [
  'pending',
  'validated',
  'applied',
  'rejected',
] as const;

export const PROPOSAL_STATUS_V2: readonly ProposalStatusV2[] = [
  'draft',
  'pending',
  'validated',
  'approved',
  'privacy_hold',
  'ready_to_apply',
  'applied',
  'promoted',
  'rejected',
  'superseded',
] as const;
