/**
 * Agent research-plan harness — fixture scenarios only (not a product catalog).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generatePlanCases } from './generate-cases.js';

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
    else if (a?.startsWith('--vendor=')) vendor = a.slice('--vendor='.length);
    else if (a === '--limit') limit = Number(argv[++i]);
    else if (a?.startsWith('--limit=')) limit = Number(a.slice('--limit='.length));
    else if (a === '--json') json = true;
    else if (a === '--write-dir') writeDir = argv[++i];
    else if (a?.startsWith('--write-dir=')) writeDir = a.slice('--write-dir='.length);
    else if (a === '--quiet') quiet = true;
    else if (a === '-h' || a === '--help') {
      console.log(`Usage: vendor-research-plan [--vendor id] [--limit n] [--json] [--write-dir dir]`);
      process.exit(0);
    }
  }
  return { vendor, limit, json, writeDir, quiet };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const cases = generatePlanCases({
    vendor: args.vendor,
    limit: args.limit,
  });

  if (!cases.length) {
    throw new Error('No plan cases — check evals/fixtures/agent/research-scenarios.json');
  }

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
          generatedFrom: 'evals/fixtures/agent/research-scenarios.json (not a vendor catalog)',
          count: cases.length,
          cases: index,
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );
    if (!args.quiet) console.log(`Wrote ${cases.length} cases → ${args.writeDir}`);
  }

  if (args.json) {
    console.log(JSON.stringify(cases, null, 2));
    return;
  }

  if (!args.quiet) {
    console.log('agent-research-plan (fixture scenarios only — not a product catalog)');
    console.log(`Cases this run: ${cases.length}`);
    for (const c of cases) {
      console.log(`- ${c.vendor}: ${c.documentationUrls[0] ?? '(no docs)'}`);
    }
  }
}

main();
