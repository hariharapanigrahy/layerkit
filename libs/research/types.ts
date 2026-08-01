/** Structured contract parser types. Semantic research lives in skills. */

/** Request body (or similar) property extracted from OpenAPI schema — evidence only. */
export interface ParsedOpenApiProperty {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
}

export interface ParsedOpenApiOperation {
  method: string;
  path: string;
  operationId?: string;
  summary?: string;
  description?: string;
  security?: string[];
  /**
   * Opaque OpenAPI extensions (keys starting with x-). Values are stringified.
   * Semantics are NOT interpreted here — project domain-binding convention + skills decide.
   */
  extensions?: Record<string, string>;
  /** application/json (or first) requestBody schema properties when present */
  bodyFields?: ParsedOpenApiProperty[];
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
  operations: ParsedOpenApiOperation[];
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
