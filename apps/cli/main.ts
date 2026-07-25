#!/usr/bin/env node
/**
 * Layerkit CLI — multi-vendor data-layer command surface for agent platforms.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  detectPathMismatch,
  evaluateDryRunWire,
  extractPathFromDocExcerpt,
  formatNextStepLine,
  formatPipelineStatus,
  getNextStep,
  INTEGRATION_PIPELINE,
  isPipelineStepId,
  isScannableRoot,
  loadCompletedSteps,
  markStepDone,
  pathFixFromDoc,
  pipelineStatusPath,
  PIPELINE_STATUS_REL,
  runSequentialMapFixes,
  scanAndWriteStyleProfile,
  type MapPathFixPatch,
  type WireExpectation,
} from '../../libs/agent/index.js';
import { ensureLayerkitConfig, layerkitConfigPath } from '../../libs/config/layerkit-config.js';
import { resolveProjectDir } from '../../libs/config/project-dir.js';
import { generateJavaScaffold } from '../../libs/generate/java-scaffold.js';
import {
  checkJavaQuality,
  defaultJacocoSearchRoots,
  JACOCO_MIN_LINE_COVERAGE,
} from '../../libs/generate/quality.js';
import { layerkitHookGuidance } from '../../libs/hooks/guidance.js';
import { installLayerkit } from '../../libs/install/install.js';
import {
  installPlatformUsage,
  isInstallPlatform,
  platformDisplayName,
  type InstallPlatform,
} from '../../libs/install/paths.js';
import type { Identity, Proposal, VendorMap } from '../../libs/domain/types.js';
import {
  createMemoryStack,
  type MemoryEntryType,
} from '../../libs/memory/index.js';
import { applyVendorMap } from '../../libs/vendor-memory/map-engine.js';
import {
  deepenFromHubMarkdown,
  fillAnswerSheetFromEvidence,
  hasInventedEndpoint,
  parseCurl,
  parseOpenAPI,
  residualGaps,
  type ResearchSeed,
} from '../../libs/research/index.js';
import {
  createVendorMemoryStore,
  type CheckerRole,
  type VendorMemoryStore,
} from '../../libs/vendor-memory/store.js';

const MEMORY_TYPES: readonly MemoryEntryType[] = [
  'questionnaire',
  'research',
  'proposals',
  'dry-runs',
  'privacy',
  'approvals',
  'runbooks',
  'other',
];

interface CliCommand {
  path: readonly string[];
  usage: string;
  handler: (args: string[], ctx: CliContext) => void | Promise<void>;
  showInTopLevelHelp?: boolean;
}

interface CliContext {
  repoRoot: string;
  /** Raw --project-dir flag value if present */
  projectDirFlag?: string;
  /** Resolved absolute store root */
  projectDir: string;
}

function detectRepoRoot(): string {
  return process.cwd();
}

/** Strip global flags (--project-dir) from argv; returns remaining args + flag values. */
export function extractGlobalFlags(argv: string[]): {
  rest: string[];
  projectDir?: string;
} {
  const rest: string[] = [];
  let projectDir: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--project-dir') {
      const v = argv[++i];
      if (!v) throw new Error('--project-dir requires a path');
      projectDir = v;
      continue;
    }
    if (a.startsWith('--project-dir=')) {
      projectDir = a.slice('--project-dir='.length);
      if (!projectDir) throw new Error('--project-dir requires a path');
      continue;
    }
    rest.push(a);
  }
  return { rest, projectDir };
}

function openStore(ctx: CliContext): VendorMemoryStore {
  return createVendorMemoryStore(ctx.repoRoot, ctx.projectDir);
}

const cliCommands: CliCommand[] = [
  {
    path: ['install'],
    usage: `install --platform ${installPlatformUsage} [--hooks enabled|disabled] [--auto-map-updates enabled|disabled] [--poc] [--name <name>] [--project-dir <path>]`,
    handler: runInstall,
    showInTopLevelHelp: true,
  },
  {
    path: ['doctor'],
    usage: 'doctor [--quality] [--strict] [--project-dir <path>]',
    handler: runDoctor,
    showInTopLevelHelp: true,
  },
  {
    path: ['promote'],
    usage: 'promote [--vendor <id>] [--strict] [--project-dir <path>]',
    handler: runPromote,
    showInTopLevelHelp: true,
  },
  {
    path: ['config'],
    usage: 'config',
    handler: runConfig,
    showInTopLevelHelp: true,
  },
  {
    path: ['agent', 'status'],
    usage: 'agent status [--project-dir <path>]',
    handler: runAgentStatus,
    showInTopLevelHelp: true,
  },
  {
    path: ['agent', 'next'],
    usage: 'agent next [--project-dir <path>]',
    handler: runAgentNext,
    showInTopLevelHelp: true,
  },
  {
    path: ['agent', 'mark-done'],
    usage: 'agent mark-done --step <id> [--project-dir <path>]',
    handler: runAgentMarkDone,
    showInTopLevelHelp: true,
  },
  {
    path: ['research', 'openapi'],
    usage: 'research openapi <file> [--json]',
    handler: runResearchOpenapi,
    showInTopLevelHelp: true,
  },
  {
    path: ['research', 'curl'],
    usage: 'research curl <file-or-inline> [--json]',
    handler: runResearchCurl,
    showInTopLevelHelp: true,
  },
  {
    path: ['research', 'deepen'],
    usage: 'research deepen <hub.md> [--json]',
    handler: runResearchDeepen,
    showInTopLevelHelp: true,
  },
  {
    path: ['research', 'fill'],
    usage:
      'research fill [--openapi <file>]... [--curl <file>]... [--hub <file>]... [--vendor <id>] [--out <sheet.json>] [--json]',
    handler: runResearchFill,
    showInTopLevelHelp: true,
  },
  {
    path: ['research', 'gaps'],
    usage: 'research gaps <sheet.json> [--json]',
    handler: runResearchGaps,
    showInTopLevelHelp: true,
  },
  {
    path: ['style-profile', 'scan'],
    usage: 'style-profile scan [--root <dir>] [--out memory|path] [--project-dir <path>]',
    handler: runStyleProfileScan,
    showInTopLevelHelp: true,
  },
  {
    path: ['fix', 'dry-run'],
    usage:
      'fix dry-run --map <map.json> --patches <patches.json> [--expect-event <name>] [--require-field <path>]... [--forbid-field <path>]... [--out <fixed-map.json>] [--json]',
    handler: runFixDryRun,
    showInTopLevelHelp: true,
  },
  {
    path: ['fix', 'suggest'],
    usage: 'fix suggest --map <map.json> --doc <file.md> [--json]',
    handler: runFixSuggest,
    showInTopLevelHelp: true,
  },

  {
    path: ['repo', 'status'],
    usage: 'repo status [--project-dir <path>]',
    handler: runRepoStatus,
    showInTopLevelHelp: true,
  },
  {
    path: ['map', 'list'],
    usage: 'map list [--project-dir <path>]',
    handler: (_args, ctx) => {
      const store = openStore(ctx);
      for (const m of store.listMaps()) {
        console.log(`${m.vendor}\t${m.status ?? '?'}\t${m.displayName}`);
      }
    },
    showInTopLevelHelp: true,
  },
  {
    path: ['map', 'show'],
    usage: 'map show <vendor> [--project-dir <path>]',
    handler: (args, ctx) => {
      const vendor = args[0];
      if (!vendor) throw new Error('Usage: layerkit map show <vendor>');
      console.log(join(ctx.projectDir, 'maps', `${vendor}.json`));
    },
    showInTopLevelHelp: true,
  },
  {
    path: ['map', 'validate'],
    usage: 'map validate [vendor] [--project-dir <path>]',
    handler: (args, ctx) => {
      const store = openStore(ctx);
      const maps = args[0] ? [store.loadMap(args[0])].filter(Boolean) : store.listMaps();
      for (const m of maps) {
        if (!m) continue;
        const isV2 = m.schemaVersion === 2;
        // Structural-only review: v2 uses draft so maker is not required
        const review = store.reviewProposal({
          schemaVersion: isV2 ? 2 : 1,
          kind: 'vendor_map',
          id: `validate-${m.vendor}`,
          summary: 'validate',
          payload: m,
          sources: m.documentation,
          authoredBy: 'human',
          createdAt: new Date().toISOString(),
          status: isV2 ? 'draft' : 'pending',
        });
        console.log(`== ${m.vendor} ==`);
        if (review.valid) console.log('  OK (structural)');
        for (const e of review.errors) console.log(`  error: ${e}`);
        for (const w of review.warnings) console.log(`  warn: ${w}`);
      }
    },
    showInTopLevelHelp: true,
  },
  {
    path: ['map', 'migrate'],
    usage: 'map migrate [vendor] [--project-dir <path>]',
    handler: (args, ctx) => {
      const store = openStore(ctx);
      const vendor = args[0];
      const { migrated, skipped } = store.migrateMaps(vendor);
      if (migrated.length === 0 && skipped.length === 0) {
        console.log('No maps to migrate.');
        return;
      }
      for (const v of migrated) console.log(`Migrated ${v} → schemaVersion 2`);
      for (const v of skipped) console.log(`Skipped ${v} (already v2)`);
      console.log(`Done: ${migrated.length} migrated, ${skipped.length} skipped.`);
    },
    showInTopLevelHelp: true,
  },
  {
    path: ['memory', 'list'],
    usage: 'memory list [--vendor <v>] [--type questionnaire|research|...] [--project-dir <path>]',
    handler: (args, ctx) => {
      const mem = createMemoryStack(ctx.projectDir);
      const vendor = flag(args, '--vendor');
      const typeRaw = flag(args, '--type');
      let type: MemoryEntryType | undefined;
      if (typeRaw) {
        if (!MEMORY_TYPES.includes(typeRaw as MemoryEntryType)) {
          throw new Error(`Invalid --type. Use: ${MEMORY_TYPES.join('|')}`);
        }
        type = typeRaw as MemoryEntryType;
      }
      const entries = mem.list({ vendor, type });
      if (!entries.length) {
        console.log('(no memory entries)');
        return;
      }
      for (const e of entries) {
        console.log(`${e.type}\t${e.vendor ?? '-'}\t${e.relativePath}\t${e.title}`);
      }
    },
    showInTopLevelHelp: true,
  },
  {
    path: ['memory', 'show'],
    usage: 'memory show <path-or-id> [--project-dir <path>]',
    handler: (args, ctx) => {
      const id = requireArg(args[0], 'memory show <path-or-id>');
      const mem = createMemoryStack(ctx.projectDir);
      console.log(mem.show(id));
    },
    showInTopLevelHelp: true,
  },
  {
    path: ['memory', 'append'],
    usage:
      'memory append --type <type> --title <title> [--vendor <v>] [--body <text>|--body-file <file>] [--project-dir <path>]',
    handler: (args, ctx) => {
      const typeRaw = flag(args, '--type');
      const title = flag(args, '--title');
      const vendor = flag(args, '--vendor');
      const bodyFlag = flag(args, '--body');
      const bodyFile = flag(args, '--body-file');
      if (!typeRaw || !MEMORY_TYPES.includes(typeRaw as MemoryEntryType)) {
        throw new Error(
          `Usage: layerkit memory append --type <${MEMORY_TYPES.join('|')}> --title <title> [--body|--body-file]`,
        );
      }
      if (!title) throw new Error('memory append requires --title');
      let body = bodyFlag ?? '';
      if (bodyFile) body = readFileSync(resolve(bodyFile), 'utf8');
      if (!body) throw new Error('memory append requires --body or --body-file');
      const mem = createMemoryStack(ctx.projectDir);
      const path = mem.append({ type: typeRaw as MemoryEntryType, title, body, vendor });
      console.log(`Appended memory note → ${path}`);
    },
    showInTopLevelHelp: true,
  },
  {
    path: ['memory', 'index'],
    usage: 'memory index [--project-dir <path>]',
    handler: (_args, ctx) => {
      const mem = createMemoryStack(ctx.projectDir);
      console.log(`Rebuilt INDEX → ${mem.index()}`);
    },
    showInTopLevelHelp: true,
  },
  {
    path: ['proposal', 'submit'],
    usage: 'proposal submit <file> [--by <actorId>] [--project-dir <path>]',
    handler: (args, ctx) => {
      const file = requireArg(args[0], 'proposal submit <file>');
      const proposal = readProposal(file);
      const store = openStore(ctx);
      const by = flag(args, '--by');
      const maker: Identity | undefined = by
        ? { type: 'user', id: by }
        : proposal.maker ?? { type: 'agent', id: 'cli' };
      const submitted = store.submitProposal(proposal, maker);
      console.log(`Submitted proposal ${submitted.id} (status=${submitted.status})`);
      console.log(`Saved: ${join(store.projectDir, 'proposals', `${submitted.id}.json`)}`);
    },
    showInTopLevelHelp: true,
  },
  {
    path: ['proposal', 'validate'],
    usage: 'proposal validate <file|id> [--project-dir <path>]',
    handler: (args, ctx) => {
      const ref = requireArg(args[0], 'proposal validate <file|id>');
      const store = openStore(ctx);
      const proposal = loadProposalRef(store, ref);
      const result = store.reviewProposal(proposal);
      if (result.valid) {
        proposal.status = 'validated';
        store.saveProposal(proposal);
        console.log('Proposal is valid.');
        for (const w of result.warnings) console.log(`Warning: ${w}`);
        return;
      }
      console.log('Proposal is invalid:');
      for (const e of result.errors) console.log(`- ${e}`);
      process.exitCode = 1;
    },
    showInTopLevelHelp: true,
  },
  {
    path: ['proposal', 'approve'],
    usage:
      'proposal approve <id> --by <actorId> [--role checker|privacy_reviewer|admin] [--comment <text>] [--dev] [--project-dir <path>]',
    handler: (args, ctx) => {
      const id = requireArg(args[0], 'proposal approve <id> --by <actorId>');
      const byId = flag(args, '--by');
      if (!byId) throw new Error('Usage: layerkit proposal approve <id> --by <actorId>');
      const role = (flag(args, '--role') ?? 'checker') as CheckerRole;
      if (!['checker', 'privacy_reviewer', 'admin'].includes(role)) {
        throw new Error('--role must be checker|privacy_reviewer|admin');
      }
      const store = openStore(ctx);
      const next = store.approveProposal(id, {
        by: { type: 'user', id: byId },
        role,
        comment: flag(args, '--comment'),
        dev: args.includes('--dev'),
      });
      console.log(`Approved proposal ${next.id} → status=${next.status}`);
      console.log(`Checks: ${(next.checks ?? []).length}`);
    },
    showInTopLevelHelp: true,
  },
  {
    path: ['proposal', 'reject'],
    usage:
      'proposal reject <id> --by <actorId> [--role checker|privacy_reviewer|admin] [--comment <text>] [--project-dir <path>]',
    handler: (args, ctx) => {
      const id = requireArg(args[0], 'proposal reject <id> --by <actorId>');
      const byId = flag(args, '--by');
      if (!byId) throw new Error('Usage: layerkit proposal reject <id> --by <actorId>');
      const role = (flag(args, '--role') ?? 'checker') as CheckerRole;
      if (!['checker', 'privacy_reviewer', 'admin'].includes(role)) {
        throw new Error('--role must be checker|privacy_reviewer|admin');
      }
      const store = openStore(ctx);
      const next = store.rejectProposal(id, {
        by: { type: 'user', id: byId },
        role,
        comment: flag(args, '--comment'),
      });
      console.log(`Rejected proposal ${next.id} (status=${next.status})`);
    },
    showInTopLevelHelp: true,
  },
  {
    path: ['proposal', 'list'],
    usage: 'proposal list [--project-dir <path>]',
    handler: (_args, ctx) => {
      const store = openStore(ctx);
      const list = store.listProposals();
      if (!list.length) {
        console.log('(no proposals)');
        return;
      }
      for (const p of list) {
        console.log(`${p.id}\t${p.status}\t${p.kind}\t${p.summary}`);
      }
    },
    showInTopLevelHelp: true,
  },
  {
    path: ['proposal', 'apply'],
    usage: 'proposal apply <file|id> [--project-dir <path>]',
    handler: (args, ctx) => {
      const ref = requireArg(args[0], 'proposal apply <file|id>');
      const store = openStore(ctx);
      const proposal = loadProposalRef(store, ref);
      const applied = store.applyProposal(proposal);
      console.log('Applied proposal to vendor memory.');
      console.log(`Kind: ${applied.kind}`);
      console.log(`Target: ${applied.target}`);
    },
    showInTopLevelHelp: true,
  },
  {
    path: ['process', 'dry-run'],
    usage: 'process dry-run --vendor <v> --intent <i> [--project-dir <path>]',
    handler: (args, ctx) => {
      const vendor = flag(args, '--vendor');
      const intent = flag(args, '--intent') ?? 'purchase';
      if (!vendor) throw new Error('Usage: layerkit process dry-run --vendor <v> --intent <i>');
      const store = openStore(ctx);
      const map = store.loadMap(vendor);
      if (!map) throw new Error(`No map for ${vendor}`);
      const result = applyVendorMap(
        {
          intent,
          eventId: 'evt_1',
          user: { email: 'Ada@Example.com' },
          value: { amount: 10, currency: 'usd' },
        },
        map,
        { processorsDir: join(store.projectDir, 'processors') },
      );
      console.log(JSON.stringify(result, null, 2));
    },
    showInTopLevelHelp: true,
  },
  {
    path: ['generate'],
    usage: 'generate --lang java [--out <dir>] [--project-dir <path>]',
    handler: (args, ctx) => {
      const lang = flag(args, '--lang') ?? 'java';
      if (lang !== 'java') {
        throw new Error('Only --lang java is supported in v0.1 (enterprise first).');
      }
      const store = openStore(ctx);
      const project = store.loadProject();
      const domain = store.loadDomain();
      if (!project || !domain) throw new Error('No project — run layerkit install --poc');
      const maps = store.listMaps();
      const out = flag(args, '--out') ?? join(store.projectDir, 'out', 'java');
      const files = generateJavaScaffold({ project, domain, maps });
      for (const f of files) {
        const p = join(out, f.path);
        mkdirSync(join(p, '..'), { recursive: true });
        writeFileSync(p, f.content, 'utf8');
      }
      console.log(`Scaffolded ${files.length} files → ${out}`);
      console.log('Includes: Facade, Strategy, PrivacyGate, DeliveryClient, JaCoCo 0.95 pom, DESIGN_PATTERNS.md');
      console.log('Next: skill layerkit-generate-java; then mvn test && layerkit doctor --quality --strict');
    },
    showInTopLevelHelp: true,
  },
  {
    path: ['hook', 'ingest'],
    usage: `hook ingest --platform ${installPlatformUsage}`,
    handler: (args) => {
      if (process.env.LAYERKIT_HOOK_DISABLE === '1') return;
      const platform = flag(args, '--platform');
      if (!platform || !isInstallPlatform(platform)) {
        throw new Error(`Usage: layerkit hook ingest --platform ${installPlatformUsage}`);
      }
      // Agent hook guidance injection payload
      if (platform === 'openhands' || platform === 'copilot') {
        console.log(JSON.stringify({ additionalContext: layerkitHookGuidance }));
      } else {
        console.log(
          JSON.stringify({
            hookSpecificOutput: {
              hookEventName: 'UserPromptSubmit',
              additionalContext: layerkitHookGuidance,
            },
          }),
        );
      }
    },
  },
  {
    path: ['hook', 'worker'],
    usage: 'hook worker',
    handler: () => {
      console.log('layerkit hook worker: no queued map-update jobs (agent-driven).');
    },
  },
];

async function runInstall(args: string[], ctx: CliContext): Promise<void> {
  const options = parseInstallArgs(args);
  const result = await installLayerkit({
    repoRoot: ctx.repoRoot,
    ...options,
    projectDir: ctx.projectDir,
  });
  printInstallResult(result);
}

function parseInstallArgs(args: string[]): {
  platform: InstallPlatform;
  hooksEnabled: boolean;
  autoMapUpdates: boolean;
  poc: boolean;
  name?: string;
} {
  let platform: InstallPlatform | undefined;
  let hooks: boolean | undefined;
  let autoMap: boolean | undefined;
  let poc = true;
  let name: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--platform') {
      const v = args[++i];
      if (!v || !isInstallPlatform(v)) throw new Error(`Invalid platform. Use: ${installPlatformUsage}`);
      platform = v;
      continue;
    }
    if (arg.startsWith('--platform=')) {
      const v = arg.slice('--platform='.length);
      if (!isInstallPlatform(v)) throw new Error(`Invalid platform. Use: ${installPlatformUsage}`);
      platform = v;
      continue;
    }
    if (arg === '--hooks') {
      hooks = parseEnabled(args[++i]);
      continue;
    }
    if (arg.startsWith('--hooks=')) {
      hooks = parseEnabled(arg.slice('--hooks='.length));
      continue;
    }
    if (arg === '--auto-map-updates') {
      autoMap = parseEnabled(args[++i]);
      continue;
    }
    if (arg.startsWith('--auto-map-updates=')) {
      autoMap = parseEnabled(arg.slice('--auto-map-updates='.length));
      continue;
    }
    if (arg === '--poc') {
      poc = true;
      continue;
    }
    if (arg === '--no-poc') {
      poc = false;
      continue;
    }
    if (arg === '--name') {
      name = args[++i];
      continue;
    }
    throw new Error(`Unknown install flag: ${arg}`);
  }

  if (!platform) {
    throw new Error(`--platform is required (${installPlatformUsage})`);
  }
  const hooksEnabled = hooks ?? true;
  const autoMapUpdates = hooksEnabled ? (autoMap ?? true) : false;
  return { platform, hooksEnabled, autoMapUpdates, poc, name };
}

function parseEnabled(v: string | undefined): boolean {
  if (v === 'enabled') return true;
  if (v === 'disabled') return false;
  throw new Error('Expected enabled|disabled');
}

function printInstallResult(result: Awaited<ReturnType<typeof installLayerkit>>): void {
  console.log(`Installed Layerkit for ${result.platformLabel}.`);
  console.log(`Skills: ${result.skillCount} packaged; paths written: ${result.skills.length}`);
  if (result.hooks) {
    console.log(`Hooks: installed for ${result.hooks.events.join(', ')}.`);
  } else if (result.hooksRequested) {
    console.log('Hooks: requested but not installed for this platform.');
  } else {
    console.log('Hooks: not installed.');
  }
  if (result.rules) {
    console.log(`Project rules: ${result.rules.configFiles.join(', ')}`);
  }
  console.log(`Automatic map-update reminders: ${result.autoMapUpdates ? 'enabled' : 'disabled'}.`);
  console.log(`Config: ${result.configFile}`);
  console.log(`Project store: ${result.projectDir}`);
  console.log('');
  console.log('Next steps:');
  console.log('- Restart your coding agent if skills/hooks do not appear.');
  console.log('- Use skill layerkit-research-vendor (maps start empty).');
  console.log('- Do not invent email/phone rules without documentation sources.');
  for (const n of result.notes) console.log(`- ${n}`);
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

function runDoctor(args: string[], ctx: CliContext): void {
  const store = openStore(ctx);
  const result = store.doctor();
  for (const line of result.lines) console.log(line);
  let ok = result.ok;

  // One-line agent pipeline hint when a project exists
  if (store.loadProject()) {
    const completed = loadCompletedSteps(store.projectDir);
    console.log(formatNextStepLine(completed));
  }

  if (hasFlag(args, '--quality')) {
    console.log('');
    console.log('== quality (JaCoCo) ==');
    const strict = hasFlag(args, '--strict');
    const q = checkJavaQuality({
      searchRoots: defaultJacocoSearchRoots(store.projectDir, ctx.repoRoot),
      strict,
      minLineCoverage: JACOCO_MIN_LINE_COVERAGE,
    });
    for (const line of q.lines) console.log(line);
    if (!q.ok) ok = false;
  } else if (hasFlag(args, '--strict')) {
    console.log('Note: --strict applies with --quality (JaCoCo report required).');
  }

  if (!ok) process.exitCode = 1;
}

/** Print full integration pipeline + memory marker presence. */
function runAgentStatus(_args: string[], ctx: CliContext): void {
  const completed = loadCompletedSteps(ctx.projectDir);
  console.log(formatPipelineStatus(completed));
  console.log('');
  console.log('Memory markers:');
  const statusPath = pipelineStatusPath(ctx.projectDir);
  if (existsSync(statusPath)) {
    console.log(`  present  memory/${PIPELINE_STATUS_REL}`);
    for (const step of INTEGRATION_PIPELINE) {
      const mark = completed.includes(step.id) ? 'done' : 'open';
      console.log(`  ${mark.padEnd(6)} ${step.id}`);
    }
  } else {
    console.log(`  missing  memory/${PIPELINE_STATUS_REL} (no steps marked done yet)`);
    console.log('  Tip: layerkit agent mark-done --step <id>');
  }
}

/**
 * Print next skill + exact CLI commands from INTEGRATION_PIPELINE.cliHints.
 * Agents should run these, then `layerkit agent mark-done --step <id>`.
 */
function runAgentNext(_args: string[], ctx: CliContext): void {
  const completed = loadCompletedSteps(ctx.projectDir);
  const next = getNextStep(completed);
  if (!next) {
    console.log('Pipeline complete — no next agent step.');
    console.log('Optional: layerkit promote --vendor <id>; layerkit agent status');
    return;
  }
  console.log(`Next step: ${next.id}`);
  console.log(`Skill: ${next.skill}`);
  if (next.requiresHuman) console.log('Requires human: yes');
  console.log(`Done when: ${next.doneWhen}`);
  console.log('CLI commands:');
  for (const h of next.cliHints) console.log(`  ${h}`);
  console.log('');
  console.log(`Mark complete: layerkit agent mark-done --step ${next.id}`);
  console.log('Then: layerkit agent next');
}

/** Append a completed step marker under memory/runbooks/pipeline-status.md. */
function runAgentMarkDone(args: string[], ctx: CliContext): void {
  const step = flag(args, '--step');
  if (!step) {
    throw new Error(
      `Usage: layerkit agent mark-done --step <id>  (ids: ${INTEGRATION_PIPELINE.map((s) => s.id).join('|')})`,
    );
  }
  if (!isPipelineStepId(step)) {
    throw new Error(
      `Unknown step "${step}". Known: ${INTEGRATION_PIPELINE.map((s) => s.id).join(', ')}`,
    );
  }
  const path = markStepDone(ctx.projectDir, step);
  const completed = loadCompletedSteps(ctx.projectDir);
  console.log(`Marked done: ${step}`);
  console.log(`Marker file: ${path}`);
  console.log(formatNextStepLine(completed));
}

/**
 * Promote map_complete → live after quality gate.
 * With --strict (default for promote), JaCoCo report must exist and meet 0.95 line floor when parseable.
 */
function runPromote(args: string[], ctx: CliContext): void {
  const store = openStore(ctx);
  const project = store.loadProject();
  if (!project) throw new Error('No project — run layerkit install --poc');

  // promote is quality-gated; --strict is default unless --no-strict
  const strict = !hasFlag(args, '--no-strict');
  const q = checkJavaQuality({
    searchRoots: defaultJacocoSearchRoots(store.projectDir, ctx.repoRoot),
    strict,
    minLineCoverage: JACOCO_MIN_LINE_COVERAGE,
  });
  console.log('== promote quality gate ==');
  for (const line of q.lines) console.log(line);
  if (!q.ok) {
    console.log('Promote blocked: fix coverage / run mvn test under out/java, then retry.');
    process.exitCode = 1;
    return;
  }

  const onlyVendor = flag(args, '--vendor');
  const maps = store.listMaps().filter((m) => {
    if (onlyVendor && m.vendor !== onlyVendor) return false;
    const filled = m.fields.length > 0 || Object.keys(m.intents).length > 0;
    return filled && (m.status === 'map_complete' || m.status === 'live');
  });

  if (onlyVendor && maps.length === 0) {
    const m = store.loadMap(onlyVendor);
    if (!m) throw new Error(`No map for vendor ${onlyVendor}`);
    throw new Error(
      `Cannot promote ${onlyVendor}: status=${m.status ?? '?'} (need map_complete with fields/intents)`,
    );
  }

  if (maps.length === 0) {
    console.log('No map_complete vendors to promote.');
    return;
  }

  let promoted = 0;
  for (const m of maps) {
    if (m.status === 'live') {
      console.log(`  skip ${m.vendor}: already live`);
      continue;
    }
    m.status = 'live';
    store.saveMap(m);
    console.log(`  promoted ${m.vendor} → live`);
    promoted++;
  }
  console.log(`Promote done: ${promoted} map(s) set live.`);
  if (existsSync(join(store.projectDir, 'out', 'java', 'pom.xml'))) {
    console.log('Tip: regenerate client if needed: layerkit generate --lang java');
  }
}

function runConfig(): void {
  const config = ensureLayerkitConfig();
  console.log('Layerkit config');
  console.log(`Path: ${layerkitConfigPath()}`);
  console.log(JSON.stringify(config, null, 2));
  console.log('');
  console.log(`Platforms: ${installPlatformUsage}`);
}

function runRepoStatus(_args: string[], ctx: CliContext): void {
  const store = openStore(ctx);
  const project = store.loadProject();
  if (!project) {
    console.log('Layerkit is not installed for this repository.');
    console.log(`Run: layerkit install --platform <${installPlatformUsage}> --poc`);
    return;
  }
  console.log(`Project: ${project.name}`);
  console.log(`projectDir: ${store.projectDir}`);
  console.log(`Version: ${project.version}`);
  console.log(`Languages: ${project.languages.join(', ')}`);
  console.log(`Vendors: ${store.listMaps().length}`);
  const filled = store.listMaps().filter((m) => m.fields.length || Object.keys(m.intents).length);
  console.log(`Filled maps: ${filled.length}`);
  console.log(`Skeletons: ${store.listMaps().length - filled.length}`);
}

function wantJson(args: string[]): boolean {
  return args.includes('--json');
}

function emitJsonOrText(args: string[], data: unknown, text: () => void): void {
  if (wantJson(args)) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  text();
}

function readTextArg(pathOrInline: string): string {
  const abs = resolve(pathOrInline);
  if (existsSync(abs)) return readFileSync(abs, 'utf8');
  return pathOrInline;
}

function collectFlags(args: string[], name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === name) {
      const v = args[++i];
      if (v) out.push(v);
      continue;
    }
    if (args[i]!.startsWith(`${name}=`)) {
      out.push(args[i]!.slice(name.length + 1));
    }
  }
  return out;
}

function runResearchOpenapi(args: string[]): void {
  const file = requireArg(args[0], 'research openapi <file> [--json]');
  const raw = readFileSync(resolve(file), 'utf8');
  const parsed = parseOpenAPI(raw);
  emitJsonOrText(args, parsed, () => {
    console.log(`OpenAPI operations: ${parsed.operations.length}`);
    const lines = parsed.operations.slice(0, 20).map((o) => `  ${o.method} ${o.path}`);
    if (parsed.operations.length > 20) lines.push(`  … +${parsed.operations.length - 20} more`);
    console.log(lines.join('\n') || '  (no operations)');
  });
}

function runResearchCurl(args: string[]): void {
  const input = requireArg(args[0], 'research curl <file-or-inline> [--json]');
  const raw = readTextArg(input);
  const parsed = parseCurl(raw);
  emitJsonOrText(args, parsed, () => {
    console.log(`${parsed.method} ${parsed.url}`);
    if (parsed.host) console.log(`host: ${parsed.host}`);
    if (parsed.path) console.log(`path: ${parsed.path}`);
    const headers = Object.keys(parsed.headers ?? {});
    if (headers.length) console.log(`headers: ${headers.join(', ')}`);
  });
}

function runResearchDeepen(args: string[]): void {
  const file = requireArg(args[0], 'research deepen <hub.md> [--json]');
  const raw = readFileSync(resolve(file), 'utf8');
  const plan = deepenFromHubMarkdown(raw, file);
  emitJsonOrText(args, plan, () => {
    console.log(`enqueue: ${plan.enqueue.length}  needsHuman: ${plan.needsHuman}`);
    for (const s of plan.enqueue) {
      console.log(`  ${s.kind}\t${s.ref}`);
    }
    for (const e of plan.deepenLog) {
      console.log(`  log L${e.level} ${e.action}${e.detail ? `: ${e.detail}` : ''}`);
    }
  });
}

function runResearchFill(args: string[]): void {
  const openapis = collectFlags(args, '--openapi');
  const curls = collectFlags(args, '--curl');
  const hubs = collectFlags(args, '--hub');
  const vendor = flag(args, '--vendor');
  const out = flag(args, '--out');

  if (!openapis.length && !curls.length && !hubs.length) {
    throw new Error(
      'Usage: layerkit research fill [--openapi <file>]... [--curl <file>]... [--hub <file>]... [--vendor <id>] [--out <sheet.json>]',
    );
  }

  const seeds: ResearchSeed[] = [];
  for (const f of openapis) {
    seeds.push({
      kind: 'openapi',
      urlOrPath: resolve(f),
      content: readFileSync(resolve(f), 'utf8'),
    });
  }
  for (const f of curls) {
    seeds.push({ kind: 'curl', command: readTextArg(f) });
  }
  for (const f of hubs) {
    seeds.push({
      kind: 'hub_md',
      path: resolve(f),
      content: readFileSync(resolve(f), 'utf8'),
    });
  }

  const sheet = fillAnswerSheetFromEvidence(seeds, { vendor });
  const gaps = residualGaps(sheet);
  const invented = hasInventedEndpoint(sheet);

  if (out) {
    writeFileSync(resolve(out), JSON.stringify(sheet, null, 2) + '\n', 'utf8');
  }

  emitJsonOrText(args, { sheet, residualGaps: gaps, inventedEndpoint: invented }, () => {
    if (out) console.log(`Wrote answer sheet → ${resolve(out)}`);
    const dimCount = Object.keys(sheet.dimensions).length;
    console.log(`dimensions answered: ${countAnswered(sheet)} / ${dimCount}`);
    console.log(`residual gaps: ${gaps.length}`);
    if (invented) console.log('warning: possible invented endpoint signals in sheet');
    for (const g of gaps.slice(0, 12)) {
      console.log(`  gap ${g.id}: ${g.topic} (${g.reason})`);
    }
    if (gaps.length > 12) console.log(`  … +${gaps.length - 12} more`);
  });
}

function countAnswered(sheet: {
  dimensions: Record<string, { answer?: string; source?: string }>;
}): number {
  return Object.values(sheet.dimensions).filter(
    (a) => a.answer && a.answer.trim().length > 0 && a.source !== 'needs-evidence' && a.source !== 'unanswered',
  ).length;
}

function runResearchGaps(args: string[]): void {
  const file = requireArg(args[0], 'research gaps <sheet.json> [--json]');
  const sheet = JSON.parse(readFileSync(resolve(file), 'utf8'));
  const gaps = residualGaps(sheet);
  const invented = hasInventedEndpoint(sheet);
  emitJsonOrText(args, { residualGaps: gaps, inventedEndpoint: invented }, () => {
    console.log(`residual gaps: ${gaps.length}`);
    if (invented) console.log('warning: possible invented endpoint signals');
    for (const g of gaps) {
      console.log(`  ${g.id}\t${g.topic}\t${g.reason}`);
    }
  });
}

/**
 * Heuristic scan of customer Java → memory/runbooks/java-style-profile.md
 * (or --out <path>). No AST; greps package/DI/HTTP/test signals.
 */
function runStyleProfileScan(args: string[], ctx: CliContext): void {
  const rootFlag = flag(args, '--root');
  const root = resolve(rootFlag ?? ctx.repoRoot);
  if (!isScannableRoot(root)) {
    throw new Error(`style-profile scan: --root is not a directory: ${root}`);
  }
  const out = flag(args, '--out') ?? 'memory';
  const { result, outPath } = scanAndWriteStyleProfile({
    root,
    projectDir: ctx.projectDir,
    out: out === 'memory' ? 'memory' : resolve(out),
  });
  const p = result.profile;
  console.log(`Scanned: ${root}`);
  console.log(`Java files: ${result.evidence.javaFiles.length}`);
  console.log(`Build files: ${result.evidence.buildFiles.join(', ') || '(none)'}`);
  console.log(`package: ${p.package}`);
  console.log(`di: ${p.di}`);
  console.log(`http: ${p.http}`);
  console.log(`test: ${p.test}`);
  console.log(`Wrote style profile → ${outPath}`);
}


/** Default sample domain event for pure dry-run wire checks (no network). */
const FIX_DRY_RUN_SAMPLE = {
  intent: 'purchase',
  eventId: 'evt_1',
  user: { email: 'Ada@Example.com' },
  value: { amount: 10, currency: 'usd' },
};

function buildWireExpectation(args: string[]): WireExpectation | null {
  const expectEvent = flag(args, '--expect-event');
  const requireFields = collectFlags(args, '--require-field');
  const forbidFields = collectFlags(args, '--forbid-field');
  if (!expectEvent && requireFields.length === 0 && forbidFields.length === 0) {
    return null;
  }
  const expectation: WireExpectation = { notSkipped: true };
  if (expectEvent) expectation.eventName = expectEvent;
  if (requireFields.length) expectation.requiredKeys = requireFields;
  if (forbidFields.length) expectation.forbiddenKeys = forbidFields;
  return expectation;
}

/**
 * Apply ordered MapPathFixPatch list to a map (fix-loop pure helpers).
 * Optionally evaluate dry-run wire before/after each step when expectations are set.
 */
function runFixDryRun(args: string[]): void {
  const mapPath = flag(args, '--map');
  const patchesPath = flag(args, '--patches');
  if (!mapPath || !patchesPath) {
    throw new Error(
      'Usage: layerkit fix dry-run --map <map.json> --patches <patches.json> [--expect-event <name>] [--require-field <path>]... [--forbid-field <path>]... [--out <fixed-map.json>] [--json]',
    );
  }

  const map = JSON.parse(readFileSync(resolve(mapPath), 'utf8')) as VendorMap;
  const patchesRaw = JSON.parse(readFileSync(resolve(patchesPath), 'utf8'));
  const patches: MapPathFixPatch[] = Array.isArray(patchesRaw)
    ? (patchesRaw as MapPathFixPatch[])
    : [patchesRaw as MapPathFixPatch];

  if (!patches.length) {
    throw new Error('fix dry-run: --patches must be a non-empty array of MapPathFixPatch');
  }
  for (const [i, p] of patches.entries()) {
    if (!p || typeof p !== 'object' || typeof p.field !== 'string' || typeof p.to !== 'string') {
      throw new Error(
        `fix dry-run: patch[${i}] must have string field and to (got ${JSON.stringify(p)})`,
      );
    }
  }

  const expectation = buildWireExpectation(args);
  const out = flag(args, '--out');

  const beforeApply = applyVendorMap(FIX_DRY_RUN_SAMPLE, map);
  const beforeCheck = expectation ? evaluateDryRunWire(beforeApply, expectation) : null;

  const { steps, final } = runSequentialMapFixes(map, patches);

  type StepReport = {
    index: number;
    patch: MapPathFixPatch;
    dryRun: ReturnType<typeof applyVendorMap>;
    check: ReturnType<typeof evaluateDryRunWire> | null;
  };

  const stepReports: StepReport[] = steps.map((s) => {
    const dryRun = applyVendorMap(FIX_DRY_RUN_SAMPLE, s.map);
    return {
      index: s.index,
      patch: s.patch,
      dryRun,
      check: expectation ? evaluateDryRunWire(dryRun, expectation) : null,
    };
  });

  const finalApply = applyVendorMap(FIX_DRY_RUN_SAMPLE, final);
  const finalCheck = expectation ? evaluateDryRunWire(finalApply, expectation) : null;

  if (out) {
    writeFileSync(resolve(out), JSON.stringify(final, null, 2) + '\n', 'utf8');
  }

  const payload = {
    patchesApplied: patches.length,
    before: {
      dryRun: beforeApply,
      check: beforeCheck,
    },
    steps: stepReports.map((r) => ({
      index: r.index,
      patch: r.patch,
      dryRun: r.dryRun,
      check: r.check,
      ok: r.check ? r.check.ok : true,
    })),
    final: {
      map: final,
      dryRun: finalApply,
      check: finalCheck,
      ok: finalCheck ? finalCheck.ok : true,
    },
    out: out ? resolve(out) : undefined,
  };

  if (expectation && finalCheck && !finalCheck.ok) {
    process.exitCode = 1;
  }

  emitJsonOrText(args, payload, () => {
    console.log(`fix dry-run: applying ${patches.length} patch(es)`);
    if (beforeCheck) {
      console.log(
        `  before: ${beforeCheck.ok ? 'OK' : 'FAIL'} ${beforeCheck.failures.length ? `(${beforeCheck.failures.join('; ')})` : ''}`,
      );
    } else {
      console.log(
        `  before: skipped=${beforeApply.skipped}${beforeApply.reason ? ` (${beforeApply.reason})` : ''}`,
      );
    }
    for (const r of stepReports) {
      const patchLabel = `${r.patch.field}: ${JSON.stringify(r.patch.from ?? '?')} → ${JSON.stringify(r.patch.to)}`;
      if (r.check) {
        console.log(
          `  step ${r.index}: ${r.check.ok ? 'OK' : 'FAIL'}  ${patchLabel}${r.check.failures.length ? `  — ${r.check.failures.join('; ')}` : ''}`,
        );
      } else {
        console.log(`  step ${r.index}: applied  ${patchLabel}`);
      }
    }
    if (finalCheck) {
      console.log(
        `  final: ${finalCheck.ok ? 'OK' : 'FAIL'}${finalCheck.failures.length ? `  — ${finalCheck.failures.join('; ')}` : ''}`,
      );
    } else {
      console.log(
        `  final: skipped=${finalApply.skipped}${finalApply.reason ? ` (${finalApply.reason})` : ''}`,
      );
      if (finalApply.wire) {
        console.log(`  wire: ${JSON.stringify(finalApply.wire)}`);
      }
    }
    if (out) console.log(`Wrote fixed map → ${resolve(out)}`);
  });
}

/**
 * Suggest a path patch from map + vendor doc excerpt (no invent if doc has no path).
 */
function runFixSuggest(args: string[]): void {
  const mapPath = flag(args, '--map');
  const docPath = flag(args, '--doc');
  if (!mapPath || !docPath) {
    throw new Error('Usage: layerkit fix suggest --map <map.json> --doc <file.md> [--json]');
  }

  const map = JSON.parse(readFileSync(resolve(mapPath), 'utf8')) as VendorMap;
  const doc = readFileSync(resolve(docPath), 'utf8');
  const docPathExtracted = extractPathFromDocExcerpt(doc);
  const mismatch = detectPathMismatch(map, doc);
  const patch = pathFixFromDoc(map, doc);

  const payload = {
    mapPath: mismatch.mapPath,
    docPath: docPathExtracted,
    mismatch: mismatch.mismatch,
    detail: mismatch.detail,
    // null when no inventable fix (doc has no path, or paths already match)
    patch,
  };

  emitJsonOrText(args, payload, () => {
    console.log(`map path: ${mismatch.mapPath ?? '(none)'}`);
    console.log(`doc path: ${docPathExtracted ?? '(none extractable)'}`);
    console.log(`mismatch: ${mismatch.mismatch}${mismatch.detail ? ` — ${mismatch.detail}` : ''}`);
    if (patch) {
      console.log('suggested patch:');
      console.log(JSON.stringify(patch, null, 2));
    } else {
      console.log('suggested patch: (none — no invent when doc has no path or paths match)');
    }
  });
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i >= 0) return args[i + 1];
  const pref = args.find((a) => a.startsWith(`${name}=`));
  return pref?.slice(name.length + 1);
}

function requireArg(v: string | undefined, usage: string): string {
  if (!v) throw new Error(`Usage: layerkit ${usage}`);
  return v;
}

function readProposal(file: string): Proposal {
  return JSON.parse(readFileSync(resolve(file), 'utf8')) as Proposal;
}

/** Load proposal by filesystem path or by id from the store. */
function loadProposalRef(store: VendorMemoryStore, ref: string): Proposal {
  // Prefer store id when file does not exist
  try {
    const fromFile = readProposal(ref);
    if (fromFile?.id) return fromFile;
  } catch {
    // fall through to store
  }
  const fromStore = store.loadProposal(ref);
  if (fromStore) return fromStore;
  // Last attempt: treat as path even if earlier parse failed oddly
  try {
    return readProposal(ref);
  } catch {
    throw new Error(`Proposal not found as file or id: ${ref}`);
  }
}

function matchCommand(argv: string[]): CliCommand | undefined {
  const sorted = [...cliCommands].sort((a, b) => b.path.length - a.path.length);
  return sorted.find((c) => c.path.every((p, i) => argv[i] === p));
}

function printHelp(): void {
  console.log('layerkit — agent-first multi-vendor data-layer toolkit\n');
  console.log('Usage:');
  for (const c of cliCommands.filter((x) => x.showInTopLevelHelp)) {
    console.log(`  layerkit ${c.usage}`);
  }
  console.log('\nGlobal flags: --project-dir <path>  (store root; default .layerkit)');
  console.log('Platforms: ' + installPlatformUsage);
  console.log('Agent install: docs/agent-install-prompt.md');
}

async function main(argv: string[]): Promise<void> {
  if (!argv.length || argv[0] === '-h' || argv[0] === '--help' || argv[0] === 'help') {
    printHelp();
    return;
  }

  const { rest, projectDir: projectDirFlag } = extractGlobalFlags(argv);
  const repoRoot = detectRepoRoot();
  const projectDir = resolveProjectDir(repoRoot, { cliProjectDir: projectDirFlag });
  const ctx: CliContext = { repoRoot, projectDirFlag, projectDir };

  const cmd = matchCommand(rest);
  if (!cmd) {
    printHelp();
    process.exitCode = 1;
    return;
  }
  await cmd.handler(rest.slice(cmd.path.length), ctx);
}

main(process.argv.slice(2)).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

// silence unused import in some builds
void platformDisplayName;
