import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { InstallPlatform } from '../install/paths.js';

export interface LayerkitConfig {
  version: 1;
  defaultPlatform?: InstallPlatform;
  hooksEnabledDefault: boolean;
  autoMapUpdatesDefault: boolean;
  /** Java package prefix for agent generation tasks */
  javaPackageDefault: string;
  session: {
    stopThreshold: number;
    timeThresholdMinutes: number;
  };
}

export const DEFAULT_CONFIG: LayerkitConfig = {
  version: 1,
  hooksEnabledDefault: true,
  autoMapUpdatesDefault: true,
  javaPackageDefault: 'io.layerkit.generated',
  session: {
    stopThreshold: 3,
    timeThresholdMinutes: 30,
  },
};

export function layerkitHome(): string {
  return join(homedir(), '.layerkit');
}

export function layerkitConfigPath(): string {
  return join(layerkitHome(), 'config.json');
}

export function ensureLayerkitConfig(): LayerkitConfig {
  const path = layerkitConfigPath();
  mkdirSync(layerkitHome(), { recursive: true });
  if (!existsSync(path)) {
    writeFileSync(path, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
    return { ...DEFAULT_CONFIG };
  }
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<LayerkitConfig>;
  return {
    ...DEFAULT_CONFIG,
    ...parsed,
    session: { ...DEFAULT_CONFIG.session, ...parsed.session },
  };
}
