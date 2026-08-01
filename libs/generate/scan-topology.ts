/**
 * Scan customer repo for integration topology (facade, adapters, registry, router).
 * Heuristic filesystem scan — no full AST.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import type {
  IntegrationLanguage,
  IntegrationTopology,
  TopologyFile,
  TopologyRole,
} from './types.js';

const SKIP_DIR_NAMES = new Set([
  '.git',
  'node_modules',
  'target',
  'dist',
  'build',
  '.gradle',
  '.idea',
  '.layerkit',
  'out',
  'coverage',
  // Note: do NOT skip "vendor" — Java packages often use .../vendor/*Adapter.java
  '__pycache__',
]);

const DENY_BASENAMES = new Set([
  '.env',
  '.env.local',
  '.env.production',
  'id_rsa',
  'id_ed25519',
  'credentials.json',
  'secrets.json',
]);

export interface ScanTopologyOptions {
  /** Absolute scan root (customer repo or module) */
  root: string;
  /** Optional configured module root (absolute or relative to root) */
  moduleRoot?: string;
  /** Max files to classify (perf bound) */
  maxFiles?: number;
}

/**
 * Scan root and build IntegrationTopology.
 */
export function scanIntegrationTopology(opts: ScanTopologyOptions): IntegrationTopology {
  const absRoot = resolve(opts.root);
  const maxFiles = opts.maxFiles ?? 800;
  const javaFiles: { rel: string; abs: string; text: string }[] = [];
  const tsFiles: { rel: string; abs: string; text: string }[] = [];
  const buildFiles: string[] = [];

  walk(absRoot, absRoot, (absPath, relPath, base) => {
    const lower = base.toLowerCase();
    if (
      lower === 'pom.xml' ||
      lower === 'build.gradle' ||
      lower === 'build.gradle.kts' ||
      lower === 'package.json'
    ) {
      buildFiles.push(relPath);
      return;
    }
    if (DENY_BASENAMES.has(base)) return;
    if (lower.endsWith('.java') || lower.endsWith('.kt')) {
      const text = safeRead(absPath);
      if (text) javaFiles.push({ rel: relPath, abs: absPath, text });
      return;
    }
    if (/\.(tsx?|jsx?|mts|cts)$/i.test(lower) && !lower.endsWith('.d.ts')) {
      const text = safeRead(absPath);
      if (text) tsFiles.push({ rel: relPath, abs: absPath, text });
    }
  }, maxFiles * 4);

  const language: IntegrationLanguage =
    javaFiles.length > 0 ? 'java' : tsFiles.length > 0 ? 'typescript' : 'unknown';

  const entrypoints: TopologyFile[] = [];
  const packages = new Set<string>();
  let di: string | undefined;
  let http: string | undefined;
  let test: string | undefined;

  const limit = Math.min(javaFiles.length, maxFiles);
  for (let i = 0; i < limit; i++) {
    const f = javaFiles[i]!;
    const pkg = f.text.match(/^\s*package\s+([a-zA-Z0-9_.]+)\s*;/m)?.[1];
    if (pkg) packages.add(pkg);
    const symbol = javaTypeName(f.text, basename(f.rel));
    const role = classifyJava(f.rel, f.text, symbol);
    if (role !== 'other' || isLikelyIntegrationPath(f.rel)) {
      entrypoints.push({
        path: f.rel,
        role: role === 'other' ? 'client' : role,
        symbol,
        package: pkg,
        evidence: roleEvidence(role, f.rel, f.text),
      });
    }
    if (!di) di = detectDi(f.text);
    if (!http) http = detectHttp(f.text);
    if (!test && /test/i.test(f.rel)) test = detectTest(f.text);
  }

  // TS secondary
  if (language === 'typescript' || (language === 'unknown' && tsFiles.length)) {
    const tsLimit = Math.min(tsFiles.length, maxFiles);
    for (let i = 0; i < tsLimit; i++) {
      const f = tsFiles[i]!;
      if (!isLikelyIntegrationPath(f.rel) && !/(adapter|client|registry|router|port)/i.test(f.rel)) {
        continue;
      }
      const role = classifyTs(f.rel, f.text);
      entrypoints.push({
        path: f.rel,
        role,
        symbol: tsExportName(f.text, basename(f.rel)),
        evidence: roleEvidence(role, f.rel, f.text),
      });
      if (!http) http = detectHttp(f.text);
    }
  }

  const moduleRoot = resolveModuleRoot(absRoot, opts.moduleRoot, entrypoints, buildFiles);
  const basePackage = inferBasePackage([...packages]);
  const hasProductionSignals = entrypoints.some((e) =>
    ['facade', 'adapter', 'registry', 'router', 'port', 'client'].includes(e.role),
  );

  const recommendedMode: 'integrate' | 'none' = hasProductionSignals ? 'integrate' : 'none';

  const reason = hasProductionSignals
    ? `Found ${entrypoints.length} production integration file(s) under ${moduleRoot}.`
    : 'No facade/adapter/registry/client entrypoints found — pass --module-root to the production module.';

  const addVendorPattern = inferAddVendorPattern(entrypoints, language);

  return {
    schemaVersion: 1,
    language,
    recommendedMode,
    reason,
    moduleRoot,
    package: basePackage,
    entrypoints: entrypoints.sort((a, b) => a.path.localeCompare(b.path)),
    addVendorPattern,
    di,
    http,
    test,
    buildFiles: [...buildFiles].sort(),
    scannedAt: new Date().toISOString(),
    scanRoot: absRoot,
  };
}

export function topologySuggestsIntegrate(t: IntegrationTopology): boolean {
  return t.recommendedMode === 'integrate';
}

function resolveModuleRoot(
  absRoot: string,
  configured: string | undefined,
  entrypoints: TopologyFile[],
  buildFiles: string[],
): string {
  if (configured?.trim()) {
    const c = configured.trim();
    return resolve(absRoot, c);
  }
  // Prefer directory containing most entrypoints under src/main/java or src/
  const withSrc = entrypoints
    .map((e) => e.path)
    .filter((p) => p.includes('src/main/java') || p.includes('src/main/kotlin'));
  if (withSrc.length) {
    const sample = withSrc[0]!;
    const idx = sample.indexOf('src/main/java');
    const kidx = sample.indexOf('src/main/kotlin');
    const cut = idx >= 0 ? idx : kidx;
    if (cut > 0) return resolve(absRoot, sample.slice(0, cut - 1) || '.');
    if (cut === 0) return absRoot;
  }
  const pom = buildFiles.find((b) => b.endsWith('pom.xml') && !b.includes('node_modules'));
  if (pom && pom !== 'pom.xml') {
    return resolve(absRoot, dirname(pom));
  }
  return absRoot;
}

function classifyJava(rel: string, text: string, symbol?: string): TopologyRole {
  const name = (symbol ?? basename(rel, '.java')).toLowerCase();
  const pathL = rel.toLowerCase();
  const t = text;

  if (/test/i.test(rel) || /tests?\//i.test(pathL)) return 'test';
  if (
    /\binterface\s+\w*(Port|Gateway|Delivery|Privacy)\b/.test(t) ||
    /port\.java$/i.test(rel) ||
    name.endsWith('port') ||
    name.endsWith('gateway')
  ) {
    return 'port';
  }
  if (
    /registry/i.test(name) ||
    /\bclass\s+\w*Registry\b/.test(t) ||
    /\b(register|put)\s*\(\s*(vendor|id)/i.test(t)
  ) {
    return 'registry';
  }
  if (
    /router|dispatcher|routing/i.test(name) ||
    /\b(route|dispatch)\s*\(/i.test(t) ||
    /intent\s*→|intent\s*->/i.test(t)
  ) {
    return 'router';
  }
  if (
    /adapter/i.test(name) ||
    /\b(class|interface)\s+\w*Adapter\b/.test(t) ||
    /implements\s+\w*Adapter\b/.test(t) ||
    /implements\s+\w*Port\b/.test(t)
  ) {
    return 'adapter';
  }
  if (
    /datalayerclient|integrationclient|facade/i.test(name) ||
    /\btrack\s*\(/.test(t) ||
    /\bclass\s+\w*Client\b/.test(t) && /\b(send|track|publish|notify)\s*\(/.test(t)
  ) {
    return name.includes('client') && !/adapter/i.test(name) ? 'facade' : 'facade';
  }
  if (/config|configuration|beans/i.test(name) || /@Configuration\b/.test(t)) return 'config';
  if (/\bclass\s+\w*Client\b/.test(t) || /client\.java$/i.test(rel)) return 'client';
  return 'other';
}

function classifyTs(rel: string, text: string): TopologyRole {
  const pathL = rel.toLowerCase();
  if (/test|spec/i.test(pathL)) return 'test';
  if (/registry/i.test(pathL)) return 'registry';
  if (/router|dispatch/i.test(pathL)) return 'router';
  if (/adapter/i.test(pathL)) return 'adapter';
  if (/port|gateway/i.test(pathL)) return 'port';
  if (/client/i.test(pathL) && /track|send|publish/i.test(text)) return 'facade';
  if (/client/i.test(pathL)) return 'client';
  return 'other';
}

function isLikelyIntegrationPath(rel: string): boolean {
  return /(integrat|datalayer|vendor|adapter|delivery|privacy|messaging|notify)/i.test(
    rel,
  );
}

function roleEvidence(role: TopologyRole, rel: string, text: string): string {
  if (role === 'adapter' && /Adapter/i.test(text)) return 'Adapter type in source';
  if (role === 'registry' && /Registry/i.test(text)) return 'Registry type in source';
  if (role === 'facade' && /\btrack\s*\(/.test(text)) return 'track() entry API';
  if (role === 'port') return 'Port/gateway interface';
  if (role === 'router') return 'routing/dispatch signals';
  return `path=${rel}`;
}

function inferAddVendorPattern(
  entrypoints: TopologyFile[],
  language: IntegrationLanguage,
): string {
  const hasAdapter = entrypoints.some((e) => e.role === 'adapter');
  const hasRegistry = entrypoints.some((e) => e.role === 'registry');
  const hasRouter = entrypoints.some((e) => e.role === 'router');
  const hasPort = entrypoints.some((e) => e.role === 'port');
  const hasFacade = entrypoints.some((e) => e.role === 'facade' || e.role === 'client');
  const parts: string[] = [];
  if (hasAdapter) {
    parts.push('Add a new *Adapter (or Port impl) beside existing adapters');
  } else if (hasPort) {
    parts.push('Implement existing Port/Gateway interface for the vendor');
  } else if (language === 'typescript') {
    parts.push('Add vendor module matching existing client/adapter layout');
  } else {
    parts.push('Create vendor client/adapter under the integration package');
  }
  if (hasRegistry) parts.push('register it in the Registry');
  if (hasRouter) parts.push('wire intent→vendor in the Router if needed');
  if (hasFacade) parts.push('keep the existing facade entry API (do not invent a parallel client)');
  parts.push('add tests mirroring existing vendor tests');
  return parts.join('; ') + '.';
}

function javaTypeName(text: string, fileBase: string): string | undefined {
  const m = text.match(/\b(?:public\s+)?(?:class|interface|record|enum)\s+([A-Za-z_][A-Za-z0-9_]*)/);
  if (m?.[1]) return m[1];
  return fileBase.replace(/\.(java|kt)$/i, '');
}

function tsExportName(text: string, fileBase: string): string | undefined {
  const m =
    text.match(/export\s+(?:default\s+)?(?:class|function|const|interface|type)\s+([A-Za-z_][A-Za-z0-9_]*)/) ||
    text.match(/export\s+\{\s*([A-Za-z_][A-Za-z0-9_]*)/);
  if (m?.[1]) return m[1];
  return fileBase.replace(/\.(tsx?|jsx?|mts|cts)$/i, '');
}

function inferBasePackage(packages: string[]): string | undefined {
  if (!packages.length) return undefined;
  // Longest common prefix of package segments
  const split = packages.map((p) => p.split('.'));
  const first = split[0]!;
  const common: string[] = [];
  for (let i = 0; i < first.length; i++) {
    const seg = first[i]!;
    if (split.every((p) => p[i] === seg)) common.push(seg);
    else break;
  }
  // Prefer dropping trailing client/impl if multi
  while (
    common.length > 2 &&
    /^(client|impl|internal|api)$/i.test(common[common.length - 1]!)
  ) {
    common.pop();
  }
  return common.length ? common.join('.') : packages.sort((a, b) => a.length - b.length)[0];
}

function detectDi(text: string): string | undefined {
  if (/@Component|@Service|@Autowired|@Inject|springframework/i.test(text)) return 'spring';
  if (/@Inject|javax\.inject|jakarta\.inject|guice/i.test(text)) return 'javax.inject/guice';
  if (/public\s+\w+\s*\([^)]{0,120}\)/.test(text)) return 'constructor injection';
  return undefined;
}

function detectHttp(text: string): string | undefined {
  if (/okhttp3|OkHttpClient/i.test(text)) return 'OkHttp';
  if (/WebClient|webflux/i.test(text)) return 'WebClient';
  if (/java\.net\.http|HttpClient/i.test(text)) return 'JDK HttpClient';
  if (/axios|node-fetch|undici|\bfetch\s*\(/i.test(text)) return 'fetch/axios';
  return undefined;
}

function detectTest(text: string): string | undefined {
  if (/org\.junit|@Test\b/.test(text)) return 'JUnit';
  if (/mockito|@Mock\b/i.test(text)) return 'JUnit+Mockito';
  if (/vitest|describe\s*\(|it\s*\(/i.test(text)) return 'vitest/jest';
  return undefined;
}

function walk(
  absRoot: string,
  dir: string,
  onFile: (absPath: string, relPath: string, base: string) => void,
  budget: number,
  depth = 0,
): number {
  if (depth > 24 || budget <= 0) return budget;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return budget;
  }
  for (const ent of entries) {
    if (budget <= 0) break;
    const name = ent.name;
    if (ent.isDirectory()) {
      if (name.startsWith('.') || SKIP_DIR_NAMES.has(name)) continue;
      budget = walk(absRoot, join(dir, name), onFile, budget, depth + 1);
      continue;
    }
    if (!ent.isFile()) continue;
    if (name.startsWith('.') || DENY_BASENAMES.has(name)) continue;
    if (/\.(pem|key|p12|jks|keystore)$/i.test(name)) continue;
    const absPath = join(dir, name);
    try {
      if (statSync(absPath).size > 1_500_000) continue;
    } catch {
      continue;
    }
    let relPath: string;
    try {
      relPath = relative(absRoot, absPath).split(sep).join('/');
    } catch {
      relPath = absPath;
    }
    onFile(absPath, relPath, name);
    budget--;
  }
  return budget;
}

function safeRead(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

export function isTopologyScannableRoot(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}
