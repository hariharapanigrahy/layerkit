import type { InstallPlatform } from '../paths.js';
import { antigravityInstaller } from './antigravity.js';
import { claudeInstaller } from './claude.js';
import { codexInstaller } from './codex.js';
import { copilotInstaller } from './copilot.js';
import { cursorInstaller } from './cursor.js';
import { devinInstaller } from './devin.js';
import { droidInstaller } from './droid.js';
import { opencodeInstaller } from './opencode.js';
import { openhandsInstaller } from './openhands.js';
import { windsurfInstaller } from './windsurf.js';
import type { PlatformInstaller } from './types.js';

const installers: Record<InstallPlatform, PlatformInstaller> = {
  codex: codexInstaller,
  claude: claudeInstaller,
  cursor: cursorInstaller,
  copilot: copilotInstaller,
  opencode: opencodeInstaller,
  openhands: openhandsInstaller,
  devin: devinInstaller,
  windsurf: windsurfInstaller,
  'factory-droid': droidInstaller,
  antigravity: antigravityInstaller,
};

export function platformInstaller(platform: InstallPlatform): PlatformInstaller {
  return installers[platform];
}

export function allPlatformInstallers(): PlatformInstaller[] {
  return Object.values(installers);
}

export type { PlatformInstaller, PlatformInstallResult } from './types.js';
