#!/usr/bin/env node
/**
 * Layerkit CLI — multi-vendor data-layer command surface for agent platforms.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';
import {
  formatNextStepLine,
  formatPipelineStatus,
  INTEGRATION_PIPELINE,
  isPipelineStepId,
  markStepDone,
  pipelineStatusPath,
  PIPELINE_STATUS_REL,
  setPipelineMode,
  writeHandoffRunbook,
  loadPipelineMode,
  effectiveCompletedSteps,
  getNextStepForProject,
  writeSkillPacket,
  assertEvidenceForStep,
  assertSkillPacketForMarkDone,
  readEvidenceFile,
  requirePipelineStarted,
  SKILL_PACKET_REL,
  formatLayerkitHelp,
  openClientPr,
  type PipelineMode,
} from '../../libs/agent/index.js';
import { ensureLayerkitConfig, layerkitConfigPath } from '../../libs/config/layerkit-config.js';
import { resolveProjectDir } from '../../libs/config/project-dir.js';
import { layerkitHookGuidance } from '../../libs/hooks/guidance.js';
import { defaultPackageRoot, installLayerkit } from '../../libs/install/install.js';
import {
  installPlatformUsage,
  isInstallPlatform,
  platformDisplayName,
  type InstallPlatform,
} from '../../libs/install/paths.js';
import type {
  Identity,
  IntentWire,
  Proposal,
  VendorMap,
} from '../../libs/domain/types.js';
import {
  parseEndpointFlag,
  parseFieldFlag,
  parseIntentFlag,
  parseSourceFlag,
  scaffoldVendorMapProposal,
} from '../../libs/proposal/scaffold.js';
import { validateProposal } from '../../libs/proposal/validate.js';
import {
  createMemoryStack,
  type MemoryEntryType,
} from '../../libs/memory/index.js';
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
  let dir = process.cwd();
  while (true) {
    if (
      existsSync(join(dir, '.git')) ||
      existsSync(join(dir, 'layerkit.path.json')) ||
      existsSync(join(dir, 'layerkit.json')) ||
      existsSync(join(dir, 'package.json'))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir || dir === parse(dir).root) return process.cwd();
    dir = parent;
  }
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
    usage: `install --platform ${installPlatformUsage} [--hooks enabled|disabled] [--map-reminders enabled|disabled] [--poc] [--name <name>] [--user-config] [--project-dir <path>]`,
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
    path: ['help'],
    usage: 'help',
    handler: runLayerkitHelp,
    showInTopLevelHelp: true,
  },
  {
    path: ['cheatsheet'],
    usage: 'cheatsheet',
    handler: runCheatsheet,
    showInTopLevelHelp: true,
  },
  {
    path: ['cheat-sheet'],
    usage: 'cheat-sheet',
    handler: runCheatsheet,
    showInTopLevelHelp: false,
  },
  {
    path: ['config'],
    usage: 'config',
    handler: runConfig,
    showInTopLevelHelp: false,
  },
  {
    path: ['agent', 'help'],
    usage: 'agent help [--project-dir <path>]',
    handler: runLayerkitHelp,
    showInTopLevelHelp: true,
  },
  {
    path: ['agent', 'status'],
    usage: 'agent status [--project-dir <path>]',
    handler: runAgentStatus,
    showInTopLevelHelp: true,
  },
  {
    path: ['agent', 'start'],
    usage: 'agent start [--mode full|heal] [--vendor <v>] [--note <text>] [--force-reset] [--project-dir <path>]',
    handler: runAgentStart,
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
    usage: 'agent mark-done --step <id> --evidence <path>... [--project-dir <path>]',
    handler: runAgentMarkDone,
    showInTopLevelHelp: true,
  },
  {
    path: ['pr', 'open'],
    usage:
      'pr open --title <text> --body <text> [--pr-match <key>] [--usecase <key>] [--branch <name>] [--base main] [--commit-message <msg>] [--no-reuse] [--cwd <path>] [--project-dir <path>]',
    handler: runPrOpen,
    showInTopLevelHelp: true,
  },
{
    path: ['handoff', 'write'],
    usage:
      'handoff write [--vendor <v>] [--goal <text>] [--done <item>]... [--next <action>]... [--blocked <q>]... [--in-progress <item>]... [--evidence <item>]... [--quality <text>] [--out memory|path] [--project-dir <path>]',
    handler: runHandoffWrite,
    showInTopLevelHelp: true,
  },
  {
    path: ['repo', 'status'],
    usage: 'repo status [--project-dir <path>]',
    handler: runRepoStatus,
    showInTopLevelHelp: false,
  },
  {
    path: ['map', 'list'],
    usage: 'map list [--project-dir <path>]',
    handler: (_args, ctx) => {
      const store = openStore(ctx);
      if (!store.loadProject()) {
        for (const line of installGuidanceLines()) console.log(line);
        return;
      }
      const maps = store.listMaps();
      if (maps.length === 0) {
        for (const line of emptyMapGuidanceLines()) console.log(line);
        return;
      }
      if (_args.includes('--json')) {
        console.log(JSON.stringify(maps.map(mapListRow), null, 2));
        return;
      }
      for (const m of maps) {
        const row = mapListRow(m);
        console.log(
          [
            row.vendor,
            `v${row.schemaVersion}`,
            `fields=${row.fieldCount}`,
            `intents=${row.intentCount}`,
            `empty=${row.empty}`,
            row.status,
            row.displayName,
          ].join('\t'),
        );
      }
    },
    showInTopLevelHelp: false,
  },
  {
    path: ['map', 'show'],
    usage: 'map show <vendor> [--path] [--project-dir <path>]',
    handler: (args, ctx) => {
      const vendor = args[0];
      if (!vendor) throw new Error('Usage: layerkit map show <vendor> [--path]');
      const pathOnly = hasFlag(args, '--path');
      const mapPath = join(ctx.projectDir, 'maps', `${vendor}.json`);
      if (pathOnly) {
        if (!existsSync(mapPath)) {
          throw new Error(
            `No map for ${vendor} at ${mapPath}. Use map list; author via proposal pipeline.`,
          );
        }
        console.log(mapPath);
        return;
      }
      const store = openStore(ctx);
      const map = store.loadMap(vendor);
      if (!map) {
        throw new Error(
          `No map for ${vendor} at ${mapPath}. Use map list; author via proposal pipeline.`,
        );
      }
      console.log(JSON.stringify(map, null, 2));
    },
    showInTopLevelHelp: false,
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
    showInTopLevelHelp: false,
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
    showInTopLevelHelp: false,
  },
  {
    path: ['memory', 'list'],
    usage: 'memory list [--vendor <v>] [--type questionnaire|research|...] [--json] [--project-dir <path>]',
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
      if (args.includes('--json')) {
        console.log(JSON.stringify(entries, null, 2));
        return;
      }
      if (!entries.length) {
        console.log('(no memory entries)');
        return;
      }
      for (const e of entries) {
        console.log(`${e.type}\t${e.vendor ?? '-'}\t${e.relativePath}\t${e.title}`);
      }
    },
    showInTopLevelHelp: false,
  },
  {
    path: ['memory', 'search'],
    usage: 'memory search <query> [--vendor <v>] [--type questionnaire|research|...] [--json] [--project-dir <path>]',
    handler: (args, ctx) => {
      const query = requireArg(args[0], 'memory search <query>');
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
      const results = mem.search(query, { vendor, type });
      if (args.includes('--json')) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }
      if (!results.length) {
        console.log('(no matches)');
        return;
      }
      for (const r of results) {
        console.log(`${r.type}\t${r.vendor ?? '-'}\t${r.relativePath}\t${r.title}`);
        for (const line of r.matches) console.log(`  ${line}`);
      }
    },
    showInTopLevelHelp: false,
  },
  {
    path: ['memory', 'show'],
    usage: 'memory show <path-or-id> [--project-dir <path>]',
    handler: (args, ctx) => {
      const id = requireArg(args[0], 'memory show <path-or-id>');
      const mem = createMemoryStack(ctx.projectDir);
      console.log(mem.show(id));
    },
    showInTopLevelHelp: false,
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
    showInTopLevelHelp: false,
  },
  {
    path: ['memory', 'index'],
    usage: 'memory index [--project-dir <path>]',
    handler: (_args, ctx) => {
      const mem = createMemoryStack(ctx.projectDir);
      console.log(`Rebuilt INDEX → ${mem.index()}`);
    },
    showInTopLevelHelp: false,
  },
  {
    path: ['proposal', 'write', 'map'],
    usage:
      'proposal write map --vendor <v> --out <file> --source title=url [...] [--agent <id>] [--endpoint METHOD:path] [--intent purchase:EventName]... [--field domain:vendor]... [--validate]',
    handler: (args) => {
      runProposalWriteMap(args);
    },
    showInTopLevelHelp: false,
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
    showInTopLevelHelp: false,
  },
  {
    path: ['proposal', 'validate'],
    usage: 'proposal validate <file|id> [--project-dir <path>]',
    handler: (args, ctx) => {
      const ref = requireArg(args[0], 'proposal validate <file|id>');
      const store = openStore(ctx);
      const proposal = loadProposalRef(store, ref);
      if (['ready_to_apply', 'applied', 'promoted', 'rejected', 'superseded'].includes(proposal.status)) {
        throw new Error(`validate_conflict: status=${proposal.status}`);
      }
      const result = store.reviewProposal(proposal);
      if (result.valid) {
        console.log('Proposal is valid.');
        for (const w of result.warnings) console.log(`Warning: ${w}`);
        return;
      }
      console.log('Proposal is invalid:');
      for (const e of result.errors) console.log(`- ${proposalErrorGroup(e)}: ${e}`);
      process.exitCode = 1;
    },
    showInTopLevelHelp: false,
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
    showInTopLevelHelp: false,
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
    showInTopLevelHelp: false,
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
    showInTopLevelHelp: false,
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
    showInTopLevelHelp: false,
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
  mapReminders: boolean;
  poc: boolean;
  name?: string;
  userConfig: boolean;
} {
  let platform: InstallPlatform | undefined;
  let hooks: boolean | undefined;
  let mapReminders: boolean | undefined;
  let poc = true;
  let name: string | undefined;
  let userConfig = false;

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
    if (arg === '--map-reminders') {
      mapReminders = parseEnabled(args[++i]);
      continue;
    }
    if (arg.startsWith('--map-reminders=')) {
      mapReminders = parseEnabled(arg.slice('--map-reminders='.length));
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
    if (arg === '--user-config') {
      userConfig = true;
      continue;
    }
    if (arg === '--no-user-config') {
      userConfig = false;
      continue;
    }
    throw new Error(`Unknown install flag: ${arg}`);
  }

  if (!platform) {
    throw new Error(`--platform is required (${installPlatformUsage})`);
  }
  const hooksEnabled = hooks ?? true;
  const reminders = hooksEnabled ? (mapReminders ?? true) : false;
  return { platform, hooksEnabled, mapReminders: reminders, poc, name, userConfig };
}

function parseEnabled(v: string | undefined): boolean {
  if (v === 'enabled') return true;
  if (v === 'disabled') return false;
  throw new Error('Expected enabled|disabled');
}

function printInstallResult(result: Awaited<ReturnType<typeof installLayerkit>>): void {
  console.log(`Installed Layerkit for ${result.platformLabel}.`);
  console.log(
    `Skills: ${result.skillCount} packaged; paths written/refreshed: ${result.skills.length}`,
  );
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
  console.log(`Map-update reminders: ${result.mapReminders ? 'enabled' : 'disabled'}.`);
  console.log(`Config: ${result.configFile}`);
  console.log(`Project store: ${result.projectDir}`);
  console.log('');
  console.log('Next steps:');
  console.log('- Restart your coding agent if skills/hooks do not appear.');
  console.log('- Packaged skills are refreshed on every install (stale SKILL.md copies are replaced).');
  console.log('- Use the installed Layerkit skills to read evidence and edit the package directly.');
  console.log('- Use CLI rails only for explicit artifacts: proposal validate/apply, map validate, memory, doctor.');
  console.log('- Do not invent email/phone rules without documentation sources.');
  for (const n of result.notes) console.log(`- ${n}`);
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

function installGuidanceLines(): string[] {
  return [
    'No Layerkit project found yet.',
    'Next step: run layerkit install',
  ];
}

function emptyMapGuidanceLines(): string[] {
  return [
    'No vendor maps yet — start with the installed agent skills:',
    '  - read/cite vendor docs or OpenAPI',
    '  - edit existing maps/source/tests directly from evidence',
    '  - layerkit agent next',
  ];
}

function runDoctor(args: string[], ctx: CliContext): void {
  const store = openStore(ctx);
  const result = store.doctor();
  for (const line of result.lines) console.log(line);
  let ok = result.ok;

  if (store.loadProject() && store.listMaps().length === 0) {
    console.log('');
    for (const line of emptyMapGuidanceLines()) console.log(line);
  } else if (!store.loadProject()) {
    console.log('');
    for (const line of installGuidanceLines()) console.log(line);
  }

  // One-line agent pipeline hint when a project exists
  if (store.loadProject()) {
    const completed = effectiveCompletedSteps(store.projectDir);
    console.log(formatNextStepLine(completed, loadPipelineMode(store.projectDir)));
  }

  if (hasFlag(args, '--quality') || hasFlag(args, '--strict')) {
    console.log('');
    console.log(
      'Note: doctor no longer enforces client CI/coverage. Run the client package build/test command directly.',
    );
  }

  if (store.loadProject()) {
    console.log('');
    console.log('Tip: layerkit cheatsheet  (one-page commands)');
  }

  if (!ok) process.exitCode = 1;
}

/** Print docs/CHEATSHEET.md from the installed package (or repo checkout). */
function runCheatsheet(_args: string[], _ctx: CliContext): void {
  const candidates = [
    join(defaultPackageRoot(), 'docs', 'CHEATSHEET.md'),
    join(_ctx.repoRoot, 'docs', 'CHEATSHEET.md'),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    console.log(readFileSync(p, 'utf8').trimEnd());
    console.log('');
    console.log(`(source: ${p})`);
    return;
  }
  throw new Error(
    'CHEATSHEET.md not found (expected package docs/CHEATSHEET.md). See https://github.com/hariharapanigrahy/layerkit/blob/main/docs/CHEATSHEET.md',
  );
}

/** Print full integration pipeline + memory marker presence. */
function runAgentStatus(_args: string[], ctx: CliContext): void {
  const mode = loadPipelineMode(ctx.projectDir);
  const completed = effectiveCompletedSteps(ctx.projectDir);
  console.log(formatPipelineStatus(completed, mode));
  console.log('');
  console.log('Memory markers:');
  const statusPath = pipelineStatusPath(ctx.projectDir);
  if (existsSync(statusPath)) {
    console.log(`  present  memory/${PIPELINE_STATUS_REL}  mode=${mode}`);
    for (const step of INTEGRATION_PIPELINE) {
      const mark = completed.includes(step.id) ? 'done' : 'open';
      console.log(`  ${mark.padEnd(6)} ${step.id}`);
    }
  } else {
    console.log(`  missing  memory/${PIPELINE_STATUS_REL} (no steps marked done yet)`);
    console.log('  Tip: use the next skill, then layerkit agent mark-done --step <id> --evidence <path>');
  }
}

/** Initialize the deterministic pipeline state only; source edits remain agent-owned. */
function runAgentStart(args: string[], ctx: CliContext): void {
  const modeRaw = flag(args, '--mode');
  // Default full so users need not learn heal vs full; heal is opt-in when domain is already known.
  if (modeRaw != null && modeRaw !== 'full' && modeRaw !== 'heal') {
    throw new Error('Usage: layerkit agent start [--mode full|heal] [--vendor <v>] [--note <text>] [--force-reset]');
  }
  const mode: PipelineMode = modeRaw === 'heal' ? 'heal' : 'full';
  const forceReset = hasFlag(args, '--force-reset');
  const path = setPipelineMode(ctx.projectDir, mode, {
    vendor: flag(args, '--vendor'),
    note: flag(args, '--note'),
    forceReset,
  });
  const completed = effectiveCompletedSteps(ctx.projectDir);

  console.log(`Started agent pipeline: ${mode}${forceReset ? ' (force-reset)' : ''}`);
  console.log(`projectDir: ${ctx.projectDir}`);
  console.log(`Marker file: ${path}`);
  console.log(formatNextStepLine(completed, mode));
  console.log('Intentional session OPEN — skill rails apply until handoff.');
  console.log('Unrelated non-integration work is out of scope for these rails.');
  console.log('Next: layerkit agent next   (or layerkit help)');
  if (mode === 'heal') {
    console.log('Semantic contract drift and source edits remain agent-owned.');
  }
}

/**
 * Print next skill + exact CLI commands; always write a skill packet under memory/.
 * Agents must follow the packet skill — freestyle without pipeline is blocked at mark-done.
 */
function runAgentNext(_args: string[], ctx: CliContext): void {
  requirePipelineStarted(ctx.projectDir);
  const mode = loadPipelineMode(ctx.projectDir);
  const next = getNextStepForProject(ctx.projectDir);
  if (!next) {
    console.log('Pipeline complete — no next agent step.');
    console.log('Optional: layerkit agent status');
    return;
  }
  const packetPath = writeSkillPacket(ctx.projectDir);
  console.log(`Next step: ${next.id}`);
  console.log(`Skill: ${next.skill}`);
  console.log(`Mode: ${mode}`);
  if (next.requiresHuman) console.log('Requires human: yes');
  console.log(`Done when: ${next.doneWhen}`);
  console.log('CLI commands:');
  for (const h of next.cliHints) console.log(`  ${h}`);
  console.log('');
  console.log('FORBIDDEN: freestyle production edits or pin-only "full integrate" outside this skill.');
  if (packetPath) {
    console.log(`Skill packet written: ${packetPath}`);
    console.log(`(relative: memory/${SKILL_PACKET_REL})`);
  }
  console.log('');
  console.log(`Mark complete: layerkit agent mark-done --step ${next.id} --evidence <path>`);
  console.log('Then: layerkit agent next');
}

/** Append a completed step marker under memory/runbooks/pipeline-status.md. */
/**
 * Open client package PR for handoff.
 * If not a collaborator on origin: fork → push → PR into upstream.
 */
function runPrOpen(args: string[], ctx: CliContext): void {
  const title = flag(args, '--title');
  const body = flag(args, '--body');
  if (!title?.trim() || !body?.trim()) {
    throw new Error(
      'Usage: layerkit pr open --title <text> --body <text> [--pr-match <key>] [--usecase <key>] [--branch <name>] [--base main] [--commit-message <msg>] [--no-reuse] [--cwd <git-root>]\n' +
        '  --pr-match: free-form PR dedupe string (title/body/branch tokens); not a vendor API registry.\n' +
        '  --usecase: deprecated alias of --pr-match.',
    );
  }
  const cwd = flag(args, '--cwd') || ctx.repoRoot || ctx.projectDir;
  const branch = flag(args, '--branch') || undefined;
  const base = flag(args, '--base') || 'main';
  const commitMessage = flag(args, '--commit-message') || undefined;
  // Prefer --pr-match; --usecase kept as deprecated alias (not a contract registry).
  const prMatch = flag(args, '--pr-match') || flag(args, '--usecase') || undefined;
  const reuseOpenPr = !args.includes('--no-reuse');
  const result = openClientPr({
    cwd,
    title: title.trim(),
    body: body.trim(),
    branch,
    base,
    commitMessage,
    prMatch,
    reuseOpenPr,
  });
  console.log(
    result.reused
      ? `PR updated (reuse open match, ${result.mode}): ${result.prUrl}`
      : `PR opened (${result.mode}): ${result.prUrl}`,
  );
  console.log(`head: ${result.head}  base: ${result.base}  branch: ${result.branch}`);
  console.log('');
  console.log('Handoff evidence must include:');
  console.log(`  pr: ${result.prUrl}`);
  console.log('  package_verify: green');
  if (result.mode === 'fork') {
    console.log('(Not a collaborator on origin — used fork push → upstream PR.)');
  }
  if (result.reused) {
    console.log('(Matched open PR via --pr-match / title tokens — pushed to existing branch, no duplicate PR.)');
  }
}

function runAgentMarkDone(args: string[], ctx: CliContext): void {
  requirePipelineStarted(ctx.projectDir);
  const step = flag(args, '--step');
  const evidence = collectFlags(args, '--evidence');
  if (!step) {
    throw new Error(
      `Usage: layerkit agent mark-done --step <id> --evidence <path>  (ids: ${INTEGRATION_PIPELINE.map((s) => s.id).join('|')})`,
    );
  }
  if (!isPipelineStepId(step)) {
    throw new Error(
      `Unknown step "${step}". Known: ${INTEGRATION_PIPELINE.map((s) => s.id).join(', ')}`,
    );
  }
  const clean = evidence.map((p) => p.trim()).filter(Boolean);
  // Fail-closed flow while session open: next → skill packet → evidence → mark-done (order)
  assertSkillPacketForMarkDone(ctx.projectDir, step);
  assertEvidenceForStep(
    step,
    clean,
    (p) => readEvidenceFile(p, ctx.repoRoot, ctx.projectDir),
    { projectDir: ctx.projectDir },
  );
  const path = markStepDone(ctx.projectDir, step, clean);
  const mode = loadPipelineMode(ctx.projectDir);
  const completed = effectiveCompletedSteps(ctx.projectDir);
  console.log(`Marked done: ${step}`);
  console.log(`Marker file: ${path}`);
  console.log(formatNextStepLine(completed, mode));
  console.log('Next: layerkit agent next  (loads the next skill packet)');
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

function mapListRow(m: VendorMap): Record<string, unknown> {
  return {
    vendor: m.vendor,
    schemaVersion: m.schemaVersion ?? 1,
    fieldCount: m.fields?.length ?? 0,
    intentCount: Object.keys(m.intents ?? {}).length,
    empty: (m.fields?.length ?? 0) === 0 && Object.keys(m.intents ?? {}).length === 0,
    status: m.status ?? '?',
    displayName: m.displayName,
  };
}

function proposalErrorGroup(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('source')) return 'sources';
  if (lower.includes('endpoint') || lower.includes('operation')) return 'endpoint';
  if (lower.includes('invent') || lower.includes('hallucination')) return 'invent';
  return 'other';
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

function writeProposalFile(out: string, proposal: Proposal): void {
  const path = resolve(out);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(proposal, null, 2)}\n`, 'utf8');
}

function maybeValidateWrittenProposal(proposal: Proposal, out: string, doValidate: boolean): void {
  if (doValidate) {
    const issues = validateProposal(proposal);
    const errors = issues.filter((i) => i.level === 'error');
    const warnings = issues.filter((i) => i.level === 'warn');
    if (errors.length === 0) {
      console.log('Structural validate: ok');
    } else {
      console.log('Structural validate: errors');
      for (const e of errors) console.log(`- [${e.code}] ${e.message}`);
      process.exitCode = 1;
    }
    for (const w of warnings) console.log(`Warning: [${w.code}] ${w.message}`);
  }
  console.log(`Next: layerkit proposal validate ${out}`);
  console.log('(Does not auto-submit — use proposal submit when ready for checker.)');
}

function runProposalWriteMap(args: string[]): void {
  const vendor = flag(args, '--vendor');
  const out = flag(args, '--out');
  const agent = flag(args, '--agent');
  const sourceRaws = collectFlags(args, '--source');
  const endpointRaw = flag(args, '--endpoint');
  const intentRaws = collectFlags(args, '--intent');
  const fieldRaws = collectFlags(args, '--field');
  const doValidate = args.includes('--validate');

  if (!vendor || !out) {
    throw new Error(
      'Usage: layerkit proposal write map --vendor <v> --out <file> --source title=url [...] [--agent <id>] [--endpoint METHOD:path] [--intent purchase:EventName]... [--field domain:vendor]... [--validate]',
    );
  }
  if (!sourceRaws.length) {
    throw new Error(
      'proposal write map requires at least one --source title=url (vendor documentation is the truth)',
    );
  }

  const sources = sourceRaws.map(parseSourceFlag);
  const intents: Record<string, IntentWire> = {};
  for (const raw of intentRaws) {
    const { intent, eventName } = parseIntentFlag(raw);
    intents[intent] = { eventName };
  }
  const fields = fieldRaws.map(parseFieldFlag);
  const endpoint = endpointRaw ? parseEndpointFlag(endpointRaw) : undefined;

  const proposal = scaffoldVendorMapProposal({
    vendor,
    agentId: agent,
    sources,
    endpoint,
    intents: Object.keys(intents).length ? intents : undefined,
    fields: fields.length ? fields : undefined,
  });

  writeProposalFile(out, proposal);
  console.log(`Wrote vendor_map proposal ${proposal.id} → ${resolve(out)}`);
  console.log(`Sources: ${proposal.sources.length}`);
  maybeValidateWrittenProposal(proposal, out, doValidate);
}

function runHandoffWrite(args: string[], ctx: CliContext): void {
  const vendor = flag(args, '--vendor');
  const goal = flag(args, '--goal');
  const quality = flag(args, '--quality');
  const out = flag(args, '--out') ?? 'memory';
  const done = collectFlags(args, '--done');
  const nextActions = collectFlags(args, '--next');
  const blocked = collectFlags(args, '--blocked');
  const inProgress = collectFlags(args, '--in-progress');
  const evidence = collectFlags(args, '--evidence');

  const outPath = writeHandoffRunbook({
    projectDir: ctx.projectDir,
    vendor,
    goal,
    quality,
    done: done.length ? done : undefined,
    nextActions: nextActions.length ? nextActions : undefined,
    blocked: blocked.length ? blocked : undefined,
    inProgress: inProgress.length ? inProgress : undefined,
    evidence: evidence.length ? evidence : undefined,
    out: out === 'memory' ? 'memory' : resolve(out),
  });

  console.log(`Wrote handoff runbook → ${outPath}`);
  if (vendor) console.log(`Vendor: ${vendor}`);
  if (goal) console.log(`Goal: ${goal}`);
  if (nextActions.length) {
    console.log('Next actions:');
    for (const a of nextActions) console.log(`  - ${a}`);
  }
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

function printCommandList(): void {
  console.log('Commands:');
  for (const c of cliCommands.filter((x) => x.showInTopLevelHelp)) {
    console.log(`  layerkit ${c.usage}`);
  }
  console.log('\nGlobal flags: --project-dir <path>  (store root; default .layerkit)');
  console.log('Platforms: ' + installPlatformUsage);
}

/** BMAD-style orientation: when rails apply + how to opt in. */
function runLayerkitHelp(_args: string[], ctx: CliContext): void {
  const sessionOpen = existsSync(pipelineStatusPath(ctx.projectDir));
  const completed = sessionOpen ? effectiveCompletedSteps(ctx.projectDir) : [];
  const mode = sessionOpen ? loadPipelineMode(ctx.projectDir) : 'full';
  const nextStepLine = sessionOpen ? formatNextStepLine(completed, mode) : undefined;
  console.log(
    formatLayerkitHelp({
      projectDir: ctx.projectDir,
      sessionOpen,
      nextStepLine,
    }),
  );
  console.log('');
  printCommandList();
}

function printHelp(ctx?: CliContext): void {
  if (ctx) {
    runLayerkitHelp([], ctx);
    return;
  }
  console.log('layerkit — agent-first multi-vendor data-layer toolkit\n');
  console.log(
    formatLayerkitHelp({
      sessionOpen: false,
    }),
  );
  console.log('');
  printCommandList();
  console.log('Cheat sheet: layerkit cheatsheet  (docs/CHEATSHEET.md)');
  console.log('Agent install: docs/agent-install-prompt.md');
}

async function main(argv: string[]): Promise<void> {
  const { rest, projectDir: projectDirFlag } = extractGlobalFlags(argv);
  const repoRoot = detectRepoRoot();
  const projectDir = resolveProjectDir(repoRoot, { cliProjectDir: projectDirFlag });
  const ctx: CliContext = { repoRoot, projectDirFlag, projectDir };

  if (!rest.length || rest[0] === '-h' || rest[0] === '--help') {
    printHelp(ctx);
    return;
  }

  const cmd = matchCommand(rest);
  if (!cmd) {
    printHelp(ctx);
    process.exitCode = 1;
    return;
  }
  await cmd.handler(rest.slice(cmd.path.length), ctx);
}

main(process.argv.slice(2)).catch((err) => {
  if (err instanceof Error) {
    const code = errorCode(err.message);
    // Avoid double prefix when message already starts with code:
    const msg = err.message.startsWith(`${code}:`) ? err.message : `${code}: ${err.message}`;
    console.error(msg);
    if (process.env.LAYERKIT_DEBUG === '1' && err.stack) console.error(err.stack);
  } else {
    console.error(`unknown_error: ${String(err)}`);
  }
  process.exitCode = 1;
});

function errorCode(message: string): string {
  const m = message.match(/^([a-z][a-z0-9_]+):/);
  if (m?.[1]) return m[1];
  if (/^Usage:/.test(message)) return 'usage_error';
  if (/not found/i.test(message)) return 'not_found';
  return 'layerkit_error';
}

// silence unused import in some builds
void platformDisplayName;
