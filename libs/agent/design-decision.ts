/**
 * Integration shape decision — linear VendorMap vs multi-step Flow vs hybrid.
 * Agents write `{projectDir}/memory/runbooks/design-<vendor>.md` before authoring.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type IntegrationShape = 'linear_map' | 'flow' | 'hybrid';

export interface DesignDecision {
  schemaVersion: 1;
  vendor: string;
  shape: IntegrationShape;
  intents: string[];
  operations: { id: string; method?: string; path?: string }[];
  batch: 'none' | string;
  authSteps: 'none' | 'token_then_post' | string;
  privacyRequired: boolean;
  evidence: string[];
  openQuestions: string[];
  rationale: string;
  decidedAt: string;
}

/** Relative path under projectDir for the design runbook markdown. */
export function designDecisionRunbookRel(vendor: string): string {
  return join('memory', 'runbooks', `design-${sanitizeVendor(vendor)}.md`);
}

/** Absolute path to design-<vendor>.md under projectDir. */
export function designDecisionPath(projectDir: string, vendor: string): string {
  return join(projectDir, designDecisionRunbookRel(vendor));
}

export interface DecideShapeInput {
  hasSequence?: boolean;
  hasBranch?: boolean;
  hasForeach?: boolean;
  hasOauthThenPost?: boolean;
  multiCall?: boolean;
}

/**
 * Pure rule: prefer linear_map; flow when sequence/branch/foreach/oauth;
 * hybrid when multi-call mixes with flow control signals.
 */
export function decideShape(input: DecideShapeInput): IntegrationShape {
  const flowControl =
    !!input.hasSequence ||
    !!input.hasBranch ||
    !!input.hasForeach ||
    !!input.hasOauthThenPost;
  const multi = !!input.multiCall;

  if (!flowControl && !multi) return 'linear_map';
  // Mixed: multi-call map-like work plus control-flow → hybrid
  if (flowControl && multi) return 'hybrid';
  // Sequence / branch / foreach / oauth (or multi-call alone) → flow
  return 'flow';
}

/** Build a default rationale string from shape + input flags. */
export function defaultRationale(shape: IntegrationShape, input: DecideShapeInput): string {
  const flags: string[] = [];
  if (input.hasSequence) flags.push('sequence');
  if (input.hasBranch) flags.push('branch');
  if (input.hasForeach) flags.push('foreach');
  if (input.hasOauthThenPost) flags.push('oauth_then_post');
  if (input.multiCall) flags.push('multi_call');

  if (shape === 'linear_map') {
    return 'Prefer flat VendorMap: no sequence, branch, foreach, or oauth-then-post signals.';
  }
  if (shape === 'hybrid') {
    return `Hybrid: flow control (${flags.filter((f) => f !== 'multi_call').join(', ') || 'control'}) mixed with multi-call — map simple intents, flow multi-step.`;
  }
  return `Flow required by signals: ${flags.join(', ') || 'multi-step'}. Prefer IntegrationFlow over flat map.`;
}

/**
 * Format a design decision as markdown for memory/runbooks.
 */
export function formatDesignDecisionMarkdown(d: DesignDecision): string {
  const ops =
    d.operations.length === 0
      ? '- (none)'
      : d.operations
          .map((o) => {
            const mp = [o.method, o.path].filter(Boolean).join(' ');
            return mp ? `- ${o.id}: ${mp}` : `- ${o.id}`;
          })
          .join('\n');

  const list = (items: string[], empty = '(none)') =>
    items.length ? items.map((x) => `- ${x}`).join('\n') : `- ${empty}`;

  return [
    `# Design decision: ${d.vendor}`,
    '',
    `schemaVersion: ${d.schemaVersion}`,
    `vendor: ${d.vendor}`,
    `shape: ${d.shape}`,
    `decidedAt: ${d.decidedAt}`,
    '',
    '## shape',
    d.shape,
    '',
    '## intents',
    list(d.intents),
    '',
    '## operations',
    ops,
    '',
    '## batch',
    d.batch,
    '',
    '## authSteps',
    d.authSteps,
    '',
    '## privacyRequired',
    d.privacyRequired ? 'yes' : 'no',
    '',
    '## evidence',
    list(d.evidence),
    '',
    '## openQuestions',
    list(d.openQuestions),
    '',
    '## rationale',
    d.rationale,
    '',
  ].join('\n');
}

const SHAPES = new Set<string>(['linear_map', 'flow', 'hybrid']);

function asShape(raw: string | undefined): IntegrationShape | undefined {
  if (!raw) return undefined;
  const s = raw.trim().toLowerCase();
  return SHAPES.has(s) ? (s as IntegrationShape) : undefined;
}

/**
 * Parse markdown written by formatDesignDecisionMarkdown (best-effort).
 */
export function parseDesignDecisionMarkdown(md: string): Partial<DesignDecision> {
  const out: Partial<DesignDecision> = {};
  const lines = md.split(/\r?\n/);

  const kv = (key: string): string | undefined => {
    const re = new RegExp(`^${key}\\s*:\\s*(.+)\\s*$`, 'i');
    for (const line of lines) {
      const m = line.match(re);
      if (m) return m[1]!.trim();
    }
    return undefined;
  };

  const vendor = kv('vendor');
  if (vendor) out.vendor = vendor;

  const shapeKv = asShape(kv('shape'));
  if (shapeKv) out.shape = shapeKv;

  const sv = kv('schemaVersion');
  if (sv === '1') out.schemaVersion = 1;

  const decidedAt = kv('decidedAt');
  if (decidedAt) out.decidedAt = decidedAt;

  const sectionBody = (name: string): string[] => {
    const re = new RegExp(`^#{1,3}\\s+${name}\\s*$`, 'i');
    let i = lines.findIndex((l) => re.test(l));
    if (i < 0) return [];
    i++;
    const body: string[] = [];
    while (i < lines.length) {
      const line = lines[i]!;
      if (/^#{1,3}\s+/.test(line)) break;
      body.push(line);
      i++;
    }
    return body;
  };

  const shapeSection = sectionBody('shape').map((l) => l.trim()).find(Boolean);
  if (!out.shape && shapeSection) {
    const s = asShape(shapeSection);
    if (s) out.shape = s;
  }

  const intents = sectionBody('intents')
    .map((l) => l.replace(/^[-*]\s+/, '').trim())
    .filter((l) => l && l !== '(none)');
  if (intents.length) out.intents = intents;

  const ops: DesignDecision['operations'] = [];
  for (const line of sectionBody('operations')) {
    const t = line.replace(/^[-*]\s+/, '').trim();
    if (!t || t === '(none)') continue;
    const m = t.match(/^(\S+)(?::\s*(?:([A-Z]+)\s+)?(\/\S*)?)?$/);
    if (m) {
      ops.push({
        id: m[1]!,
        ...(m[2] ? { method: m[2] } : {}),
        ...(m[3] ? { path: m[3] } : {}),
      });
    } else {
      ops.push({ id: t });
    }
  }
  if (ops.length) out.operations = ops;

  const batchLine = sectionBody('batch').map((l) => l.trim()).find(Boolean);
  if (batchLine) out.batch = batchLine;

  const authLine = sectionBody('authSteps').map((l) => l.trim()).find(Boolean);
  if (authLine) out.authSteps = authLine;

  const privLine = sectionBody('privacyRequired').map((l) => l.trim().toLowerCase()).find(Boolean);
  if (privLine === 'yes' || privLine === 'true') out.privacyRequired = true;
  else if (privLine === 'no' || privLine === 'false') out.privacyRequired = false;

  const evidence = sectionBody('evidence')
    .map((l) => l.replace(/^[-*]\s+/, '').trim())
    .filter((l) => l && l !== '(none)');
  if (evidence.length) out.evidence = evidence;

  const oq = sectionBody('openQuestions')
    .map((l) => l.replace(/^[-*]\s+/, '').trim())
    .filter((l) => l && l !== '(none)');
  if (oq.length) out.openQuestions = oq;

  const rationaleLines = sectionBody('rationale').filter((l) => l.trim().length > 0);
  if (rationaleLines.length) out.rationale = rationaleLines.join('\n').trim();

  return out;
}

/**
 * Parse JSON design decision (object or JSON string).
 */
export function parseDesignDecisionJson(input: unknown): Partial<DesignDecision> {
  let obj: unknown = input;
  if (typeof input === 'string') {
    obj = JSON.parse(input) as unknown;
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
  const src = obj as Record<string, unknown>;
  const out: Partial<DesignDecision> = {};

  if (src.schemaVersion === 1) out.schemaVersion = 1;
  if (typeof src.vendor === 'string') out.vendor = src.vendor;
  if (typeof src.shape === 'string') {
    const s = asShape(src.shape);
    if (s) out.shape = s;
  }
  if (Array.isArray(src.intents)) {
    out.intents = src.intents.filter((x): x is string => typeof x === 'string');
  }
  if (Array.isArray(src.operations)) {
    out.operations = src.operations
      .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
      .map((o) => ({
        id: String(o.id ?? ''),
        ...(typeof o.method === 'string' ? { method: o.method } : {}),
        ...(typeof o.path === 'string' ? { path: o.path } : {}),
      }))
      .filter((o) => o.id.length > 0);
  }
  if (typeof src.batch === 'string') out.batch = src.batch;
  if (typeof src.authSteps === 'string') out.authSteps = src.authSteps;
  if (typeof src.privacyRequired === 'boolean') out.privacyRequired = src.privacyRequired;
  if (Array.isArray(src.evidence)) {
    out.evidence = src.evidence.filter((x): x is string => typeof x === 'string');
  }
  if (Array.isArray(src.openQuestions)) {
    out.openQuestions = src.openQuestions.filter((x): x is string => typeof x === 'string');
  }
  if (typeof src.rationale === 'string') out.rationale = src.rationale;
  if (typeof src.decidedAt === 'string') out.decidedAt = src.decidedAt;

  return out;
}

export interface WriteDesignDecisionOpts {
  projectDir: string;
  decision: DesignDecision;
  /** `'memory'` (default) → memory/runbooks/design-<vendor>.md; else absolute/relative path. */
  out?: string;
  /** Also write companion JSON next to the markdown (or when out ends with .json). */
  alsoJson?: boolean;
}

/**
 * Write design decision markdown (and optional JSON) under projectDir or custom out.
 * Returns absolute paths written.
 */
export function writeDesignDecision(opts: WriteDesignDecisionOpts): {
  mdPath: string;
  jsonPath?: string;
} {
  const d = opts.decision;
  if (!d.vendor?.trim()) {
    throw new Error('writeDesignDecision: decision.vendor is required');
  }
  if (!SHAPES.has(d.shape)) {
    throw new Error(`writeDesignDecision: invalid shape "${d.shape}"`);
  }

  const out = opts.out ?? 'memory';
  let mdPath: string;
  let jsonPath: string | undefined;

  if (out === 'memory') {
    mdPath = designDecisionPath(opts.projectDir, d.vendor);
    if (opts.alsoJson) {
      jsonPath = join(
        opts.projectDir,
        'memory',
        'runbooks',
        `design-${sanitizeVendor(d.vendor)}.json`,
      );
    }
  } else if (out.endsWith('.json')) {
    jsonPath = out;
    mdPath = out.replace(/\.json$/i, '.md');
  } else if (out.endsWith('.md')) {
    mdPath = out;
    if (opts.alsoJson) jsonPath = out.replace(/\.md$/i, '.json');
  } else {
    mdPath = out;
    if (opts.alsoJson) jsonPath = `${out}.json`;
  }

  mkdirSync(dirname(mdPath), { recursive: true });
  writeFileSync(mdPath, formatDesignDecisionMarkdown(d) + '\n', 'utf8');

  if (jsonPath) {
    mkdirSync(dirname(jsonPath), { recursive: true });
    writeFileSync(jsonPath, JSON.stringify(d, null, 2) + '\n', 'utf8');
  }

  return { mdPath, jsonPath };
}

/** Read design decision markdown from projectDir if present. */
export function loadDesignDecision(
  projectDir: string,
  vendor: string,
): Partial<DesignDecision> | null {
  const path = designDecisionPath(projectDir, vendor);
  if (!existsSync(path)) return null;
  return parseDesignDecisionMarkdown(readFileSync(path, 'utf8'));
}

function sanitizeVendor(vendor: string): string {
  return vendor
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'vendor';
}
