#!/usr/bin/env node
/**
 * Layerkit CLI — multi-vendor data-layer command surface for agent platforms.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  formatNextStepLine,
  formatPipelineStatus,
  INTEGRATION_PIPELINE,
  isPipelineStepId,
  markStepDone,
  pipelineStatusPath,
  PIPELINE_STATUS_REL,
  writeHandoffRunbook,
  loadPipelineMode,
  effectiveCompletedSteps,
  getNextStepForProject,
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
    showInTopLevelHelp: true,
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
      for (const m of maps) {
        console.log(`${m.vendor}\t${m.status ?? '?'}\t${m.displayName}`);
      }
    },
    showInTopLevelHelp: true,
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
    path: ['proposal', 'write', 'map'],
    usage:
      'proposal write map --vendor <v> --out <file> --source title=url [...] [--agent <id>] [--endpoint METHOD:path] [--intent purchase:EventName]... [--field domain:vendor]... [--validate]',
    handler: (args) => {
      runProposalWriteMap(args);
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
    console.log('  Tip: use the next skill, then layerkit agent mark-done --step <id>');
  }
}

/**
 * Print next skill + exact CLI commands from INTEGRATION_PIPELINE.cliHints.
 * Agents should run these, then `layerkit agent mark-done --step <id>`.
 */
function runAgentNext(_args: string[], ctx: CliContext): void {
  const mode = loadPipelineMode(ctx.projectDir);
  const next = getNextStepForProject(ctx.projectDir);
  if (!next) {
    console.log('Pipeline complete — no next agent step.');
    console.log('Optional: layerkit agent status');
    return;
  }
  console.log(`Next step: ${next.id}`);
  console.log(`Skill: ${next.skill}`);
  console.log(`Mode: ${mode}`);
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
  const mode = loadPipelineMode(ctx.projectDir);
  const completed = effectiveCompletedSteps(ctx.projectDir);
  console.log(`Marked done: ${step}`);
  console.log(`Marker file: ${path}`);
  console.log(formatNextStepLine(completed, mode));
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

function printHelp(): void {
  console.log('layerkit — agent-first multi-vendor data-layer toolkit\n');
  console.log('Usage:');
  for (const c of cliCommands.filter((x) => x.showInTopLevelHelp)) {
    console.log(`  layerkit ${c.usage}`);
  }
  console.log('\nGlobal flags: --project-dir <path>  (store root; default .layerkit)');
  console.log('Platforms: ' + installPlatformUsage);
  console.log('Cheat sheet: layerkit cheatsheet  (docs/CHEATSHEET.md)');
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
