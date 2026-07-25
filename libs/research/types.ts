/**
 * Evidence-first research types (Q1–Q10 answer sheet, seeds, deepen).
 */

export type EvidenceSourceKind =
  | 'doc'
  | 'openapi'
  | 'curl'
  | 'collection'
  | 'code'
  | 'probe'
  | 'human'
  | 'unanswered'
  | 'needs-evidence';

export type ResearchSeed =
  | { kind: 'url'; url: string; note?: string }
  | { kind: 'file'; path: string; content?: string }
  | { kind: 'openapi'; urlOrPath: string; content?: string }
  | { kind: 'curl'; command: string }
  | { kind: 'text'; title: string; body: string }
  | { kind: 'hub_md'; path: string; content: string };

export type DimensionId =
  | 'Q1'
  | 'Q2'
  | 'Q3'
  | 'Q4'
  | 'Q5'
  | 'Q6'
  | 'Q7'
  | 'Q8'
  | 'Q9'
  | 'Q10';

export const DIMENSION_TOPICS: Record<DimensionId, string> = {
  Q1: 'Auth',
  Q2: 'Endpoints',
  Q3: 'Intents',
  Q4: 'Field map',
  Q5: 'PII / processors',
  Q6: 'Consent',
  Q7: 'Batch / fan-out',
  Q8: 'SLAs / delivery',
  Q9: 'Observation',
  Q10: 'Done criteria',
};

export type AnswerConfidence = 'high' | 'medium' | 'low' | 'none';

export interface DimensionAnswer {
  id: DimensionId;
  topic: string;
  /** Filled answer text; empty when unanswered */
  answer: string;
  source: EvidenceSourceKind;
  confidence: AnswerConfidence;
  citations: Array<{ title?: string; url?: string; excerpt?: string }>;
  /** True only when a human was (or must be) asked */
  humanAsked: boolean;
}

export interface AnswerSheet {
  vendor?: string;
  dimensions: Record<DimensionId, DimensionAnswer>;
  deepenLog: DeepenLogEntry[];
}

export interface DeepenLogEntry {
  level: number;
  action: string;
  detail?: string;
  enqueued?: string[];
}

export interface ParsedOpenApi {
  title?: string;
  version?: string;
  servers: string[];
  securitySchemes: Array<{
    name: string;
    type: string;
    scheme?: string;
    in?: string;
    paramName?: string;
  }>;
  operations: Array<{
    method: string;
    path: string;
    operationId?: string;
    security?: string[];
  }>;
  raw: unknown;
}

export interface ParsedCurl {
  method: string;
  url: string;
  host: string;
  path: string;
  protocol: string;
  headers: Record<string, string>;
  /** Auth classification from headers */
  authClass: 'bearer' | 'api_key' | 'basic' | 'custom' | 'none';
  body?: string;
  query: Record<string, string>;
}

export interface DeepenPlan {
  /** Paths/URLs to fetch next (openapi, md, etc.) before asking humans */
  enqueue: Array<{ kind: 'openapi' | 'doc' | 'curl' | 'other'; ref: string }>;
  deepenLog: DeepenLogEntry[];
  /** True only when no further machine evidence can be derived from hub */
  needsHuman: boolean;
}

export interface ResidualGap {
  id: DimensionId;
  topic: string;
  reason: 'unanswered' | 'needs-evidence' | 'low_confidence';
  suggestedQuestion?: string;
}
