export type AuthType =
  | 'bearer'
  | 'api_key'
  | 'basic'
  | 'oauth2_client_credentials'
  | 'custom';

export interface AuthSpec {
  type: AuthType;
  name?: string;
  in?: 'header' | 'query';
  notes?: string;
  docUrl?: string;
}

export interface DocSource {
  title: string;
  url: string;
  excerpt?: string;
}

export interface ProcessorSpec {
  id: string;
  kind: 'builtin' | 'agent' | 'custom';
  description: string;
  sources?: DocSource[];
  implementationHint?: string;
  status?: 'draft' | 'reviewed' | 'stable';
}

export type FieldTransform =
  | { type: 'processor'; processorId: string }
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

export interface VendorMap {
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

export interface LayerProject {
  name: string;
  version: string;
  languages: Array<'java' | 'typescript' | 'python'>;
  javaPackage?: string;
  domain: DomainSpec;
  vendors: string[];
  dataLayerVersionId?: string;
}

export type ProposalKind = 'vendor_map' | 'processor' | 'field_row' | 'intent_wire' | 'auth' | 'java_artifact';

export interface Proposal {
  schemaVersion: 1;
  kind: ProposalKind;
  id: string;
  summary: string;
  vendor?: string;
  processorId?: string;
  payload: unknown;
  sources: DocSource[];
  authoredBy: 'agent' | 'human';
  createdAt: string;
  status: 'pending' | 'validated' | 'applied' | 'rejected';
}
