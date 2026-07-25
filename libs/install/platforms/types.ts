import type { InstallPlatform } from '../paths.js';

export interface PlatformInstallResult {
  platform: InstallPlatform;
  skillDirs: string[];
  hookConfigFiles: string[];
  ruleFiles: string[];
  notes: string[];
}

export interface PlatformInstaller {
  platform: InstallPlatform;
  /** Install skills + optional hooks/rules into agent home or repo */
  install(opts: {
    repoRoot: string;
    packageRoot: string;
    hooksEnabled: boolean;
  }): PlatformInstallResult;
  /** Optional: map hook session source ref → session id */
  sessionIdFromSourceRef?(ref: string): string | undefined;
}
