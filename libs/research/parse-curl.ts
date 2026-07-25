/**
 * Safe curl argv parser — parse-only, never executes the command.
 */
import type { ParsedCurl } from './types.js';

/**
 * Parse a curl command string into method, URL, headers, body, auth class.
 * Does not shell-exec. Tolerates line continuations (`\`) and common flags.
 */
export function parseCurl(command: string): ParsedCurl {
  const empty: ParsedCurl = {
    method: 'GET',
    url: '',
    host: '',
    path: '',
    protocol: '',
    headers: {},
    authClass: 'none',
    query: {},
  };

  if (!command || !command.trim()) return empty;

  // Normalize line continuations and collapse whitespace carefully for quoting
  const normalized = command
    .replace(/\\\r?\n/g, ' ')
    .replace(/\r?\n/g, ' ')
    .trim();

  const tokens = tokenize(normalized);
  if (tokens.length === 0) return empty;

  // Drop leading `curl` if present
  let i = 0;
  if (tokens[0]?.toLowerCase() === 'curl') i = 1;

  let method = 'GET';
  let url = '';
  const headers: Record<string, string> = {};
  let body: string | undefined;
  let methodExplicit = false;

  while (i < tokens.length) {
    const t = tokens[i]!;

    if (t === '-X' || t === '--request') {
      const m = tokens[++i];
      if (m) {
        method = m.toUpperCase();
        methodExplicit = true;
      }
      i++;
      continue;
    }

    if (t.startsWith('-X') && t.length > 2) {
      method = t.slice(2).toUpperCase();
      methodExplicit = true;
      i++;
      continue;
    }

    if (t === '-H' || t === '--header') {
      const h = tokens[++i];
      if (h) {
        const colon = h.indexOf(':');
        if (colon > 0) {
          const name = h.slice(0, colon).trim();
          const value = h.slice(colon + 1).trim();
          headers[name] = value;
          // case-insensitive store also under exact
          headers[name.toLowerCase()] = value;
        }
      }
      i++;
      continue;
    }

    if (t === '-d' || t === '--data' || t === '--data-raw' || t === '--data-binary' || t === '--data-urlencode') {
      body = tokens[++i] ?? '';
      if (!methodExplicit) method = 'POST';
      i++;
      continue;
    }

    if (t.startsWith('--data=') || t.startsWith('-d=')) {
      body = t.slice(t.indexOf('=') + 1);
      if (!methodExplicit) method = 'POST';
      i++;
      continue;
    }

    if (t === '-u' || t === '--user') {
      const cred = tokens[++i] ?? '';
      headers['Authorization'] = `Basic ${Buffer.from(cred).toString('base64')}`;
      headers['authorization'] = headers['Authorization'];
      i++;
      continue;
    }

    if (t === '-A' || t === '--user-agent' || t === '-o' || t === '--output' || t === '-w' || t === '--write-out') {
      i += 2;
      continue;
    }

    if (t.startsWith('-') && !t.startsWith('http')) {
      // skip unknown flags (optionally with value)
      i++;
      continue;
    }

    // URL candidate
    if (!url && (t.startsWith('http://') || t.startsWith('https://') || t.includes('://'))) {
      url = stripQuotes(t);
    } else if (!url && !t.startsWith('-')) {
      // bare host/path rare in curl samples; accept as url if nothing else
      url = stripQuotes(t);
    }
    i++;
  }

  let host = '';
  let path = '';
  let protocol = '';
  const query: Record<string, string> = {};

  if (url) {
    try {
      const u = new URL(url);
      host = u.host;
      path = u.pathname || '/';
      protocol = u.protocol.replace(':', '');
      u.searchParams.forEach((v, k) => {
        query[k] = v;
      });
    } catch {
      // leave empty host/path
    }
  }

  const authClass = classifyAuth(headers);

  return {
    method,
    url,
    host,
    path,
    protocol,
    headers: pickCanonicalHeaders(headers),
    authClass,
    body,
    query,
  };
}

function classifyAuth(headers: Record<string, string>): ParsedCurl['authClass'] {
  const auth =
    headers['Authorization'] ??
    headers['authorization'] ??
    headers['AUTHORIZATION'];
  if (auth) {
    const lower = auth.toLowerCase();
    if (lower.startsWith('bearer ')) return 'bearer';
    if (lower.startsWith('basic ')) return 'basic';
    return 'custom';
  }
  for (const [k, v] of Object.entries(headers)) {
    const lk = k.toLowerCase();
    if (lk === 'x-api-key' || lk === 'api-key' || lk === 'apikey') {
      void v;
      return 'api_key';
    }
  }
  return 'none';
}

function pickCanonicalHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    // keep original-case keys (skip pure-lowercase duplicates we added)
    if (k === k.toLowerCase() && Object.keys(headers).some((x) => x !== k && x.toLowerCase() === k)) {
      continue;
    }
    out[k] = v;
  }
  return out;
}

function stripQuotes(s: string): string {
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    return s.slice(1, -1);
  }
  return s;
}

/** Tokenize shell-like string with single/double quotes. */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let cur = '';
  let quote: "'" | '"' | null = null;

  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    if (quote) {
      if (c === quote) {
        quote = null;
      } else {
        cur += c;
      }
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      continue;
    }
    if (/\s/.test(c)) {
      if (cur) {
        tokens.push(cur);
        cur = '';
      }
      continue;
    }
    cur += c;
  }
  if (cur) tokens.push(cur);
  return tokens;
}
