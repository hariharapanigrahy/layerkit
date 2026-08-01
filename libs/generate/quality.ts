/**
 * Quality hooks for generated Java clients.
 * Checks JaCoCo report presence and line coverage floor (0.95).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Minimum line coverage required before promote / doctor --quality --strict. */
export const JACOCO_MIN_LINE_COVERAGE = 0.95;

export interface JacocoReportSummary {
  /** Absolute path to the report file found (xml preferred). */
  path: string;
  /** Line coverage ratio 0..1 when parseable; undefined if only presence checked. */
  lineRate?: number;
  format: 'xml' | 'csv' | 'html-index';
}

export interface QualityCheckOptions {
  /** Roots to search for JaCoCo reports (moduleRoot, qualityRoots, repo). */
  searchRoots: string[];
  /** Require report file to exist (doctor --quality --strict / promote). */
  strict?: boolean;
  /** Minimum line rate when report is parseable (default 0.95). */
  minLineCoverage?: number;
}

export interface QualityCheckResult {
  ok: boolean;
  lines: string[];
  report?: JacocoReportSummary;
  /** True when report is missing (strict mode fails on this). */
  reportMissing: boolean;
  /** True when coverage is below floor. */
  coverageBelowFloor: boolean;
}

const REPORT_CANDIDATES = [
  'target/site/jacoco/jacoco.xml',
  'target/site/jacoco/jacoco.csv',
  'target/site/jacoco/index.html',
  'site/jacoco/jacoco.xml',
  'site/jacoco/jacoco.csv',
  'jacoco.xml',
  'jacoco.csv',
] as const;

function isDir(p: string): boolean {
  try {
    return existsSync(p) && statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Walk search roots (non-recursive deep scan limited to common Maven layouts)
 * and return the first usable JaCoCo report.
 */
export function findJacocoReport(searchRoots: string[]): JacocoReportSummary | null {
  for (const root of searchRoots) {
    if (!root || !isDir(root)) continue;
    for (const rel of REPORT_CANDIDATES) {
      const p = join(root, rel);
      if (!existsSync(p)) continue;
      if (rel.endsWith('.xml')) {
        return { path: p, format: 'xml', lineRate: parseJacocoXmlLineRate(p) };
      }
      if (rel.endsWith('.csv')) {
        return { path: p, format: 'csv', lineRate: parseJacocoCsvLineRate(p) };
      }
      return { path: p, format: 'html-index' };
    }
    // Shallow scan: one level of child dirs (e.g. multi-module)
    try {
      for (const ent of readdirSync(root, { withFileTypes: true })) {
        if (!ent.isDirectory()) continue;
        const child = join(root, ent.name);
        for (const rel of REPORT_CANDIDATES) {
          const p = join(child, rel);
          if (!existsSync(p)) continue;
          if (rel.endsWith('.xml')) {
            return { path: p, format: 'xml', lineRate: parseJacocoXmlLineRate(p) };
          }
          if (rel.endsWith('.csv')) {
            return { path: p, format: 'csv', lineRate: parseJacocoCsvLineRate(p) };
          }
          return { path: p, format: 'html-index' };
        }
      }
    } catch {
      // ignore unreadable dirs
    }
  }
  return null;
}

/** Parse counter type="LINE" missed/covered from JaCoCo XML report. */
export function parseJacocoXmlLineRate(filePath: string): number | undefined {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return undefined;
  }
  // Prefer report-level counter (last LINE counter on <report> is common; also match first)
  // JaCoCo: <counter type="LINE" missed="N" covered="M"/>
  const re = /<counter\s+type="LINE"\s+missed="(\d+)"\s+covered="(\d+)"\s*\/>/g;
  let match: RegExpExecArray | null;
  let last: { missed: number; covered: number } | undefined;
  while ((match = re.exec(raw)) !== null) {
    last = { missed: Number(match[1]), covered: Number(match[2]) };
  }
  if (!last) return undefined;
  const total = last.missed + last.covered;
  if (total <= 0) return 1;
  return last.covered / total;
}

/** Parse LINE row from jacoco.csv (GROUP,PACKAGE,CLASS,INSTRUCTION_*,BRANCH_*,LINE_MISSED,LINE_COVERED,...). */
export function parseJacocoCsvLineRate(filePath: string): number | undefined {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return undefined;
  }
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return undefined;
  const header = lines[0]!.split(',');
  const missedIdx = header.indexOf('LINE_MISSED');
  const coveredIdx = header.indexOf('LINE_COVERED');
  if (missedIdx < 0 || coveredIdx < 0) return undefined;
  let missed = 0;
  let covered = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(',');
    missed += Number(cols[missedIdx] ?? 0) || 0;
    covered += Number(cols[coveredIdx] ?? 0) || 0;
  }
  const total = missed + covered;
  if (total <= 0) return 1;
  return covered / total;
}

/**
 * True when any search root looks like a generated/checked-out Java module
 * (pom.xml or src/main/java). Used so promote does not require JaCoCo for Node-only projects.
 */
export function hasJavaProjectSignal(searchRoots: string[]): boolean {
  for (const root of searchRoots) {
    if (!root || !isDir(root)) continue;
    if (existsSync(join(root, 'pom.xml'))) return true;
    if (isDir(join(root, 'src', 'main', 'java'))) return true;
    try {
      for (const ent of readdirSync(root, { withFileTypes: true })) {
        if (!ent.isDirectory()) continue;
        const child = join(root, ent.name);
        if (existsSync(join(child, 'pom.xml'))) return true;
        if (isDir(join(child, 'src', 'main', 'java'))) return true;
      }
    } catch {
      // ignore
    }
  }
  return false;
}

/**
 * Run quality check for Java client generation / promote gate.
 */
export function checkJavaQuality(opts: QualityCheckOptions): QualityCheckResult {
  const min = opts.minLineCoverage ?? JACOCO_MIN_LINE_COVERAGE;
  const strict = opts.strict === true;
  const lines: string[] = [];
  const report = findJacocoReport(opts.searchRoots);

  if (!report) {
    lines.push('JaCoCo report: missing');
    lines.push(
      `  Searched: ${opts.searchRoots.filter(Boolean).join(', ') || '(none)'}`,
    );
    lines.push(
      '  Expected: target/site/jacoco/jacoco.xml (run mvn test under generated Java module)',
    );
    if (strict) {
      lines.push(`Quality FAIL: report required under --strict (min line coverage ${min})`);
      return { ok: false, lines, reportMissing: true, coverageBelowFloor: false };
    }
    lines.push('Quality WARN: no JaCoCo report (pass without --strict)');
    return { ok: true, lines, reportMissing: true, coverageBelowFloor: false };
  }

  lines.push(`JaCoCo report: ${report.path} (${report.format})`);
  if (report.lineRate === undefined) {
    lines.push('  Line coverage: unparseable (presence only)');
    if (strict && report.format === 'html-index') {
      lines.push('Quality FAIL: --strict requires jacoco.xml or jacoco.csv with LINE counters');
      return {
        ok: false,
        lines,
        report,
        reportMissing: false,
        coverageBelowFloor: false,
      };
    }
    lines.push(`Quality OK: report present (floor ${min} enforced when LINE rate parseable)`);
    return { ok: true, lines, report, reportMissing: false, coverageBelowFloor: false };
  }

  const pct = (report.lineRate * 100).toFixed(1);
  const floorPct = (min * 100).toFixed(0);
  lines.push(`  Line coverage: ${pct}% (minimum ${floorPct}%)`);
  if (report.lineRate + 1e-9 < min) {
    lines.push(`Quality FAIL: coverage ${pct}% < ${floorPct}%`);
    return {
      ok: false,
      lines,
      report,
      reportMissing: false,
      coverageBelowFloor: true,
    };
  }
  lines.push('Quality OK');
  return {
    ok: true,
    lines,
    report,
    reportMissing: false,
    coverageBelowFloor: false,
  };
}

/**
 * Default search roots for JaCoCo / Java quality.
/** Search moduleRoot, qualityRoots, then project/repo roots. */
export function defaultJacocoSearchRoots(
  projectDir: string,
  repoRoot?: string,
  generate?: {
    moduleRoot?: string;
    qualityRoots?: string[];
  },
): string[] {
  const roots: string[] = [];

  const base = repoRoot ?? projectDir;
  if (generate?.moduleRoot?.trim()) {
    const mod = isAbsolutePath(generate.moduleRoot)
      ? generate.moduleRoot.trim()
      : join(base, generate.moduleRoot.trim());
    roots.push(mod, join(mod, 'target'));
  }
  for (const q of generate?.qualityRoots ?? []) {
    if (!q?.trim()) continue;
    roots.push(isAbsolutePath(q) ? q.trim() : join(base, q.trim()));
  }

  roots.push(projectDir);
  if (repoRoot) roots.push(repoRoot);

  // de-dupe preserving order
  const seen = new Set<string>();
  return roots.filter((r) => {
    if (!r || seen.has(r)) return false;
    seen.add(r);
    return true;
  });
}

function isAbsolutePath(p: string): boolean {
  return p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p);
}
