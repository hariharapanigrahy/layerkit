import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensureLayerkitConfig,
  layerkitConfigPath,
} from '../config/layerkit-config.js';
import { isDefaultProjectDir, writePathPointer } from '../config/project-dir.js';
import { layerkitHookGuidance } from '../hooks/guidance.js';
import { createVendorMemoryStore } from '../vendor-memory/store.js';
import { platformInstaller } from './platforms/index.js';
import { platformDisplayName, type InstallPlatform } from './paths.js';
import { listPackagedSkills } from './skills.js';

export interface InstallOptions {
  repoRoot: string;
  platform: InstallPlatform;
  hooksEnabled: boolean;
  mapReminders: boolean;
  poc: boolean;
  name?: string;
  /**
   * Resolved absolute store root (from CLI --project-dir / resolveProjectDir).
   * When omitted, store uses resolveProjectDir(repoRoot) (env → pointer → default).
   */
  projectDir?: string;
  /** Optional config path for hermetic tests/evals. Defaults to ~/.layerkit/config.json. */
  configPath?: string;
  /** Write user-level defaults when explicitly requested. Client installs default to project state only. */
  userConfig?: boolean;
}

export interface InstallResult {
  platform: InstallPlatform;
  platformLabel: string;
  skills: string[];
  skillCount: number;
  hooksRequested: boolean;
  hooks: { events: string[] } | undefined;
  rules: { configFiles: string[] } | undefined;
  mapReminders: boolean;
  configFile: string;
  projectDir: string;
  notes: string[];
}

export function defaultPackageRoot(): string {
  // dist/libs/install/install.js → package root
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
}

export async function installLayerkit(opts: InstallOptions): Promise<InstallResult> {
  const packageRoot = defaultPackageRoot();
  const configPath = opts.configPath ?? layerkitConfigPath();
  if (opts.userConfig === true) {
    const config = ensureLayerkitConfig(configPath);
    config.defaultPlatform = opts.platform;
    config.hooksEnabledDefault = opts.hooksEnabled;
    config.mapRemindersDefault = opts.mapReminders;
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  }

  const installer = platformInstaller(opts.platform);
  const platformResult = installer.install({
    repoRoot: opts.repoRoot,
    packageRoot,
    hooksEnabled: opts.hooksEnabled,
  });

  const store = createVendorMemoryStore(opts.repoRoot, opts.projectDir);
  store.initProject({
    name: opts.name ?? 'commerce-datalayer',
    poc: opts.poc,
  });

  // Persist pointer at repo root when store is non-default so later commands find it
  if (!isDefaultProjectDir(opts.repoRoot, store.projectDir)) {
    const ptr = writePathPointer(opts.repoRoot, store.projectDir);
    if (ptr) {
      platformResult.notes.push(
        `Wrote ${ptr} so subsequent commands resolve this projectDir without --project-dir`,
      );
    }
  }

  appendAgents(join(opts.repoRoot, 'AGENTS.md'));

  const skills = listPackagedSkills(packageRoot);
  const notes = [...platformResult.notes];
  if (opts.mapReminders && !opts.hooksEnabled) {
    notes.push('map-update reminders require hooks; disabled because --hooks disabled');
  }
  if (opts.userConfig !== true) {
    notes.push('Skipped user config write (default; pass --user-config to update user defaults)');
  }

  return {
    platform: opts.platform,
    platformLabel: platformDisplayName(opts.platform),
    skills: platformResult.skillDirs,
    skillCount: skills.length,
    hooksRequested: opts.hooksEnabled,
    hooks:
      platformResult.hookConfigFiles.length > 0
        ? { events: ['UserPromptSubmit', 'Stop'] }
        : undefined,
    rules:
      platformResult.ruleFiles.length > 0
        ? { configFiles: platformResult.ruleFiles }
        : undefined,
    mapReminders: opts.hooksEnabled && opts.mapReminders,
    configFile: configPath,
    projectDir: store.projectDir,
    notes,
  };
}

function appendAgents(path: string): void {
  const block = `\n## Layerkit\n\n${layerkitHookGuidance}\n`;
  if (existsSync(path)) {
    const existing = readFileSync(path, 'utf8');
    if (existing.includes('Layerkit is an agent-first')) return;
    writeFileSync(path, existing + block, 'utf8');
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `# Agent instructions\n${block}`, 'utf8');
  }
}
