import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensureLayerkitConfig,
  layerkitConfigPath,
} from '../config/layerkit-config.js';
import { layerkitHookGuidance } from '../hooks/guidance.js';
import { createVendorMemoryStore } from '../vendor-memory/store.js';
import { platformInstaller } from './platforms/index.js';
import { platformDisplayName, type InstallPlatform } from './paths.js';
import { listPackagedSkills } from './skills.js';

export interface InstallOptions {
  repoRoot: string;
  platform: InstallPlatform;
  hooksEnabled: boolean;
  autoMapUpdates: boolean;
  poc: boolean;
  name?: string;
}

export interface InstallResult {
  platform: InstallPlatform;
  platformLabel: string;
  skills: string[];
  skillCount: number;
  hooksRequested: boolean;
  hooks: { events: string[] } | undefined;
  rules: { configFiles: string[] } | undefined;
  autoMapUpdates: boolean;
  configFile: string;
  projectDir: string;
  vendorSlots: number;
  notes: string[];
}

export function defaultPackageRoot(): string {
  // dist/libs/install/install.js → package root
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
}

export async function installLayerkit(opts: InstallOptions): Promise<InstallResult> {
  const packageRoot = defaultPackageRoot();
  const config = ensureLayerkitConfig();
  config.defaultPlatform = opts.platform;
  config.hooksEnabledDefault = opts.hooksEnabled;
  config.autoMapUpdatesDefault = opts.autoMapUpdates;
  writeFileSync(layerkitConfigPath(), JSON.stringify(config, null, 2) + '\n');

  const installer = platformInstaller(opts.platform);
  const platformResult = installer.install({
    repoRoot: opts.repoRoot,
    packageRoot,
    hooksEnabled: opts.hooksEnabled,
  });

  const store = createVendorMemoryStore(opts.repoRoot);
  store.initProject({
    name: opts.name ?? 'commerce-datalayer',
    poc: opts.poc,
  });

  appendAgents(join(opts.repoRoot, 'AGENTS.md'));

  const skills = listPackagedSkills(packageRoot);
  const notes = [...platformResult.notes];
  if (opts.autoMapUpdates && !opts.hooksEnabled) {
    notes.push('auto-map updates require hooks; disabled because --hooks disabled');
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
    autoMapUpdates: opts.hooksEnabled && opts.autoMapUpdates,
    configFile: layerkitConfigPath(),
    projectDir: store.projectDir,
    vendorSlots: store.listMaps().length,
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
