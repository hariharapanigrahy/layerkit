/**
 * Deterministic OpenAPI 3 / Swagger-ish JSON parser (no network).
 * Extracts operations, security schemes, request body fields, and opaque x-* extensions.
 * Does not invent paths, auth, or domain meaning when the document is silent.
 */
import type { ParsedOpenApi, ParsedOpenApiOperation, ParsedOpenApiProperty } from './types.js';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Collect extension keys (x-*) from an object as opaque string values when scalar/string.
 * Nested objects are JSON-stringified (evidence only — no semantic interpretation).
 */
export function collectXExtensions(obj: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!k.startsWith('x-') && !k.startsWith('X-')) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = String(v);
    } else if (v != null) {
      try {
        out[k] = JSON.stringify(v);
      } catch {
        out[k] = String(v);
      }
    }
  }
  return out;
}

function schemaProperties(schema: unknown, required: Set<string>): ParsedOpenApiProperty[] {
  if (!isRecord(schema)) return [];
  // Resolve trivial local $ref is not supported — leave empty rather than invent
  if (typeof schema.$ref === 'string') return [];
  const props = isRecord(schema.properties) ? schema.properties : null;
  if (!props) return [];
  const out: ParsedOpenApiProperty[] = [];
  for (const [name, raw] of Object.entries(props)) {
    if (!isRecord(raw)) {
      out.push({ name, type: 'unknown', required: required.has(name) });
      continue;
    }
    out.push({
      name,
      type: typeof raw.type === 'string' ? raw.type : 'unknown',
      required: required.has(name),
      description: typeof raw.description === 'string' ? raw.description : undefined,
    });
  }
  return out;
}

function bodyFieldsFromOp(op: Record<string, unknown>): ParsedOpenApiProperty[] {
  const rb = op.requestBody;
  if (!isRecord(rb)) return [];
  const content = isRecord(rb.content) ? rb.content : null;
  if (!content) return [];
  // Prefer application/json, else first content type
  const json =
    (isRecord(content['application/json']) ? content['application/json'] : null) ??
    (Object.values(content).find((c) => isRecord(c)) as Record<string, unknown> | undefined);
  if (!json) return [];
  const schema = json.schema;
  const requiredList =
    isRecord(schema) && Array.isArray(schema.required)
      ? (schema.required.filter((x) => typeof x === 'string') as string[])
      : [];
  return schemaProperties(schema, new Set(requiredList));
}

/**
 * Parse an OpenAPI/Swagger document from JSON string or object.
 * Does not invent paths or auth when the document is silent.
 */
export function parseOpenAPI(input: string | unknown): ParsedOpenApi {
  let doc: unknown;
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) {
      return emptyParsed();
    }
    try {
      doc = JSON.parse(trimmed);
    } catch {
      // Minimal YAML-like: only reject inventing — return empty rather than guess
      return emptyParsed();
    }
  } else {
    doc = input;
  }

  if (!isRecord(doc)) return emptyParsed();

  const info = isRecord(doc.info) ? doc.info : {};
  const title = typeof info.title === 'string' ? info.title : undefined;
  const version = typeof info.version === 'string' ? info.version : undefined;

  const servers: string[] = [];
  if (Array.isArray(doc.servers)) {
    for (const s of doc.servers) {
      if (isRecord(s) && typeof s.url === 'string') servers.push(s.url);
    }
  }
  // Swagger 2 host/basePath
  if (typeof doc.host === 'string') {
    const scheme =
      Array.isArray(doc.schemes) && typeof doc.schemes[0] === 'string'
        ? doc.schemes[0]
        : 'https';
    const base = typeof doc.basePath === 'string' ? doc.basePath : '';
    servers.push(`${scheme}://${doc.host}${base}`);
  }

  const securitySchemes: ParsedOpenApi['securitySchemes'] = [];
  const components = isRecord(doc.components) ? doc.components : {};
  const schemesRoot =
    (isRecord(components.securitySchemes) ? components.securitySchemes : null) ??
    (isRecord(doc.securityDefinitions) ? doc.securityDefinitions : null) ??
    {};

  if (isRecord(schemesRoot)) {
    for (const [name, raw] of Object.entries(schemesRoot)) {
      if (!isRecord(raw)) continue;
      const type = typeof raw.type === 'string' ? raw.type : 'unknown';
      const scheme = typeof raw.scheme === 'string' ? raw.scheme : undefined;
      const inLoc = typeof raw.in === 'string' ? raw.in : undefined;
      const paramName = typeof raw.name === 'string' ? raw.name : undefined;
      securitySchemes.push({ name, type, scheme, in: inLoc, paramName });
    }
  }

  const operations: ParsedOpenApiOperation[] = [];
  const paths = isRecord(doc.paths) ? doc.paths : {};
  const httpMethods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!isRecord(pathItem)) continue;
    const pathExt = collectXExtensions(pathItem);
    for (const [method, op] of Object.entries(pathItem)) {
      if (!httpMethods.has(method.toLowerCase())) continue;
      if (!isRecord(op)) continue;
      const operationId = typeof op.operationId === 'string' ? op.operationId : undefined;
      const summary = typeof op.summary === 'string' ? op.summary : undefined;
      const description = typeof op.description === 'string' ? op.description : undefined;
      const securityNames: string[] = [];
      const sec = op.security ?? doc.security;
      if (Array.isArray(sec)) {
        for (const item of sec) {
          if (isRecord(item)) securityNames.push(...Object.keys(item));
        }
      }
      const extensions = { ...pathExt, ...collectXExtensions(op) };
      const bodyFields = bodyFieldsFromOp(op);
      operations.push({
        method: method.toUpperCase(),
        path,
        operationId,
        summary,
        description,
        security: securityNames.length ? securityNames : undefined,
        extensions: Object.keys(extensions).length ? extensions : undefined,
        bodyFields: bodyFields.length ? bodyFields : undefined,
      });
    }
  }

  return {
    title,
    version,
    servers,
    securitySchemes,
    operations,
    raw: doc,
  };
}

function emptyParsed(): ParsedOpenApi {
  return {
    servers: [],
    securitySchemes: [],
    operations: [],
    raw: null,
  };
}
