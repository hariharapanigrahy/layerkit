/**
 * Vendor research-plan harness — fully data-driven from the vendor catalog.
 *
 * Do NOT hand-author per-vendor case objects here.
 * Add vendors in libs/domain/commerce.ts (VENDOR_SLOTS); cases regenerate.
 *
 * Usage:
 *   node dist/evals/vendor-research-plan/run.js
 *   node dist/evals/vendor-research-plan/run.js --vendor meta
 *   node dist/evals/vendor-research-plan/run.js --limit 5
 *   node dist/evals/vendor-research-plan/run.js --json
 *   node dist/evals/vendor-research-plan/run.js --write-dir ./out/cases
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VENDOR_SLOTS } from '../../libs/domain/commerce.js';
import { generatePlanCases, type PlanCase } from './generate-cases.js';

function parseArgs(argv: string[]): {
  vendor?: string;
  limit?: number;
  json: boolean;
  writeDir?: string;
  quiet: boolean;
} {
  let vendor: string | undefined;
  let limit: number | undefined;
  let json = false;
  let writeDir: string | undefined;
  let quiet = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--vendor') vendor = argv[++i];
    else if (a.startsWith('--vendor=')) vendor = a.slice('--vendor='.length);
    else if (a === '--limit') limit = Number(argv[++i]);
    else if (a.startsWith('--limit=')) limit = Number(a.slice('--limit='.length));
    else if (a === '--json') json = true;
    else if (a === '--write-dir') writeDir = argv[++i];
    else if (a.startsWith('--write-dir=')) writeDir = a.slice('--write-dir='.length);
    else if (a === '--quiet') quiet = true;
    else if (a === '-h' || a === '--help') {
      console.log(`Usage: vendor-research-plan [--vendor id] [--limit n] [--json] [--write-dir dir]`);
      process.exit(0);
    }
  }
  return { vendor, limit, json, writeDir, quiet };
}

function assertScalable(cases: PlanCase[]): void {
  if (!cases.length) {
    throw new Error('No plan cases generated — check vendor filter or empty catalog');
  }
  // Without --vendor/--limit, harness must cover entire catalog
  const full = generatePlanCases();
  if (full.length !== VENDOR_SLOTS.length) {
    throw new Error(
      `Plan case count (${full.length}) !== VENDOR_SLOTS (${VENDOR_SLOTS.length}). ` +
        'Cases must be derived from the catalog, not a hardcoded list.',
    );
  }
  for (const slot of VENDOR_SLOTS) {
    if (!full.some((c) => c.vendor === slot.vendor)) {
      throw new Error(`Missing plan case for catalog vendor "${slot.vendor}"`);
    }
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const cases = generatePlanCases({
    vendor: args.vendor,
    limit: args.limit,
  });

  // Always validate full catalog mapping (scalability invariant)
  assertScalable(cases.length === VENDOR_SLOTS.length ? cases : generatePlanCases());

  if (args.writeDir) {
    mkdirSync(args.writeDir, { recursive: true });
    const index: Array<{ id: string; vendor: string; path: string }> = [];
    for (const c of cases) {
      const path = join(args.writeDir, `${c.id}.json`);
      writeFileSync(path, JSON.stringify(c, null, 2) + '\n', 'utf8');
      index.push({ id: c.id, vendor: c.vendor, path });
    }
    writeFileSync(
      join(args.writeDir, 'index.json'),
      JSON.stringify(
        {
          generatedFrom: 'VENDOR_SLOTS + COMMERCE_DOMAIN',
          count: cases.length,
          cases: index,
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );
    if (!args.quiet) {
      console.log(`Wrote ${cases.length} case files → ${args.writeDir}`);
    }
  }

  if (args.json) {
    console.log(JSON.stringify(cases, null, 2));
    return;
  }

  if (args.quiet) return;

  console.log('vendor-research-plan (data-driven from VENDOR_SLOTS)');
  console.log(`Catalog size: ${VENDOR_SLOTS.length} | Cases this run: ${cases.length}`);
  console.log('');
  for (const c of cases) {
    console.log(`- ${c.id}  (${c.displayName})`);
    console.log(`  cite hosts: ${c.mustCiteHosts.join(', ') || '(none)'}`);
    console.log(`  docs: ${c.documentationUrls.length}`);
  }
  console.log('');
  console.log('Universal judge (all vendors):');
  for (const [i, rule] of (cases[0]?.judge ?? []).entries()) {
    console.log(`  ${i + 1}. ${rule}`);
  }
  console.log('');
  console.log('Scale rule: add a slot to libs/domain/commerce.ts VENDOR_SLOTS — no case table edits.');
  console.log('Agent prompt sample (first case, truncated):');
  const sample = cases[0]?.prompt ?? '';
  console.log(sample.split('\n').slice(0, 12).join('\n') + '\n…');
}

main();
