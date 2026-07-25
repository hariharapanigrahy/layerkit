/**
 * Heuristic Java style scanner — filesystem grep, no AST.
 * Detects package roots, build tools, HTTP client, DI, and test stack.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import {
  formatStyleProfileMarkdown,
  requireStyleProfile,
  type StyleProfile,
} from './style-profile.js';

/** Relative path of the runbook style profile under projectDir. */
export const STYLE_PROFILE_RUNBOOK_REL = join('memory', 'runbooks', 'java-style-profile.md');

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
  'vendor',
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

export interface StyleScanEvidence {
  root: string;
  javaFiles: string[];
  packages: string[];
  buildFiles: string[];
  httpHits: string[];
  diHits: string[];
  testHits: string[];
  loggingHits: string[];
  configHits: string[];
}

export interface StyleScanResult {
  evidence: StyleScanEvidence;
  profile: StyleProfile;
}

/**
 * Walk a repo (or fixture tree) and infer a StyleProfile from file/content signals.
 */
export function scanJavaStyle(root: string): StyleScanResult {
  const absRoot = root;
  const javaFiles: string[] = [];
  const packages = new Set<string>();
  const buildFiles: string[] = [];
  const httpHits = new Set<string>();
  const diHits = new Set<string>();
  const testHits = new Set<string>();
  const loggingHits = new Set<string>();
  const configHits = new Set<string>();

  walk(absRoot, absRoot, (absPath, relPath, base) => {
    const lower = base.toLowerCase();

    if (lower === 'pom.xml' || lower === 'build.gradle' || lower === 'build.gradle.kts') {
      buildFiles.push(relPath);
      scanBuildText(safeRead(absPath), httpHits, testHits, loggingHits, diHits);
      return;
    }

    if (!lower.endsWith('.java') && !lower.endsWith('.kt')) return;
    if (DENY_BASENAMES.has(base)) return;

    javaFiles.push(relPath);
    const text = safeRead(absPath);
    if (!text) return;

    const pkg = text.match(/^\s*package\s+([a-zA-Z0-9_.]+)\s*;/m);
    if (pkg?.[1]) packages.add(pkg[1]);

    scanJavaText(text, httpHits, diHits, testHits, loggingHits, configHits);
  });

  const evidence: StyleScanEvidence = {
    root: absRoot,
    javaFiles,
    packages: [...packages].sort(),
    buildFiles: [...buildFiles].sort(),
    httpHits: [...httpHits].sort(),
    diHits: [...diHits].sort(),
    testHits: [...testHits].sort(),
    loggingHits: [...loggingHits].sort(),
    configHits: [...configHits].sort(),
  };

  const profile = profileFromEvidence(evidence);
  return { evidence, profile };
}

/**
 * Build a complete StyleProfile from scan evidence (always validates).
 */
export function profileFromEvidence(ev: StyleScanEvidence): StyleProfile {
  const basePkg = inferBasePackage(ev.packages);
  const hasLayering = ev.packages.some((p) =>
    /\.(api|domain|infrastructure|infra)\b/i.test(p),
  );

  const packageDesc = basePkg
    ? hasLayering
      ? `${basePkg} (api / domain / infrastructure layering detected)`
      : `${basePkg} (from package declarations)`
    : ev.javaFiles.length
      ? 'unknown package (Java present but no package declaration)'
      : 'no Java sources found — use Layerkit reference package';

  const di = inferDi(ev.diHits);
  const http = inferHttp(ev.httpHits);
  const test = inferTest(ev.testHits);
  const logging = inferLogging(ev.loggingHits);
  const config = inferConfig(ev.configHits, ev.buildFiles);

  const notesParts: string[] = [];
  if (ev.buildFiles.length) notesParts.push(`build: ${ev.buildFiles.join(', ')}`);
  if (ev.javaFiles.length) notesParts.push(`java files scanned: ${ev.javaFiles.length}`);
  if (!ev.javaFiles.length && !ev.buildFiles.length) {
    notesParts.push('empty scan — defaults are Layerkit reference style');
  }

  const partial: StyleProfile = {
    package: packageDesc,
    di,
    http,
    test,
    ...(logging ? { logging } : {}),
    ...(config ? { config } : {}),
    ...(notesParts.length ? { notes: notesParts.join('; ') } : {}),
  };

  return requireStyleProfile(partial);
}

/**
 * Write profile markdown under `{projectDir}/memory/runbooks/java-style-profile.md`.
 * Returns absolute path written.
 */
export function writeStyleProfileRunbook(projectDir: string, profile: StyleProfile): string {
  const full = requireStyleProfile(profile);
  const abs = join(projectDir, STYLE_PROFILE_RUNBOOK_REL);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, formatStyleProfileMarkdown(full) + '\n', 'utf8');
  return abs;
}

/**
 * Scan root and write runbook (or custom out path).
 * `out === 'memory'` (default) → projectDir runbook path.
 */
export function scanAndWriteStyleProfile(opts: {
  root: string;
  projectDir: string;
  out?: string;
}): { result: StyleScanResult; outPath: string } {
  const result = scanJavaStyle(opts.root);
  const out = opts.out ?? 'memory';
  let outPath: string;
  if (out === 'memory') {
    outPath = writeStyleProfileRunbook(opts.projectDir, result.profile);
  } else {
    outPath = out;
    mkdirSync(join(outPath, '..'), { recursive: true });
    writeFileSync(outPath, formatStyleProfileMarkdown(result.profile) + '\n', 'utf8');
  }
  return { result, outPath };
}

// --- internals ---

function walk(
  absRoot: string,
  dir: string,
  onFile: (absPath: string, relPath: string, base: string) => void,
  depth = 0,
): void {
  if (depth > 24) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const name = ent.name;
    if (ent.isDirectory()) {
      if (name.startsWith('.') || SKIP_DIR_NAMES.has(name)) continue;
      walk(absRoot, join(dir, name), onFile, depth + 1);
      continue;
    }
    if (!ent.isFile()) continue;
    if (name.startsWith('.') || DENY_BASENAMES.has(name)) continue;
    if (/\.(pem|key|p12|jks|keystore)$/i.test(name)) continue;
    const absPath = join(dir, name);
    let relPath: string;
    try {
      relPath = relative(absRoot, absPath).split(sep).join('/');
    } catch {
      relPath = absPath;
    }
    try {
      if (statSync(absPath).size > 1_500_000) continue;
    } catch {
      continue;
    }
    onFile(absPath, relPath, name);
  }
}

function safeRead(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

function scanBuildText(
  text: string,
  http: Set<string>,
  test: Set<string>,
  logging: Set<string>,
  di: Set<string>,
): void {
  if (!text) return;
  const t = text.toLowerCase();
  if (t.includes('okhttp')) http.add('OkHttp');
  if (t.includes('webflux') || t.includes('spring-webflux') || t.includes('webclient')) {
    http.add('WebClient');
  }
  if (t.includes('httpclient') || t.includes('java.net.http')) http.add('JDK HttpClient');
  if (t.includes('apache.http') || t.includes('httpcomponents')) http.add('Apache HttpClient');
  if (t.includes('junit')) test.add('JUnit');
  if (t.includes('junit-jupiter') || t.includes('junit.jupiter')) test.add('JUnit 5');
  if (t.includes('assertj')) test.add('AssertJ');
  if (t.includes('mockito')) test.add('Mockito');
  if (t.includes('wiremock')) test.add('WireMock');
  if (t.includes('mockwebserver')) test.add('MockWebServer');
  if (t.includes('slf4j')) logging.add('SLF4J');
  if (t.includes('logback')) logging.add('Logback');
  if (t.includes('spring-boot') || t.includes('springframework')) di.add('Spring');
  if (t.includes('jakarta.inject') || t.includes('javax.inject')) di.add('JSR-330');
}

function scanJavaText(
  text: string,
  http: Set<string>,
  di: Set<string>,
  test: Set<string>,
  logging: Set<string>,
  config: Set<string>,
): void {
  // HTTP
  if (/okhttp3?\b/i.test(text) || /import\s+okhttp/i.test(text)) http.add('OkHttp');
  if (/WebClient\b/.test(text) || /org\.springframework\.web\.reactive\.function\.client/.test(text)) {
    http.add('WebClient');
  }
  if (
    /java\.net\.http\.HttpClient/.test(text) ||
    /import\s+java\.net\.http/.test(text) ||
    /\bHttpClient\b/.test(text)
  ) {
    http.add('JDK HttpClient');
  }
  if (/org\.apache\.http/.test(text) || /CloseableHttpClient/.test(text)) {
    http.add('Apache HttpClient');
  }

  // DI / Spring / Jakarta
  if (/@Component\b|@Service\b|@Repository\b|@Autowired\b|@Configuration\b/.test(text)) {
    di.add('Spring stereotype');
  }
  if (/org\.springframework/.test(text)) di.add('Spring');
  if (/jakarta\.(inject|annotation|enterprise)/.test(text) || /@Inject\b/.test(text)) {
    di.add('Jakarta');
  }
  if (/javax\.inject/.test(text)) di.add('JSR-330');
  if (
    /public\s+\w+\s*\([^)]{0,200}\)\s*\{/.test(text) &&
    /private\s+final\b/.test(text)
  ) {
    di.add('constructor injection');
  }

  // Tests
  if (/org\.junit\.jupiter|@Test\b|@ExtendWith\b/.test(text)) test.add('JUnit 5');
  if (/org\.junit\.Test\b|org\.junit\.runner/.test(text)) test.add('JUnit 4');
  if (/org\.assertj|assertThat\s*\(/.test(text)) test.add('AssertJ');
  if (/org\.mockito|@Mock\b|Mockito\./.test(text)) test.add('Mockito');
  if (/com\.github\.tomakehurst\.wiremock|WireMock\b/.test(text)) test.add('WireMock');
  if (/okhttp3\.mockwebserver|MockWebServer\b/.test(text)) test.add('MockWebServer');

  // Logging
  if (/org\.slf4j|LoggerFactory\b/.test(text)) logging.add('SLF4J');
  if (/org\.apache\.logging\.log4j/.test(text)) logging.add('Log4j');

  // Config
  if (/@Value\b|@ConfigurationProperties\b/.test(text)) config.add('Spring config');
  if (/application\.(yml|yaml|properties)/.test(text)) config.add('application.yml/properties');
}

function inferBasePackage(packages: string[]): string | undefined {
  if (!packages.length) return undefined;
  // Prefer shortest common prefix of package segments
  const split = packages.map((p) => p.split('.'));
  const minLen = Math.min(...split.map((s) => s.length));
  const common: string[] = [];
  for (let i = 0; i < minLen; i++) {
    const seg = split[0]![i]!;
    if (split.every((s) => s[i] === seg)) common.push(seg);
    else break;
  }
  // Drop trailing layer segment if present
  while (
    common.length > 2 &&
    /^(api|domain|infrastructure|infra|client|adapter|service|impl|internal)$/i.test(
      common[common.length - 1]!,
    )
  ) {
    common.pop();
  }
  if (common.length >= 2) return common.join('.');
  // fall back to most frequent top-level package path (first 3 segments)
  const tops = packages.map((p) => p.split('.').slice(0, 3).join('.'));
  tops.sort();
  return tops[0];
}

function inferDi(hits: string[]): string {
  const h = hits.join(' ').toLowerCase();
  if (h.includes('spring')) {
    if (h.includes('constructor')) {
      return 'constructor injection via Spring @Component/@Service';
    }
    return 'Spring @Component/@Service (stereotype DI)';
  }
  if (h.includes('jakarta') || h.includes('jsr-330')) {
    return 'Jakarta/JSR-330 @Inject';
  }
  if (h.includes('constructor')) return 'constructor injection (plain)';
  return 'plain constructors / factories (no DI framework detected)';
}

function inferHttp(hits: string[]): string {
  if (hits.includes('OkHttp')) return 'OkHttp';
  if (hits.includes('WebClient')) return 'Spring WebClient';
  if (hits.includes('Apache HttpClient')) return 'Apache HttpClient';
  if (hits.includes('JDK HttpClient')) return 'JDK HttpClient';
  return 'JDK HttpClient (default; no client library detected)';
}

function inferTest(hits: string[]): string {
  const parts: string[] = [];
  if (hits.some((h) => /JUnit 5/i.test(h))) parts.push('JUnit 5');
  else if (hits.some((h) => /JUnit 4/i.test(h))) parts.push('JUnit 4');
  else if (hits.some((h) => /JUnit/i.test(h))) parts.push('JUnit');
  if (hits.includes('AssertJ')) parts.push('AssertJ');
  if (hits.includes('Mockito')) parts.push('Mockito');
  if (hits.includes('WireMock')) parts.push('WireMock');
  if (hits.includes('MockWebServer')) parts.push('MockWebServer');
  if (!parts.length) return 'JUnit 5 (default; no test stack detected)';
  return parts.join(' + ');
}

function inferLogging(hits: string[]): string | undefined {
  if (!hits.length) return undefined;
  return hits.join(' + ');
}

function inferConfig(hits: string[], buildFiles: string[]): string | undefined {
  if (hits.length) return hits.join(' + ');
  if (buildFiles.some((f) => f.endsWith('pom.xml'))) return 'Maven pom.xml';
  if (buildFiles.some((f) => /build\.gradle/.test(f))) return 'Gradle';
  return undefined;
}

/** True if path looks like a scannable root (exists as dir). */
export function isScannableRoot(root: string): boolean {
  try {
    return existsSync(root) && statSync(root).isDirectory();
  } catch {
    return false;
  }
}
