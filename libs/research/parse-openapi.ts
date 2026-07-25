/**
 * Deterministic OpenAPI 3 / Swagger-ish JSON parser (no network).
 * Supports JSON text; light YAML is not required for gates (JSON fixtures).
 */
import type { ParsedOpenApi } from './types.js';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
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

  const operations: ParsedOpenApi['operations'] = [];
  const paths = isRecord(doc.paths) ? doc.paths : {};
  const httpMethods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!isRecord(pathItem)) continue;
    for (const [method, op] of Object.entries(pathItem)) {
      if (!httpMethods.has(method.toLowerCase())) continue;
      if (!isRecord(op)) continue;
      const operationId = typeof op.operationId === 'string' ? op.operationId : undefined;
      const securityNames: string[] = [];
      const sec = op.security ?? doc.security;
      if (Array.isArray(sec)) {
        for (const item of sec) {
          if (isRecord(item)) securityNames.push(...Object.keys(item));
        }
      }
      operations.push({
        method: method.toUpperCase(),
        path,
        operationId,
        security: securityNames.length ? securityNames : undefined,
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

/** Human-readable auth summary from securitySchemes (for Q1). */
export function describeAuthFromOpenApi(parsed: ParsedOpenApi): string | null {
  if (parsed.securitySchemes.length === 0) return null;
  return parsed.securitySchemes
    .map((s) => {
      if (s.type === 'http' && s.scheme === 'bearer') return `${s.name}: HTTP Bearer`;
      if (s.type === 'http' && s.scheme === 'basic') return `${s.name}: HTTP Basic`;
      if (s.type === 'apiKey') return `${s.name}: apiKey in ${s.in ?? 'header'} (${s.paramName ?? 'key'})`;
      if (s.type === 'oauth2') return `${s.name}: OAuth2`;
      return `${s.name}: ${s.type}${s.scheme ? ` ${s.scheme}` : ''}`;
    })
    .join('; ');
}

/** Human-readable endpoint summary (for Q2). */
export function describeEndpointsFromOpenApi(parsed: ParsedOpenApi): string | null {
  if (parsed.operations.length === 0 && parsed.servers.length === 0) return null;
  const base = parsed.servers[0] ?? '';
  const ops = parsed.operations
    .map((o) => `${o.method} ${base}${o.path}${o.operationId ? ` (${o.operationId})` : ''}`)
    .join('; ');
  if (ops) return ops;
  return `servers: ${parsed.servers.join(', ')}`;
}
