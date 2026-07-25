#!/usr/bin/env node
/**
 * Layerkit CLI — multi-vendor data-layer command surface for agent platforms.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ensureLayerkitConfig, layerkitConfigPath } from '../../libs/config/layerkit-config.js';
import { resolveProjectDir } from '../../libs/config/project-dir.js';
import { generateJavaScaffold } from '../../libs/generate/java-scaffold.js';
import { layerkitHookGuidance } from '../../libs/hooks/guidance.js';
import { installLayerkit } from '../../libs/install/install.js';
import {
  installPlatformUsage,
  isInstallPlatform,
  platformDisplayName,
  type InstallPlatform,
} from '../../libs/install/paths.js';
import type { Identity, Proposal } from '../../libs/domain/types.js';
import {
  createMemoryStack,
  type MemoryEntryType,
} from '../../libs/memory/index.js';
import { applyVendorMap } from '../../libs/vendor-memory/map-engine.js';
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
    usage: 'doctor [--project-dir <path>]',
    handler: runDoctor,
    showInTopLevelHelp: true,
  },
  {
    path: ['config'],
    usage: 'config',
    handler: runConfig,
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
      console.log('Next: use skill layerkit-generate-java to implement the client.');
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
  console.log(`Vendor memory: ${result.projectDir} (${result.vendorSlots} slots)`);
  console.log('');
  console.log('Next steps:');
  console.log('- Restart your coding agent if skills/hooks do not appear.');
  console.log('- Use skill layerkit-research-vendor (maps start empty).');
  console.log('- Do not invent email/phone rules without documentation sources.');
  for (const n of result.notes) console.log(`- ${n}`);
}

function runDoctor(_args: string[], ctx: CliContext): void {
  const store = openStore(ctx);
  const result = store.doctor();
  for (const line of result.lines) console.log(line);
  if (!result.ok) process.exitCode = 1;
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
