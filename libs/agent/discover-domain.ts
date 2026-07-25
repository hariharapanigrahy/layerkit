/**
 * Heuristic customer domain discovery — filesystem grep, no full AST.
 * Detects track/analytics emit call sites, Java Event types, and field paths
 * from TS/JS/Java/Kotlin sources. Never invents intents or fields.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { DomainSpec, Proposal } from '../domain/types.js';

/** Relative path of the domain discovery runbook under projectDir. */
export const DOMAIN_DISCOVERY_RUNBOOK_REL = join('memory', 'runbooks', 'domain-discovery.md');

/** Same skip dirs as scan-style.ts — do not invent a second policy. */
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

/** Same deny basenames as scan-style.ts. */
const DENY_BASENAMES = new Set([
  '.env',
  '.env.local',
  '.env.production',
  'id_rsa',
  'id_ed25519',
  'credentials.json',
  'secrets.json',
]);

const SCANNABLE_EXT = /\.(ts|tsx|js|jsx|java|kt)$/i;

/** Track / analytics emit call-site patterns. */
const TRACK_CALL_RES: RegExp[] = [
  /\btrack\s*\(/g,
  /\banalytics\.track\s*\(/g,
  /\blayerkit\.track\s*\(/g,
  /\bsendEvent\s*\(/g,
  /\bemit\s*\(/g,
];

/** Known field path fragments that must appear literally in code. */
const FIELD_PATH_RES: RegExp[] = [
  /\buser\.email\b/g,
  /\buser\.phone\b/g,
  /\buser\.externalId\b/g,
  /\buser\.id\b/g,
  /\borderId\b/g,
  /\border_id\b/g,
  /\beventId\b/g,
  /\bevent_id\b/g,
  /\bproduct\.id\b/g,
  /\bproductId\b/g,
  /\bvalue\.amount\b/g,
  /\bvalue\.currency\b/g,
  /\bcontext\.url\b/g,
];

/** Standalone identifier fields commonly on DTOs / object literals. */
const SIMPLE_FIELD_IDS = [
  'email',
  'phone',
  'orderId',
  'order_id',
  'eventId',
  'event_id',
  'productId',
  'product_id',
  'externalId',
  'external_id',
  'currency',
  'amount',
] as const;

export interface DomainDiscoverySource {
  file: string;
  excerpt: string;
}

export interface DomainIntentHit {
  id: string;
  /** Short note of how it was found (not free-form invention). */
  description: string;
}

export interface DomainFieldHit {
  path: string;
  type: string;
  description: string;
  required?: boolean;
}

export interface DomainDiscoveryResult {
  root: string;
  scannedFiles: string[];
  intents: DomainIntentHit[];
  fields: DomainFieldHit[];
  sources: DomainDiscoverySource[];
}

/**
 * Walk a repo (or fixture tree) and collect domain intents/fields from code only.
 */
export function scanDomain(root: string): DomainDiscoveryResult {
  const absRoot = root;
  const scannedFiles: string[] = [];
  const intentMap = new Map<string, DomainIntentHit>();
  const fieldMap = new Map<string, DomainFieldHit>();
  const sources: DomainDiscoverySource[] = [];
  const sourceKeys = new Set<string>();

  const addSource = (file: string, excerpt: string) => {
    const ex = excerpt.replace(/\s+/g, ' ').trim().slice(0, 160);
    if (!ex) return;
    const key = `${file}::${ex}`;
    if (sourceKeys.has(key)) return;
    sourceKeys.add(key);
    sources.push({ file, excerpt: ex });
  };

  const addIntent = (id: string, description: string, file: string, excerpt: string) => {
    const norm = normalizeIntentId(id);
    if (!norm) return;
    if (!intentMap.has(norm)) {
      intentMap.set(norm, { id: norm, description });
    }
    addSource(file, excerpt);
  };

  const addField = (
    path: string,
    type: string,
    description: string,
    file: string,
    excerpt: string,
  ) => {
    const p = path.trim();
    if (!p || p.length > 80) return;
    if (!fieldMap.has(p)) {
      fieldMap.set(p, { path: p, type, description, required: false });
    }
    addSource(file, excerpt);
  };

  walk(absRoot, absRoot, (absPath, relPath, base) => {
    if (!SCANNABLE_EXT.test(base)) return;
    if (DENY_BASENAMES.has(base)) return;
    if (/\.(test|spec)\.(ts|tsx|js|jsx)$/i.test(base)) return;
    if (/Test\.(java|kt)$/i.test(base)) return;

    scannedFiles.push(relPath);
    const text = safeRead(absPath);
    if (!text) return;

    const isJvm = /\.(java|kt)$/i.test(base);
    if (isJvm) {
      scanJvm(text, relPath, addIntent, addField);
    } else {
      scanTsJs(text, relPath, addIntent, addField);
    }
  });

  return {
    root: absRoot,
    scannedFiles: scannedFiles.sort(),
    intents: [...intentMap.values()].sort((a, b) => a.id.localeCompare(b.id)),
    fields: [...fieldMap.values()].sort((a, b) => a.path.localeCompare(b.path)),
    sources: sources.sort(
      (a, b) => a.file.localeCompare(b.file) || a.excerpt.localeCompare(b.excerpt),
    ),
  };
}

/**
 * Build a draft domain_spec Proposal from scan results (file:// sources).
 * Never invents intents/fields beyond what the scan found.
 */
export function buildDomainSpecProposal(
  result: DomainDiscoveryResult,
  opts?: { id?: string; createdAt?: string },
): Proposal {
  const createdAt = opts?.createdAt ?? new Date().toISOString();
  const payload: DomainSpec = {
    id: opts?.id ?? 'discovered',
    version: '0.1.0',
    description:
      result.intents.length || result.fields.length
        ? 'Customer domain intents/fields discovered from code (heuristic scan)'
        : 'No domain intents/fields found in scanned sources',
    intents: result.intents.map((i) => ({
      id: i.id,
      description: i.description,
    })),
    fields: result.fields.map((f) => ({
      path: f.path,
      type: f.type,
      description: f.description,
      required: f.required ?? false,
    })),
  };

  const sources = result.sources.map((s) => ({
    title: `code:${s.file}`,
    url: `file://${s.file}`,
    excerpt: s.excerpt,
  }));

  // Proposals require non-empty sources[]; empty scan still cites the root (no invented fields).
  if (!sources.length) {
    sources.push({
      title: 'domain-scan',
      url: 'file://.',
      excerpt: 'heuristic domain scan found no track sites or Event types',
    });
  }

  return {
    schemaVersion: 2,
    kind: 'domain_spec',
    id: `domain-spec-${payload.id}-v1`,
    summary: 'Customer domain intents/fields from code',
    authoredBy: 'agent',
    status: 'draft',
    createdAt,
    sources,
    payload,
    maker: { type: 'agent', id: 'layerkit-discover' },
  };
}

/** Format discovery result as a markdown runbook. */
export function formatDomainDiscoveryMarkdown(result: DomainDiscoveryResult): string {
  const lines: string[] = [
    '# Domain discovery',
    '',
    'Heuristic scan of customer code for intents and fields. Evidence-only — no invented names.',
    '',
    `Root: \`${result.root}\``,
    `Scanned files: ${result.scannedFiles.length}`,
    '',
    '## Intents',
    '',
  ];

  if (!result.intents.length) {
    lines.push('_None found_');
  } else {
    for (const i of result.intents) {
      lines.push(`- \`${i.id}\` — ${i.description}`);
    }
  }

  lines.push('', '## Fields', '');
  if (!result.fields.length) {
    lines.push('_None found_');
  } else {
    for (const f of result.fields) {
      lines.push(`- \`${f.path}\` (${f.type}) — ${f.description}`);
    }
  }

  lines.push('', '## Sources', '');
  if (!result.sources.length) {
    lines.push('_No excerpts_');
  } else {
    for (const s of result.sources) {
      lines.push(`- \`${s.file}\`: ${s.excerpt}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Write runbook under `{projectDir}/memory/runbooks/domain-discovery.md`.
 */
export function writeDomainDiscoveryRunbook(
  projectDir: string,
  result: DomainDiscoveryResult,
): string {
  const abs = join(projectDir, DOMAIN_DISCOVERY_RUNBOOK_REL);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, formatDomainDiscoveryMarkdown(result), 'utf8');
  return abs;
}

/**
 * Scan root and write runbook (and optional proposal JSON).
 * `out === 'memory'` (default) → projectDir runbook path.
 */
export function scanAndWriteDomainDiscovery(opts: {
  root: string;
  projectDir: string;
  out?: string;
  /** Optional path for domain_spec proposal JSON. */
  proposal?: string;
}): {
  result: DomainDiscoveryResult;
  outPath: string;
  proposalPath?: string;
  proposal?: Proposal;
} {
  const result = scanDomain(opts.root);
  const out = opts.out ?? 'memory';
  let outPath: string;
  if (out === 'memory') {
    outPath = writeDomainDiscoveryRunbook(opts.projectDir, result);
  } else {
    outPath = out;
    mkdirSync(join(outPath, '..'), { recursive: true });
    writeFileSync(outPath, formatDomainDiscoveryMarkdown(result), 'utf8');
  }

  let proposalPath: string | undefined;
  let proposal: Proposal | undefined;
  if (opts.proposal) {
    proposal = buildDomainSpecProposal(result);
    proposalPath = opts.proposal;
    mkdirSync(join(proposalPath, '..'), { recursive: true });
    writeFileSync(proposalPath, JSON.stringify(proposal, null, 2) + '\n', 'utf8');
  }

  return { result, outPath, proposalPath, proposal };
}

/** True if path looks like a scannable root (exists as dir). */
export function isDomainScannableRoot(root: string): boolean {
  try {
    return existsSync(root) && statSync(root).isDirectory();
  } catch {
    return false;
  }
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
    if (/secret|credential/i.test(name) && !SCANNABLE_EXT.test(name)) continue;
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

function normalizeIntentId(raw: string): string | undefined {
  let s = raw.trim();
  if (!s) return undefined;
  s = s.replace(/^['"`]|['"`]$/g, '');
  if (!s || s.length > 64) return undefined;
  if (/^(true|false|null|undefined|this|window|event|data|props|options)$/i.test(s)) {
    return undefined;
  }
  if (!/^[A-Za-z][A-Za-z0-9_.-]*$/.test(s)) return undefined;

  if (/^[A-Z]/.test(s) || /Event$|Intent$/i.test(s)) {
    s = s.replace(/(Event|Intent)$/i, '');
    s = s.replace(/([a-z0-9])([A-Z])/g, '$1_$2');
  }
  s = s.replace(/[.-]+/g, '_').replace(/__+/g, '_').toLowerCase();
  if (!s || s.length < 2) return undefined;
  return s;
}

function excerptAround(text: string, index: number, len = 100): string {
  const start = Math.max(0, index - 20);
  const end = Math.min(text.length, index + len);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

function scanTsJs(
  text: string,
  file: string,
  addIntent: (id: string, description: string, file: string, excerpt: string) => void,
  addField: (
    path: string,
    type: string,
    description: string,
    file: string,
    excerpt: string,
  ) => void,
): void {
  for (const re of TRACK_CALL_RES) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const callStart = m.index;
      const after = text.slice(callStart, callStart + 400);
      const nameM =
        after.match(/(?:track|sendEvent|emit)\s*\(\s*(['"`])([^'"`\n]+)\1/i) ??
        after.match(/\.\s*(?:track|sendEvent|emit)\s*\(\s*(['"`])([^'"`\n]+)\1/i);
      if (nameM?.[2]) {
        addIntent(nameM[2], `track/emit call site in ${file}`, file, excerptAround(text, callStart));
      }
      scanObjectFieldKeys(after, file, addField);
    }
  }

  scanFieldPathsInText(text, file, addField);

  const typeEventRe =
    /\b(?:interface|type|class)\s+([A-Za-z][A-Za-z0-9_]*(?:Event|Intent))\b/g;
  let tm: RegExpExecArray | null;
  while ((tm = typeEventRe.exec(text)) !== null) {
    addIntent(tm[1]!, `TS type/interface ${tm[1]}`, file, excerptAround(text, tm.index));
  }
}

function scanJvm(
  text: string,
  file: string,
  addIntent: (id: string, description: string, file: string, excerpt: string) => void,
  addField: (
    path: string,
    type: string,
    description: string,
    file: string,
    excerpt: string,
  ) => void,
): void {
  const typeRes: RegExp[] = [
    /\brecord\s+([A-Za-z][A-Za-z0-9_]*(?:Event|Intent))\b/g,
    /\b(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:final\s+)?class\s+([A-Za-z][A-Za-z0-9_]*(?:Event|Intent))\b/g,
    /\bdata\s+class\s+([A-Za-z][A-Za-z0-9_]*(?:Event|Intent))\b/g,
  ];
  for (const re of typeRes) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      addIntent(m[1]!, `JVM type ${m[1]}`, file, excerptAround(text, m.index));
    }
  }

  const enumBlockRe =
    /\benum\s+(?:class\s+)?([A-Za-z][A-Za-z0-9_]*)\s*\{([^}]{0,2000})\}/g;
  let em: RegExpExecArray | null;
  while ((em = enumBlockRe.exec(text)) !== null) {
    const enumName = em[1]!;
    const body = em[2]!;
    if (
      !/intent|event|analytics|track/i.test(enumName) &&
      !/Intent|Event/.test(enumName) &&
      !/Domain|Commerce|Action|Signal/i.test(enumName)
    ) {
      continue;
    }
    const constRe = /\b([A-Z][A-Z0-9_]{1,48})\b/g;
    let cm: RegExpExecArray | null;
    while ((cm = constRe.exec(body)) !== null) {
      addIntent(
        cm[1]!,
        `enum ${enumName}.${cm[1]}`,
        file,
        excerptAround(text, em.index + cm.index),
      );
    }
  }

  const fieldDeclRe =
    /\b(?:private|protected|public)?\s*(?:final\s+)?(?:String|int|Integer|long|Long|boolean|Boolean|double|Double|BigDecimal)\s+([A-Za-z][A-Za-z0-9_]*)\s*[;=),]/g;
  let fm: RegExpExecArray | null;
  while ((fm = fieldDeclRe.exec(text)) !== null) {
    mapSimpleFieldName(fm[1]!, file, excerptAround(text, fm.index), addField);
  }

  const recordCompRe = /\brecord\s+[A-Za-z0-9_]+\s*\(([^)]{0,800})\)/g;
  let rm: RegExpExecArray | null;
  while ((rm = recordCompRe.exec(text)) !== null) {
    const comps = rm[1]!;
    const compRe =
      /\b(?:String|int|Integer|long|Long|boolean|Boolean|double|Double|BigDecimal)\s+([A-Za-z][A-Za-z0-9_]*)/g;
    let cm: RegExpExecArray | null;
    while ((cm = compRe.exec(comps)) !== null) {
      mapSimpleFieldName(cm[1]!, file, excerptAround(text, rm.index), addField);
    }
  }

  scanFieldPathsInText(text, file, addField);
}

function scanObjectFieldKeys(
  window: string,
  file: string,
  addField: (
    path: string,
    type: string,
    description: string,
    file: string,
    excerpt: string,
  ) => void,
): void {
  // Nested: user: { ... email ... } → user.email
  const userBlock = window.match(/\buser\s*:\s*\{([^}]{0,400})\}/);
  if (userBlock) {
    const body = userBlock[1]!;
    if (/\bemail\b/.test(body)) {
      addField('user.email', 'string', `object key in ${file}`, file, userBlock[0].slice(0, 120));
    }
    if (/\bphone\b/.test(body)) {
      addField('user.phone', 'string', `object key in ${file}`, file, userBlock[0].slice(0, 120));
    }
    if (/\b(?:externalId|external_id)\b/.test(body)) {
      addField(
        'user.externalId',
        'string',
        `object key in ${file}`,
        file,
        userBlock[0].slice(0, 120),
      );
    }
  }

  for (const id of SIMPLE_FIELD_IDS) {
    const keyRe = new RegExp(`(?:^|[,{\\s])(['"]?)${id}\\1\\s*:`, 'm');
    if (keyRe.test(window)) {
      mapSimpleFieldName(id, file, `${id}: …`, addField);
    }
  }
}

function scanFieldPathsInText(
  text: string,
  file: string,
  addField: (
    path: string,
    type: string,
    description: string,
    file: string,
    excerpt: string,
  ) => void,
): void {
  for (const re of FIELD_PATH_RES) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const raw = m[0];
      const path = raw === 'order_id' ? 'orderId' : raw === 'event_id' ? 'eventId' : raw;
      addField(path, 'string', `path in ${file}`, file, excerptAround(text, m.index));
    }
  }

  const ifaceRe =
    /\b(?:interface|type)\s+[A-Za-z0-9_]+\s*(?:=\s*)?\{([^}]{0,2000})\}/g;
  let im: RegExpExecArray | null;
  while ((im = ifaceRe.exec(text)) !== null) {
    const body = im[1]!;
    const userNested = body.match(/\buser\s*[?]?\s*:\s*\{([^}]{0,400})\}/);
    if (userNested && /\bemail\b/.test(userNested[1]!)) {
      addField(
        'user.email',
        'string',
        `interface field in ${file}`,
        file,
        excerptAround(text, im.index),
      );
    }
    for (const id of SIMPLE_FIELD_IDS) {
      const propRe = new RegExp(`\\b${id}\\s*[?]?\s*:`, 'g');
      if (propRe.test(body)) {
        mapSimpleFieldName(id, file, excerptAround(text, im.index), addField);
      }
    }
  }
}

function mapSimpleFieldName(
  name: string,
  file: string,
  excerpt: string,
  addField: (
    path: string,
    type: string,
    description: string,
    file: string,
    excerpt: string,
  ) => void,
): void {
  const n = name.trim();
  if (!n) return;
  if (n === 'email') {
    addField('email', 'string', `field email in ${file}`, file, excerpt);
    return;
  }
  if (n === 'userEmail' || n === 'user_email') {
    addField('user.email', 'string', `field ${n} in ${file}`, file, excerpt);
    return;
  }
  if (n === 'phone' || n === 'userPhone' || n === 'user_phone') {
    addField(n === 'phone' ? 'phone' : 'user.phone', 'string', `field ${n} in ${file}`, file, excerpt);
    return;
  }
  if (n === 'orderId' || n === 'order_id') {
    addField('orderId', 'string', `field ${n} in ${file}`, file, excerpt);
    return;
  }
  if (n === 'eventId' || n === 'event_id') {
    addField('eventId', 'string', `field ${n} in ${file}`, file, excerpt);
    return;
  }
  if (n === 'productId' || n === 'product_id') {
    addField('productId', 'string', `field ${n} in ${file}`, file, excerpt);
    return;
  }
  if (n === 'externalId' || n === 'external_id') {
    addField('user.externalId', 'string', `field ${n} in ${file}`, file, excerpt);
    return;
  }
  if (n === 'amount') {
    addField('amount', 'number', `field ${n} in ${file}`, file, excerpt);
    return;
  }
  if (n === 'currency') {
    addField('currency', 'string', `field ${n} in ${file}`, file, excerpt);
  }
}
